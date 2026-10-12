import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { publicMenu, parseCustomerMenu, type CustomerMenu } from "../shared/customer-menu.js";
import { createMenuApp } from "../server/menu-app.js";
import { createMenuStore } from "../server/menu-store.js";

const menu: CustomerMenu = {
  categories: [{ id: 1, name: "Coffee", sort_order: 1 }],
  items: [{ id: 1, name: "Espresso", price: 1, stock_qty: 5, category_id: 1 }],
};

test("publication excludes hidden/deleted items and private POS fields", () => {
  const visible = { ...menu.items[0], active: 1, show_on_customer_menu: true, cost_price: 0.2 };
  const result = publicMenu(menu.categories, [visible,
    { ...visible, id: 2, show_on_customer_menu: false }, { ...visible, id: 3, active: 0 }]);
  assert.deepEqual(result, menu);
  assert.deepEqual(parseCustomerMenu({ ...menu, staff: ["secret"], items: [visible] }), menu);
});

test("validation rejects bad prices, stock, duplicate IDs and unknown categories", () => {
  for (const patch of [{ price: -1 }, { price: NaN }, { stock_qty: -1 }, { category_id: 999 }, { name: "" }]) {
    assert.throws(() => parseCustomerMenu({ ...menu, items: [{ ...menu.items[0], ...patch }] }));
  }
  assert.throws(() => parseCustomerMenu({ ...menu, items: [menu.items[0], menu.items[0]] }));
  assert.deepEqual(parseCustomerMenu({ categories: [], items: [] }), { categories: [], items: [] });
  assert.equal(parseCustomerMenu({ categories: [], items: [{ ...menu.items[0], category_id: null }] }).items.length, 1);
});

test("missing setup key fails closed without touching storage", async () => {
  const app = createMenuApp({ publishKey: () => undefined });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/live-menu`, { method: "PUT" });
    assert.equal(response.status, 503);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("Postgres HTTP publication survives reconnects, rejects stale writes, and retries idempotently", {
  skip: !process.env.TEST_DATABASE_URL,
}, async () => {
  // TEST_DATABASE_URL must identify a disposable database, never the POS database.
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const schema = `menu_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE SCHEMA ${schema}`);
  const testPool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const key = "test-publisher-key-" + randomUUID();
  const server = createMenuApp({ store: createMenuStore(testPool), publishKey: () => key }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const put = (body: unknown, token = key) => fetch(`${origin}/api/live-menu`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await (await fetch(`${origin}/api/live-menu`)).json()).menu, null);
    const mutationId = randomUUID();
    const body = { menu, baseRevision: null, mutationId };
    assert.equal((await put(body, "wrong")).status, 401);
    const firstResponse = await put(body);
    assert.equal(firstResponse.status, 200);
    assert.equal(firstResponse.headers.get("cache-control"), "no-store");
    const first = await firstResponse.json();
    assert.deepEqual(first.menu, menu);
    assert.equal((await (await put(body)).json()).revision, first.revision);
    assert.equal((await put({ ...body, mutationId: randomUUID() })).status, 409);
    const changed = { ...menu, items: [{ ...menu.items[0], name: "Double espresso", price: 1.7, stock_qty: 0 }] };
    assert.equal((await put({ menu: changed, baseRevision: first.revision, mutationId: randomUUID() })).status, 200);
    const customer = await (await fetch(`${origin}/api/live-menu`)).json();
    assert.deepEqual(customer.menu, changed);
    assert.deepEqual((await createMenuStore(testPool).read()).menu, changed);
    const empty = { categories: [], items: [] };
    assert.equal((await put({ menu: empty, baseRevision: customer.revision, mutationId: randomUUID() })).status, 200);
    assert.deepEqual((await (await fetch(`${origin}/api/server`)).json()).menu, empty);
    assert.equal((await fetch(`${origin}/api/orders`)).status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await testPool.end();
    await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
});

// Browser storage/network stand-ins exercise the real persistent publishing queue.
const saved = new Map<string, string>();
const events = new EventTarget();
const nativeFetch = globalThis.fetch;
let online = true;
before(() => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { get onLine() { return online; } } });
});
after(() => { globalThis.fetch = nativeFetch; });

test("offline queue survives reload, retries a lost response, and preserves edits made during upload", async () => {
  const sync = await import("../src/menuSync.js");
  let remote = { menu: null as CustomerMenu | null, revision: null as string | null, updatedAt: null as string | null };
  let lastMutation = "";
  let dropResponse = false;
  let onPut: (() => void) | undefined;
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      if (body.mutationId !== lastMutation) {
        if (body.baseRevision !== remote.revision) return Response.json({ error: "Another POS changed the menu." }, { status: 409 });
        remote = { menu: body.menu, revision: randomUUID(), updatedAt: new Date().toISOString() };
        lastMutation = body.mutationId;
        writes++;
      }
      onPut?.();
      onPut = undefined;
      if (dropResponse) { dropResponse = false; throw new Error("Response lost"); }
    }
    return Response.json(remote);
  };
  try {
    await sync.connectMenuSync("https://menu.example.test", "test-key-".repeat(5), menu);
    assert.equal(writes, 1);
    online = false;
    const updated = { ...menu, items: [{ ...menu.items[0], price: 2 }] };
    sync.queueMenuSync(updated);
    await sync.flushMenuSync();
    assert.ok(sync.getMenuSyncState()?.pending);
    assert.equal(remote.menu?.items[0].price, 1);
    const reloaded = await import(`../src/menuSync.ts?reload=${Date.now()}`);
    assert.equal(reloaded.getMenuSyncState()?.pending?.items[0].price, 2);
    online = true;
    dropResponse = true;
    await reloaded.flushMenuSync();
    assert.ok(reloaded.getMenuSyncState()?.outbox);
    assert.equal(writes, 2);
    const newest = { ...menu, items: [{ ...menu.items[0], price: 3 }] };
    onPut = () => reloaded.queueMenuSync(newest);
    await reloaded.flushMenuSync();
    assert.equal(writes, 3);
    assert.equal(remote.menu?.items[0].price, 3);
    assert.equal(reloaded.getMenuSyncState()?.outbox, undefined);
    assert.equal(reloaded.getMenuSyncState()?.pending, undefined);
    assert.equal(reloaded.getMenuSyncState()?.error, undefined);
    remote.revision = randomUUID(); // Simulate another authorized POS publishing.
    reloaded.queueMenuSync(updated);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(reloaded.getMenuSyncState()?.blocked, true);
    assert.equal(remote.menu?.items[0].price, 3);
  } finally {
    globalThis.fetch = nativeFetch;
    online = true;
  }
});
