import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { db, initDb } from "./db.js";
import { verifyStaffCredentials } from "./auth.js";
import {
  TABLE_COUNT,
  cancelOpenOrder,
  createOpenTableOrder,
  createTakeawayOrder,
  getOpenTableOrder,
  getOrderWithLines,
  payOrder,
  updateOpenOrder,
} from "./orders.js";

initDb();

const app = express();
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Staff & Shifts ---

app.get("/api/staff", (_req, res) => {
  res.json(
    db.prepare("SELECT id, name, username FROM staff ORDER BY id").all()
  );
});

app.get("/api/shifts/active", (_req, res) => {
  const shifts = db
    .prepare(
      `SELECT s.*, st.name as staff_name, st.username as staff_username
       FROM shifts s
       JOIN staff st ON st.id = s.staff_id
       WHERE s.ended_at IS NULL
       ORDER BY s.started_at`
    )
    .all();
  res.json(shifts);
});

app.post("/api/shifts/open", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const staff = verifyStaffCredentials(username, password);
  if (!staff) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  const existing = db
    .prepare("SELECT id FROM shifts WHERE staff_id = ? AND ended_at IS NULL")
    .get(staff.id);
  if (existing) {
    return res.status(400).json({ error: "You already have an open shift" });
  }

  const activeCount = db
    .prepare("SELECT COUNT(*) as c FROM shifts WHERE ended_at IS NULL")
    .get() as { c: number };
  if (activeCount.c >= 2) {
    return res.status(400).json({
      error: "Both shifts are open. Wait until the other employee ends their shift.",
    });
  }

  db.prepare("INSERT INTO shifts (staff_id, started_at) VALUES (?, datetime('now'))").run(
    staff.id
  );
  const shiftId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };

  const shift = db
    .prepare(
      `SELECT s.*, st.name as staff_name FROM shifts s
       JOIN staff st ON st.id = s.staff_id WHERE s.id = ?`
    )
    .get(shiftId.id);
  res.json(shift);
});

app.post("/api/shifts/:id/close", (req, res) => {
  const shiftId = Number(req.params.id);
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required to end shift" });
  }

  const staff = verifyStaffCredentials(username, password);
  if (!staff) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  const shift = db.prepare("SELECT * FROM shifts WHERE id = ?").get(shiftId) as
    | { id: number; staff_id: number; ended_at: string | null }
    | undefined;
  if (!shift) return res.status(404).json({ error: "Shift not found" });
  if (shift.ended_at) {
    return res.status(400).json({ error: "Shift already closed" });
  }
  if (shift.staff_id !== staff.id) {
    return res.status(403).json({ error: "You can only end your own shift" });
  }

  db.prepare("UPDATE shifts SET ended_at = datetime('now') WHERE id = ?").run(shiftId);
  res.json(getShiftReport(shiftId));
});

function getShiftReport(shiftId: number) {
  const shift = db
    .prepare(
      `SELECT s.*, st.name as staff_name FROM shifts s
       JOIN staff st ON st.id = s.staff_id WHERE s.id = ?`
    )
    .get(shiftId);

  const lines = db
    .prepare(
      `SELECT ol.*, o.created_at as order_time, o.discount_amount, o.discount_type, o.discount_value
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE o.shift_id = ? AND o.status = 'paid'
       ORDER BY o.created_at, ol.id`
    )
    .all(shiftId);

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(o.cash_amount), 0) as cash_total,
         COALESCE(SUM(o.visa_amount), 0) as visa_total,
         COALESCE(SUM(ol.qty), 0) as items_sold,
         COUNT(DISTINCT o.id) as order_count
       FROM orders o
       JOIN order_lines ol ON ol.order_id = o.id
       WHERE o.shift_id = ? AND o.status = 'paid'`
    )
    .get(shiftId) as {
    cash_total: number;
    visa_total: number;
    items_sold: number;
    order_count: number;
  };

  const discountTotal = db
    .prepare(
      `SELECT COALESCE(SUM(discount_amount), 0) as total FROM orders
       WHERE shift_id = ? AND status = 'paid'`
    )
    .get(shiftId) as { total: number };

  return {
    shift,
    lines,
    summary: {
      ...totals,
      grand_total: totals.cash_total + totals.visa_total,
      discount_total: discountTotal.total,
    },
  };
}

app.get("/api/shifts/:id/report", (req, res) => {
  const report = getShiftReport(Number(req.params.id));
  if (!report.shift) return res.status(404).json({ error: "Not found" });
  res.json(report);
});

app.get("/api/shifts", (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT s.*, st.name as staff_name FROM shifts s
             JOIN staff st ON st.id = s.staff_id WHERE 1=1`;
  const params: string[] = [];
  if (from) {
    sql += " AND date(s.started_at) >= date(?)";
    params.push(String(from));
  }
  if (to) {
    sql += " AND date(s.started_at) <= date(?)";
    params.push(String(to));
  }
  sql += " ORDER BY s.started_at DESC LIMIT 100";
  res.json(db.prepare(sql).all(...params));
});

