import { parseCustomerMenu, type CustomerMenu, type LiveMenu } from "../shared/customer-menu";

const STORAGE_KEY = "repose-menu-sync-v1";
export const MENU_SYNC_EVENT = "repose-menu-sync-changed";
type Publication = { mutationId: string; menu: CustomerMenu };
export type MenuSyncState = {
  origin: string;
  key: string;
  revision: string | null;
  acknowledged: string;
  pending?: CustomerMenu;
  outbox?: Publication;
  lastPublishedAt?: string;
  error?: string;
  blocked?: boolean;
};
let syncing = false;
let storageError = "";

export function getMenuSyncState(): MenuSyncState | null {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as MenuSyncState | null;
    return state && storageError ? { ...state, error: storageError } : state;
  }
  catch { return null; }
}
function write(state: MenuSyncState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageError = "";
  } catch (error) {
    storageError = "Menu changes could not be queued. Free some browser storage, then reopen the POS to retry.";
    throw error;
  } finally {
    window.dispatchEvent(new Event(MENU_SYNC_EVENT));
  }
}
function mutationId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // getRandomValues is also available when a local POS is served over a LAN HTTP address.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function getMenuOrigin() {
  return getMenuSyncState()?.origin || import.meta.env.VITE_MENU_ORIGIN || window.location.origin;
}
export function getCustomerMenuUrl() { return `${getMenuOrigin()}/menu`; }

export class MenuRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request(origin: string, init?: RequestInit): Promise<LiveMenu> {
  const response = await fetch(`${origin}/api/live-menu`, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Online menu service is not available at this address. Check the deployed website.");
  }
  const data = await response.json();
  if (!response.ok) throw new MenuRequestError(data.error || "Unable to update the online menu.", response.status);
  if (typeof data !== "object" || data === null || !("menu" in data) ||
      !(data.revision === null || typeof data.revision === "string")) throw new Error("Invalid online menu response.");
  return { ...data, menu: data.menu === null ? null : parseCustomerMenu(data.menu) };
}
export async function loadLiveMenu(): Promise<LiveMenu> {
  return request(getMenuOrigin());
}

export function queueMenuSync(menu: CustomerMenu) {
  const state = getMenuSyncState();
  if (!state) return;
  const serialized = JSON.stringify(menu);
  const latest = state.pending ?? state.outbox?.menu;
  if (serialized === (latest ? JSON.stringify(latest) : state.acknowledged)) return;
  state.pending = menu;
  write(state);
  void flushMenuSync();
}

async function flush() {
  if (syncing) return;
  syncing = true;
  try {
    while (true) {
      const state = getMenuSyncState();
      if (!state || state.blocked || (!state.pending && !state.outbox)) return;
      if (!navigator.onLine) {
        state.error = "Offline — menu changes are saved here and will publish when connected.";
        write(state);
        return;
      }
      if (!state.outbox) {
        state.outbox = { mutationId: mutationId(), menu: state.pending! };
        delete state.pending;
        write(state);
      }
      const sent = state.outbox;
      try {
        const result = await request(state.origin, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.key}` },
          body: JSON.stringify({ menu: sent.menu, mutationId: sent.mutationId, baseRevision: state.revision }),
        });
        const current = getMenuSyncState();
        if (!current || current.outbox?.mutationId !== sent.mutationId) return;
        current.revision = result.revision;
        current.acknowledged = JSON.stringify(sent.menu);
        current.lastPublishedAt = result.updatedAt ?? new Date().toISOString();
        delete current.outbox;
        delete current.error;
        if (current.pending && JSON.stringify(current.pending) === current.acknowledged) delete current.pending;
        write(current);
      } catch (error) {
        const current = getMenuSyncState();
        if (!current || current.outbox?.mutationId !== sent.mutationId) return;
        current.error = error instanceof MenuRequestError ? error.message
          : "Unable to reach the online menu. Changes are saved here and will retry automatically.";
        current.blocked = error instanceof MenuRequestError && [400, 401, 409, 413].includes(error.status);
        write(current);
        return;
      }
    }
  } finally {
    syncing = false;
  }
}

export async function flushMenuSync() {
  // Serialize across POS tabs as well as within one tab. Revisions also guard other devices.
  try {
    if (navigator.locks) await navigator.locks.request("repose-menu-publish", flush);
    else await flush();
  } catch {
    // A local storage failure must never turn a completed local sale into a failed sale.
    window.dispatchEvent(new Event(MENU_SYNC_EVENT));
  }
}

export async function connectMenuSync(address: string, key: string, menu: CustomerMenu) {
  const url = new URL(address);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Use an HTTPS website address.");
  }
  if (url.username || url.password) throw new Error("Use a website address without credentials.");
  if (key.trim().length < 32) throw new Error("Enter the menu setup key provided when online publishing was configured.");
  if (syncing) throw new Error("A menu update is in progress. Please wait a moment.");
  const remote = await request(url.origin);
  write({ origin: url.origin, key: key.trim(), revision: remote.revision,
    acknowledged: "", pending: menu });
  await flushMenuSync();
  const result = getMenuSyncState();
  if (result?.error) throw new Error(result.error);
}

export function startMenuSync(getMenu: () => CustomerMenu) {
  const retry = () => {
    try { queueMenuSync(getMenu()); void flushMenuSync(); }
    catch { /* local POS remains usable if publishing storage is unavailable */ }
  };
  retry();
  const timer = window.setInterval(retry, 10000);
  window.addEventListener("online", retry);
  window.addEventListener("focus", retry);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("online", retry);
    window.removeEventListener("focus", retry);
  };
}
