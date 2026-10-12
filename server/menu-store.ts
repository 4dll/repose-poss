import pg from "pg";
import { randomUUID } from "node:crypto";
import type { CustomerMenu, LiveMenu } from "../shared/customer-menu.js";

export interface MenuStore {
  read(): Promise<LiveMenu>;
  publish(menu: CustomerMenu, baseRevision: string | null, mutationId: string): Promise<LiveMenu | null>;
}

export function createMenuStore(pool: pg.Pool): MenuStore {
  let ready: Promise<unknown> | undefined;
  function init() {
    ready ??= pool.query(`CREATE TABLE IF NOT EXISTS customer_menu_publication (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      menu JSONB,
      revision TEXT,
      mutation_id TEXT,
      updated_at TIMESTAMPTZ
    )`).then(() => pool.query("ALTER TABLE customer_menu_publication ENABLE ROW LEVEL SECURITY"))
      .then(() => pool.query("INSERT INTO customer_menu_publication (id) VALUES (1) ON CONFLICT DO NOTHING"))
      .catch((error) => { ready = undefined; throw error; });
    return ready;
  }
  const select = `SELECT menu, revision, updated_at AS "updatedAt" FROM customer_menu_publication WHERE id = 1`;
  return {
    async read() {
      await init();
      return (await pool.query<LiveMenu>(select)).rows[0];
    },
    async publish(menu, baseRevision, mutationId) {
      await init();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const row = (await client.query<LiveMenu & { mutation_id: string }>(
          `SELECT menu, revision, mutation_id, updated_at AS "updatedAt"
           FROM customer_menu_publication WHERE id = 1 FOR UPDATE`
        )).rows[0];
        // Retrying after a lost response must not publish twice or conflict with itself.
        if (row.mutation_id === mutationId) {
          await client.query("COMMIT");
          return { menu: row.menu, revision: row.revision, updatedAt: row.updatedAt };
        }
        if (row.revision !== baseRevision) {
          await client.query("ROLLBACK");
          return null;
        }
        const result = await client.query<LiveMenu>(
          `UPDATE customer_menu_publication SET menu = $1::jsonb, revision = $2,
           mutation_id = $3, updated_at = NOW() WHERE id = 1
           RETURNING menu, revision, updated_at AS "updatedAt"`,
          [JSON.stringify(menu), randomUUID(), mutationId]
        );
        await client.query("COMMIT");
        return result.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

let store: MenuStore | undefined;
export function getMenuStore(): MenuStore {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!store) {
    const url = new URL(process.env.DATABASE_URL);
    store = createMenuStore(new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? false : { rejectUnauthorized: true },
      max: 2,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10000,
    }));
  }
  return store;
}
