import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. Set it to your Supabase Postgres connection string (Project Settings → Database)."
    );
  }
  return new Pool({
    connectionString: url,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 1 : 10,
  });
}

export const pool = getPool();

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(sql, params);
  return result.rowCount ?? 0;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function clientQuery<T = Record<string, unknown>>(
  client: pg.PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await client.query(sql, params);
  return result.rows as T[];
}

export async function clientQueryOne<T = Record<string, unknown>>(
  client: pg.PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const rows = await clientQuery<T>(client, sql, params);
  return rows[0];
}

export async function clientExecute(
  client: pg.PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<number> {
  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}

async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name]
  );
  return Boolean(row?.exists);
}

export async function initDb() {
  const hasStaff = await tableExists("staff");
  if (!hasStaff) {
    throw new Error(
      "Database tables not found. Run supabase/schema.sql in the Supabase SQL Editor first."
    );
  }

  await ensureSchemaUpdates();

  const staffCount = await queryOne<{ c: string }>("SELECT COUNT(*)::int AS c FROM staff");
  if (Number(staffCount?.c) === 0) {
    await execute(
      "INSERT INTO staff (id, name) VALUES (3, 'Kumar'), (4, 'Admin'), (5, 'Aljulanda'), (6, 'Ghassan') ON CONFLICT DO NOTHING"
    );
  }

  const { ensureStaffCredentials } = await import("./auth.js");
  await ensureStaffCredentials();
  await ensureDefaultCategories();
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  );
  return Boolean(row?.exists);
}

async function ensureSchemaUpdates() {
  if (!(await columnExists("menu_items", "cost_price"))) {
    await execute("ALTER TABLE menu_items ADD COLUMN cost_price DOUBLE PRECISION NOT NULL DEFAULT 0");
  }
  if (!(await columnExists("menu_items", "show_on_customer_menu"))) {
    await execute(
      "ALTER TABLE menu_items ADD COLUMN show_on_customer_menu BOOLEAN NOT NULL DEFAULT TRUE"
    );
  }
  if (!(await columnExists("order_lines", "cost_price"))) {
    await execute("ALTER TABLE order_lines ADD COLUMN cost_price DOUBLE PRECISION NOT NULL DEFAULT 0");
  }
  if (!(await columnExists("order_lines", "cost_total"))) {
    await execute("ALTER TABLE order_lines ADD COLUMN cost_total DOUBLE PRECISION NOT NULL DEFAULT 0");
  }
}

async function ensureDefaultCategories() {
  const count = await queryOne<{ c: string }>("SELECT COUNT(*)::int AS c FROM categories");
  if (Number(count?.c) > 0) return;

  const defaults: [string, number][] = [
    ["Hot Drinks", 1],
    ["Cold Drinks", 2],
    ["Food", 3],
    ["Other", 4],
  ];
  for (const [name, order] of defaults) {
    await execute("INSERT INTO categories (name, sort_order) VALUES ($1, $2)", [name, order]);
  }

  const hot = await queryOne<{ id: number }>("SELECT id FROM categories WHERE name = 'Hot Drinks'");
  const cold = await queryOne<{ id: number }>("SELECT id FROM categories WHERE name = 'Cold Drinks'");
  const food = await queryOne<{ id: number }>("SELECT id FROM categories WHERE name = 'Food'");
  const other = await queryOne<{ id: number }>("SELECT id FROM categories WHERE name = 'Other'");
  if (!hot || !cold || !food || !other) return;

  const hotNames = [
    "Espresso",
    "Americano",
    "Latte",
    "Cappuccino",
    "Flat White",
    "Mocha",
    "Hot Chocolate",
    "Tea",
  ];
  const coldNames = ["Water"];
  const foodNames = ["Croissant", "Sandwich", "Muffin"];

  for (const n of hotNames) {
    await execute("UPDATE menu_items SET category_id = $1 WHERE name = $2", [hot.id, n]);
  }
  for (const n of coldNames) {
    await execute("UPDATE menu_items SET category_id = $1 WHERE name = $2", [cold.id, n]);
  }
  for (const n of foodNames) {
    await execute("UPDATE menu_items SET category_id = $1 WHERE name = $2", [food.id, n]);
  }
  await execute("UPDATE menu_items SET category_id = $1 WHERE category_id IS NULL", [other.id]);
}

/** Map report groupBy to PostgreSQL TO_CHAR format (not user-controlled). */
export function periodFormat(groupBy: string | undefined): string {
  if (groupBy === "week") return 'IYYY-"W"IW';
  if (groupBy === "month") return "YYYY-MM";
  return "YYYY-MM-DD";
}