// --- Categories ---

app.get("/api/categories", (_req, res) => {
  res.json(
    db.prepare("SELECT * FROM categories ORDER BY sort_order, name").all()
  );
});

app.post("/api/categories", (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Category name required" });
  const maxOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) as m FROM categories").get() as {
    m: number;
  };
  try {
    db.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)").run(
      name.trim(),
      maxOrder.m + 1
    );
  } catch {
    return res.status(400).json({ error: "Category already exists" });
  }
  const newId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
  res.json(db.prepare("SELECT * FROM categories WHERE id = ?").get(newId.id));
});

function menuSelect() {
  return `SELECT m.*, c.name as category_name
    FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id`;
}

// --- Menu ---

app.get("/api/menu", (_req, res) => {
  res.json(
    db
      .prepare(`${menuSelect()} WHERE m.active = 1 ORDER BY c.sort_order, m.name`)
      .all()
  );
});

app.get("/api/menu/all", (_req, res) => {
  res.json(db.prepare(`${menuSelect()} ORDER BY c.sort_order, m.name`).all());
});

app.post("/api/menu", (req, res) => {
  const { name, price, stockQty, lowStockThreshold, categoryId } = req.body;
  if (!name || price == null) return res.status(400).json({ error: "Name and price required" });
  if (!categoryId) return res.status(400).json({ error: "Category required" });

  const cat = db.prepare("SELECT id FROM categories WHERE id = ?").get(categoryId);
  if (!cat) return res.status(400).json({ error: "Invalid category" });

  db.prepare(
    `INSERT INTO menu_items (name, price, stock_qty, low_stock_threshold, category_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(name, price, stockQty ?? 0, lowStockThreshold ?? 5, categoryId);
  const newId = db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
  res.json(
    db.prepare(`${menuSelect()} WHERE m.id = ?`).get(newId.id)
  );
});

app.patch("/api/menu/:id", (req, res) => {
  const id = Number(req.params.id);
  const { name, price, stockQty, lowStockThreshold, active } = req.body;
  const item = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
  if (!item) return res.status(404).json({ error: "Not found" });

  db.prepare(
    `UPDATE menu_items SET
      name = COALESCE(?, name),
      price = COALESCE(?, price),
      stock_qty = COALESCE(?, stock_qty),
      low_stock_threshold = COALESCE(?, low_stock_threshold),
      active = COALESCE(?, active),
      category_id = COALESCE(?, category_id)
     WHERE id = ?`
  ).run(
    name ?? null,
    price ?? null,
    stockQty ?? null,
    lowStockThreshold ?? null,
    active ?? null,
    req.body.categoryId ?? null,
    id
  );

  res.json(db.prepare(`${menuSelect()} WHERE m.id = ?`).get(id));
});

// --- Tables & Orders ---

app.get("/api/tables", (_req, res) => {
  const tables = [];
  for (let n = 1; n <= TABLE_COUNT; n++) {
    const open = getOpenTableOrder(n) as
      | {
          id: number;
          total: number;
          created_at: string;
        }
      | undefined;
    if (open) {
      const itemCount = db
        .prepare("SELECT COALESCE(SUM(qty), 0) as c FROM order_lines WHERE order_id = ?")
        .get(open.id) as { c: number };
      tables.push({
        number: n,
        status: "occupied",
        orderId: open.id,
        total: open.total,
        itemCount: itemCount.c,
        since: open.created_at,
      });
    } else {
      tables.push({ number: n, status: "free" });
    }
  }
  res.json(tables);
});

app.post("/api/tables/:number/open", (req, res) => {
  const tableNumber = Number(req.params.number);
  const { shiftId } = req.body;
  if (!shiftId) return res.status(400).json({ error: "Shift required" });
  if (tableNumber < 1 || tableNumber > TABLE_COUNT) {
    return res.status(400).json({ error: "Invalid table" });
  }

  const shift = db.prepare("SELECT id FROM shifts WHERE id = ? AND ended_at IS NULL").get(shiftId);
  if (!shift) return res.status(400).json({ error: "Shift not open" });

  try {
    const orderId = createOpenTableOrder(shiftId, tableNumber);
    const full = getOrderWithLines(orderId);
    res.json(full);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get("/api/orders/:id", (req, res) => {
  const full = getOrderWithLines(Number(req.params.id));
  if (!full) return res.status(404).json({ error: "Not found" });
  res.json(full);
});

app.put("/api/orders/:id", (req, res) => {
  const orderId = Number(req.params.id);
  const { lines, discountType, discountValue } = req.body;
  if (!lines) return res.status(400).json({ error: "Lines required" });

  try {
    db.exec("BEGIN IMMEDIATE");
    const result = updateOpenOrder(orderId, lines, discountType, discountValue);
    db.exec("COMMIT");
    res.json(result);
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post("/api/orders/:id/pay", (req, res) => {
  const orderId = Number(req.params.id);
  const { cashAmount, visaAmount, paymentMethod } = req.body;
  const cash =
    cashAmount != null
      ? Number(cashAmount)
      : paymentMethod === "visa"
        ? 0
        : paymentMethod === "cash"
          ? undefined
          : null;
  const visa =
    visaAmount != null
      ? Number(visaAmount)
      : paymentMethod === "cash"
        ? 0
        : paymentMethod === "visa"
          ? undefined
          : null;

  if (cash == null && visa == null) {
    return res.status(400).json({ error: "Payment amounts required" });
  }

  try {
    db.exec("BEGIN IMMEDIATE");
    const order = db.prepare("SELECT total FROM orders WHERE id = ?").get(orderId) as
      | { total: number }
      | undefined;
    if (!order) throw new Error("Order not found");
    const resolvedCash = cash ?? order.total - (visa ?? 0);
    const resolvedVisa = visa ?? order.total - resolvedCash;
    const result = payOrder(orderId, { cashAmount: resolvedCash, visaAmount: resolvedVisa });
    db.exec("COMMIT");
    res.json(result);
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: (e as Error).message });
  }
});

app.delete("/api/orders/:id", (req, res) => {
  const orderId = Number(req.params.id);
  try {
    db.exec("BEGIN IMMEDIATE");
    cancelOpenOrder(orderId);
    db.exec("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: (e as Error).message });
  }
});

app.post("/api/orders", (req, res) => {
  const { shiftId, lines, discountType, discountValue, cashAmount, visaAmount, paymentMethod } =
    req.body;
  if (!shiftId || !lines?.length) {
    return res.status(400).json({ error: "Shift and items required" });
  }

  const shift = db.prepare("SELECT * FROM shifts WHERE id = ? AND ended_at IS NULL").get(shiftId);
  if (!shift) return res.status(400).json({ error: "Shift not open" });

  try {
    db.exec("BEGIN IMMEDIATE");
    const subtotal = lines.reduce(
      (s: number, l: { qty: number; unitPrice: number }) => s + l.qty * l.unitPrice,
      0
    );
    let discountAmount = 0;
    const dVal = Number(req.body.discountValue) || 0;
    if (discountType === "percent" && dVal > 0) {
      discountAmount = Math.min(subtotal, (subtotal * dVal) / 100);
    } else if (discountType === "fixed" && dVal > 0) {
      discountAmount = Math.min(subtotal, dVal);
    }
    const total = subtotal - discountAmount;

    let cash = cashAmount != null ? Number(cashAmount) : null;
    let visa = visaAmount != null ? Number(visaAmount) : null;
    if (paymentMethod === "cash") {
      cash = total;
      visa = 0;
    } else if (paymentMethod === "visa") {
      cash = 0;
      visa = total;
    }
    if (cash == null || visa == null) {
      throw new Error("Payment required (cash and visa amounts)");
    }

    const result = createTakeawayOrder(
      shiftId,
      lines,
      { cashAmount: cash, visaAmount: visa },
      discountType,
      discountValue
    );
    db.exec("COMMIT");
    res.json(result);
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    res.status(400).json({ error: (e as Error).message });
  }
});

// --- Stock ---

app.get("/api/stock", (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT m.*, c.name as category_name,
          (m.stock_qty <= m.low_stock_threshold) as is_low_stock
         FROM menu_items m
         LEFT JOIN categories c ON c.id = m.category_id
         WHERE m.active = 1 ORDER BY c.sort_order, m.name`
      )
      .all()
  );
});

