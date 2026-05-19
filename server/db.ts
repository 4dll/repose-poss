import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ensureStaffCredentials } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "data", "cafe-pos.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      username TEXT UNIQUE,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      active INTEGER NOT NULL DEFAULT 1,
      category_id INTEGER REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL REFERENCES staff(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT,
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      service_type TEXT NOT NULL DEFAULT 'takeaway',
      table_number INTEGER,
      status TEXT NOT NULL DEFAULT 'paid',
      payment_method TEXT,
      discount_type TEXT,
      discount_value REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      discount_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(id)
    );

    CREATE TABLE IF NOT EXISTS order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      item_name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      line_total REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'visa'))
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      qty_change INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (!columnExists("staff", "username")) {
    db.exec("ALTER TABLE staff ADD COLUMN username TEXT");
  }
  if (!columnExists("staff", "password_hash")) {
    db.exec("ALTER TABLE staff ADD COLUMN password_hash TEXT");
  }
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username ON staff(username) WHERE username IS NOT NULL"
  );

  const staffCount = db.prepare("SELECT COUNT(*) as c FROM staff").get() as { c: number };
  if (staffCount.c === 0) {
    db.prepare("INSERT INTO staff (id, name) VALUES (1, 'Staff 1'), (2, 'Staff 2')").run();
  }

  if (!columnExists("menu_items", "category_id")) {
    db.exec("ALTER TABLE menu_items ADD COLUMN category_id INTEGER REFERENCES categories(id)");
  }
  if (!columnExists("orders", "service_type")) {
    db.exec("ALTER TABLE orders ADD COLUMN service_type TEXT NOT NULL DEFAULT 'takeaway'");
  }
  if (!columnExists("orders", "table_number")) {
    db.exec("ALTER TABLE orders ADD COLUMN table_number INTEGER");
  }
  if (!columnExists("orders", "status")) {
    db.exec("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'paid'");
  }
  if (!columnExists("orders", "payment_method")) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT");
  }
  if (!columnExists("orders", "updated_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN updated_at TEXT");
  }
  if (!columnExists("orders", "cash_amount")) {
    db.exec("ALTER TABLE orders ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0");
  }
  if (!columnExists("orders", "visa_amount")) {
    db.exec("ALTER TABLE orders ADD COLUMN visa_amount REAL NOT NULL DEFAULT 0");
  }
  db.exec(
    `UPDATE orders SET status = 'paid', service_type = 'takeaway'
     WHERE status IS NULL OR status = ''`
  );
  db.exec(
    `UPDATE orders SET cash_amount = total, visa_amount = 0
     WHERE status = 'paid' AND (cash_amount IS NULL OR cash_amount = 0) AND (visa_amount IS NULL OR visa_amount = 0)
       AND (payment_method IS NULL OR payment_method = 'cash')`
  );
  db.exec(
    `UPDATE orders SET cash_amount = 0, visa_amount = total
     WHERE status = 'paid' AND payment_method = 'visa' AND visa_amount = 0`
  );
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_open_dine_table
     ON orders(table_number) WHERE status = 'open' AND service_type = 'dine_in'`
  );

  ensureStaffCredentials();
  ensureDefaultCategories();
}

function ensureDefaultCategories() {
  const count = db.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number };
  if (count.c > 0) return;

  const defaults = [
    ["Hot Drinks", 1],
    ["Cold Drinks", 2],
    ["Food", 3],
    ["Other", 4],
  ];
  const insert = db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)");
  for (const [name, order] of defaults) {
    insert.run(name, order);
  }

  const hot = db.prepare("SELECT id FROM categories WHERE name = 'Hot Drinks'").get() as {
    id: number;
  };
  const cold = db.prepare("SELECT id FROM categories WHERE name = 'Cold Drinks'").get() as {
    id: number;
  };
  const food = db.prepare("SELECT id FROM categories WHERE name = 'Food'").get() as { id: number };
  const other = db.prepare("SELECT id FROM categories WHERE name = 'Other'").get() as {
    id: number;
  };

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

  const update = db.prepare("UPDATE menu_items SET category_id = ? WHERE name = ?");
  for (const n of hotNames) update.run(hot.id, n);
  for (const n of coldNames) update.run(cold.id, n);
  for (const n of foodNames) update.run(food.id, n);
  db.prepare("UPDATE menu_items SET category_id = ? WHERE category_id IS NULL").run(other.id);
}
