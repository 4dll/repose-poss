import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db.js";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hash2 = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hash2, "hex"));
  } catch {
    return false;
  }
}

export type StaffAuth = {
  id: number;
  name: string;
  username: string;
  password_hash: string;
};

export function getStaffByUsername(username: string): StaffAuth | undefined {
  return db
    .prepare("SELECT id, name, username, password_hash FROM staff WHERE username = ?")
    .get(username.trim().toLowerCase()) as StaffAuth | undefined;
}

export function verifyStaffCredentials(
  username: string,
  password: string
): StaffAuth | null {
  const staff = getStaffByUsername(username);
  if (!staff?.password_hash) return null;
  if (!verifyPassword(password, staff.password_hash)) return null;
  return staff;
}

export function ensureStaffCredentials() {
  const rows = db.prepare("SELECT id, name, username, password_hash FROM staff").all() as StaffAuth[];
  const defaults: Record<number, { username: string; password: string }> = {
    1: { username: "staff1", password: "staff1" },
    2: { username: "staff2", password: "staff2" },
    3: { username: "ghassan", password: "ghassan" },
  };
  for (const row of rows) {
    const def = defaults[row.id];
    if (!def) continue;
    if (!row.username || !row.password_hash) {
      db.prepare("UPDATE staff SET username = ?, password_hash = ? WHERE id = ?").run(
        def.username,
        hashPassword(def.password),
        row.id
      );
    }
  }
}