app.post("/api/stock/:id/adjust", (req, res) => {
  const id = Number(req.params.id);
  const { qtyChange, reason } = req.body;
  if (qtyChange == null) return res.status(400).json({ error: "qtyChange required" });

  const item = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
  if (!item) return res.status(404).json({ error: "Not found" });

  const newQty = (item as { stock_qty: number }).stock_qty + qtyChange;
  if (newQty < 0) return res.status(400).json({ error: "Stock cannot go below 0" });

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE menu_items SET stock_qty = ? WHERE id = ?").run(newQty, id);
    db.prepare(
      "INSERT INTO stock_adjustments (menu_item_id, qty_change, reason) VALUES (?, ?, ?)"
    ).run(id, qtyChange, reason || null);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  res.json(db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id));
});

// --- Reports ---

app.get("/api/reports/daily", (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  res.json(getPeriodReport(date, date));
});

app.get("/api/reports/monthly", (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const from = `${month}-01`;
  const lastDay = new Date(
    parseInt(month.slice(0, 4)),
    parseInt(month.slice(5, 7)),
    0
  ).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  res.json(getPeriodReport(from, to));
});

app.get("/api/reports/range", (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to dates required" });
  res.json(getPeriodReport(String(from), String(to)));
});

function getPeriodReport(from: string, to: string) {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(o.cash_amount), 0) as cash_total,
         COALESCE(SUM(o.visa_amount), 0) as visa_total,
         COALESCE(SUM(ol.qty), 0) as items_sold,
         COUNT(DISTINCT o.id) as order_count
       FROM orders o
       JOIN order_lines ol ON ol.order_id = o.id
       WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
         AND o.status = 'paid'`
    )
    .get(from, to);

  const discounts = db
    .prepare(
      `SELECT COALESCE(SUM(discount_amount), 0) as total FROM orders
       WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
         AND status = 'paid'`
    )
    .get(from, to) as { total: number };

  const byDay = db
    .prepare(
      `SELECT date(o.created_at) as day,
         SUM(ol.line_total) as revenue,
         SUM(ol.qty) as items
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
         AND o.status = 'paid'
       GROUP BY date(o.created_at)
       ORDER BY day`
    )
    .all(from, to);

  return {
    from,
    to,
    summary: {
      ...(totals as object),
      grand_total:
        (totals as { cash_total: number; visa_total: number }).cash_total +
        (totals as { cash_total: number; visa_total: number }).visa_total,
      discount_total: discounts.total,
    },
    byDay,
  };
}

app.get("/api/reports/items", (req, res) => {
  const { from, to, groupBy } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  const group = groupBy === "week" ? "%Y-W%W" : groupBy === "month" ? "%Y-%m" : "%Y-%m-%d";

  const items = db
    .prepare(
      `SELECT
         ol.menu_item_id,
         ol.item_name,
         strftime(?, o.created_at) as period,
         SUM(ol.qty) as qty_sold,
         SUM(ol.line_total) as revenue
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
         AND o.status = 'paid'
       GROUP BY ol.menu_item_id, ol.item_name, period
       ORDER BY period, qty_sold DESC`
    )
    .all(group, String(from), String(to));

  const totals = db
    .prepare(
      `SELECT ol.item_name, SUM(ol.qty) as qty_sold, SUM(ol.line_total) as revenue
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?)
         AND o.status = 'paid'
       GROUP BY ol.menu_item_id, ol.item_name
       ORDER BY qty_sold DESC`
    )
    .all(String(from), String(to));

  res.json({ from, to, groupBy: groupBy || "day", items, totals });
});

// Serve built frontend in production
const clientDist = path.join(__dirname, "..", "dist", "client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Run npm run build first, or use npm run dev");
  });
});

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Repose Cafe POS API running on http://${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.log(`Other devices on your network can use http://<this-computer-ip>:${PORT}`);
  }
});
