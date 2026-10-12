import pg from "pg";
import { randomUUID } from "node:crypto";
import { rootCertificates } from "node:tls";
import { SUPABASE_ROOT_CA } from "./supabase-ca.js";
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
export function menuPoolConfig(connectionString: string): pg.PoolConfig {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const supabase = url.hostname.endsWith(".pooler.supabase.com") ||
    /^db\.[a-z0-9]+\.supabase\.co$/.test(url.hostname);
  // pg parses SSL URL options after the config object and can discard its CA.
  // Keep remote connections fully verified, even with ?sslmode=require in a copied URL.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    ssl: local ? false : {
      rejectUnauthorized: true,
      ...(supabase ? { ca: [...rootCertificates, SUPABASE_ROOT_CA] } : {}),
    },
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  };
}

export function getMenuStore(): MenuStore {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!store) {
    store = createMenuStore(new pg.Pool(menuPoolConfig(process.env.DATABASE_URL)));
  }
  return store;
}
