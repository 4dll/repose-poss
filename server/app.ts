import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import {
  clientExecute,
  execute,
  periodFormat,
  query,
  queryOne,
  transaction,
} from "./db.js";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbReady = false;

export async function createApp() {
  if (!dbReady) {
    const { initDb } = await import("./db.js");
    await initDb();
    dbReady = true;
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Vercel: all /api/* requests are rewritten to /api/server?__vp=<rest> so one
  // serverless entry exists. Restore the real path before Express routing.
  app.use((req, _res, next) => {
    const raw = req.url ?? "/";
    if (process.env.VERCEL && raw.includes("__vp=")) {
      try {
        const u = new URL(raw, "http://internal.local");
        const inner = u.searchParams.get("__vp");
        if (inner !== null) {
          u.searchParams.delete("__vp");
          const decoded = decodeURIComponent(inner.replace(/^\/+/, ""));
          const q = u.searchParams.toString();
          req.url = `/api/${decoded}${q ? `?${q}` : ""}`;
        }
      } catch {
        /* keep raw */
      }
      next();
      return;
    }
    const pathOnly = raw.split("?")[0];
    if (!pathOnly.startsWith("/api")) {
      const qs = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
      req.url = `/api${pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`}${qs}`;
    }
    next();
  });

  app.get("/api/staff", async (_req, res) => {
    try {
      res.json(await query("SELECT id, name, username FROM staff ORDER BY id"));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const staff = await verifyStaffCredentials(username, password);
      if (!staff) return res.status(401).json({ error: "Wrong username or password" });
      res.json({ id: staff.id, name: staff.name, username: staff.username });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/shifts/active", async (_req, res) => {
    try {
      res.json(
        await query(
          `SELECT s.*, st.name as staff_name, st.username as staff_username
           FROM shifts s
           JOIN staff st ON st.id = s.staff_id
           WHERE s.ended_at IS NULL
           ORDER BY s.started_at`
        )
      );
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/shifts/open", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const staff = await verifyStaffCredentials(username, password);
      if (!staff) return res.status(401).json({ error: "Wrong username or password" });

      const existing = await queryOne("SELECT id FROM shifts WHERE staff_id = $1 AND ended_at IS NULL", [
        staff.id,
      ]);
      if (existing) return res.status(400).json({ error: "You already have an open shift" });

      const activeCount = await queryOne<{ c: string }>(
        "SELECT COUNT(*)::int AS c FROM shifts WHERE ended_at IS NULL"
      );
      if (Number(activeCount?.c) >= 2) {
        return res.status(400).json({
          error: "Both shifts are open. Wait until the other employee ends their shift.",
        });
      }

      const shift = await queryOne(
        `INSERT INTO shifts (staff_id, started_at) VALUES ($1, NOW())
         RETURNING id`,
        [staff.id]
      );
      const shiftId = (shift as { id: number }).id;

      const full = await queryOne(
        `SELECT s.*, st.name as staff_name FROM shifts s
         JOIN staff st ON st.id = s.staff_id WHERE s.id = $1`,
        [shiftId]
      );
      res.json(full);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/shifts/:id/close", async (req, res) => {
    try {
      const shiftId = Number(req.params.id);
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required to end shift" });
      }

      const staff = await verifyStaffCredentials(username, password);
      if (!staff) return res.status(401).json({ error: "Wrong username or password" });

      const shift = await queryOne<{ id: number; staff_id: number; ended_at: string | null }>(
        "SELECT * FROM shifts WHERE id = $1",
        [shiftId]
      );
      if (!shift) return res.status(404).json({ error: "Shift not found" });
      if (shift.ended_at) return res.status(400).json({ error: "Shift already closed" });
      if (shift.staff_id !== staff.id) {
        return res.status(403).json({ error: "You can only end your own shift" });
      }

      await execute("UPDATE shifts SET ended_at = NOW() WHERE id = $1", [shiftId]);
      res.json(await getShiftReport(shiftId));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  async function getShiftReport(shiftId: number) {
    const shift = await queryOne(
      `SELECT s.*, st.name as staff_name FROM shifts s
       JOIN staff st ON st.id = s.staff_id WHERE s.id = $1`,
      [shiftId]
    );

    const lines = await query(
      `SELECT ol.*, o.created_at as order_time, o.discount_amount, o.discount_type, o.discount_value
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE o.shift_id = $1 AND o.status = 'paid'
       ORDER BY o.created_at, ol.id`,
      [shiftId]
    );

    const orderTotals = await queryOne<{
      cash_total: number;
      visa_total: number;
      order_count: number;
    }>(
      `SELECT
         COALESCE(SUM(cash_amount), 0) as cash_total,
         COALESCE(SUM(visa_amount), 0) as visa_total,
         COUNT(*) as order_count
       FROM orders
       WHERE shift_id = $1 AND status = 'paid'`,
      [shiftId]
    );

    const lineTotals = await queryOne<{
      items_sold: number;
      cost_total: number;
    }>(
      `SELECT
         COALESCE(SUM(ol.qty), 0) as items_sold,
         COALESCE(SUM(ol.cost_total), 0) as cost_total
       FROM orders o
       JOIN order_lines ol ON ol.order_id = o.id
       WHERE o.shift_id = $1 AND o.status = 'paid'`,
      [shiftId]
    );

    const discountTotal = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(discount_amount), 0) as total FROM orders
       WHERE shift_id = $1 AND status = 'paid'`,
      [shiftId]
    );

    return {
      shift,
      lines,
      summary: {
        ...orderTotals,
        ...lineTotals,
        grand_total: Number(orderTotals?.cash_total) + Number(orderTotals?.visa_total),
        profit_total:
          Number(orderTotals?.cash_total) +
          Number(orderTotals?.visa_total) -
          Number(lineTotals?.cost_total),
        discount_total: discountTotal?.total ?? 0,
      },
    };
  }

  app.get("/api/shifts/:id/report", async (req, res) => {
    try {
      const report = await getShiftReport(Number(req.params.id));
      if (!report.shift) return res.status(404).json({ error: "Not found" });
      res.json(report);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/shifts", async (req, res) => {
    try {
      const { from, to } = req.query;
      let sql = `SELECT s.*, st.name as staff_name FROM shifts s
                 JOIN staff st ON st.id = s.staff_id WHERE 1=1`;
      const params: unknown[] = [];
      let n = 1;
      if (from) {
        sql += ` AND s.started_at::date >= $${n++}::date`;
        params.push(String(from));
      }
      if (to) {
        sql += ` AND s.started_at::date <= $${n++}::date`;
        params.push(String(to));
      }
      sql += " ORDER BY s.started_at DESC LIMIT 100";
      res.json(await query(sql, params));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/categories", async (_req, res) => {
    try {
      res.json(await query("SELECT * FROM categories ORDER BY sort_order, name"));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/categories", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name?.trim()) return res.status(400).json({ error: "Category name required" });
      const maxOrder = await queryOne<{ m: number }>(
        "SELECT COALESCE(MAX(sort_order), 0) as m FROM categories"
      );
      try {
        const row = await queryOne(
          "INSERT INTO categories (name, sort_order) VALUES ($1, $2) RETURNING *",
          [name.trim(), Number(maxOrder?.m) + 1]
        );
        res.json(row);
      } catch {
        return res.status(400).json({ error: "Category already exists" });
      }
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  const menuSelect = `SELECT m.*, c.name as category_name
    FROM menu_items m
    LEFT JOIN categories c ON c.id = m.category_id`;

  app.get("/api/menu", async (_req, res) => {
    try {
      res.json(
        await query(`${menuSelect} WHERE m.active = TRUE ORDER BY c.sort_order, m.name`)
      );
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/menu/customer", async (_req, res) => {
    try {
      res.json(
        await query(
          `${menuSelect}
           WHERE m.active = TRUE AND m.show_on_customer_menu = TRUE
           ORDER BY c.sort_order, m.name`
        )
      );
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/menu/all", async (_req, res) => {
    try {
      res.json(await query(`${menuSelect} ORDER BY c.sort_order, m.name`));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/menu", async (req, res) => {
    try {
      const {
        name,
        price,
        costPrice,
        stockQty,
        lowStockThreshold,
        categoryId,
        showOnCustomerMenu,
      } = req.body;
      if (!name || price == null) return res.status(400).json({ error: "Name and price required" });
      if (!categoryId) return res.status(400).json({ error: "Category required" });

      const cat = await queryOne("SELECT id FROM categories WHERE id = $1", [categoryId]);
      if (!cat) return res.status(400).json({ error: "Invalid category" });

      const row = await queryOne(
        `INSERT INTO menu_items
          (name, price, cost_price, stock_qty, low_stock_threshold, category_id, show_on_customer_menu)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          name,
          price,
          costPrice ?? 0,
          stockQty ?? 0,
          lowStockThreshold ?? 5,
          categoryId,
          showOnCustomerMenu ?? true,
        ]
      );
      res.json(await queryOne(`${menuSelect} WHERE m.id = $1`, [(row as { id: number }).id]));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.patch("/api/menu/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const {
        name,
        price,
        costPrice,
        stockQty,
        lowStockThreshold,
        active,
        showOnCustomerMenu,
      } = req.body;
      const item = await queryOne("SELECT * FROM menu_items WHERE id = $1", [id]);
      if (!item) return res.status(404).json({ error: "Not found" });

      await execute(
        `UPDATE menu_items SET
          name = COALESCE($1, name),
          price = COALESCE($2, price),
          cost_price = COALESCE($3, cost_price),
          stock_qty = COALESCE($4, stock_qty),
          low_stock_threshold = COALESCE($5, low_stock_threshold),
          active = COALESCE($6, active),
          category_id = COALESCE($7, category_id),
          show_on_customer_menu = COALESCE($8, show_on_customer_menu)
         WHERE id = $9`,
        [
          name ?? null,
          price ?? null,
          costPrice ?? null,
          stockQty ?? null,
          lowStockThreshold ?? null,
          active ?? null,
          req.body.categoryId ?? null,
          showOnCustomerMenu ?? null,
          id,
        ]
      );

      res.json(await queryOne(`${menuSelect} WHERE m.id = $1`, [id]));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.delete("/api/menu/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const item = await queryOne("SELECT * FROM menu_items WHERE id = $1", [id]);
      if (!item) return res.status(404).json({ error: "Not found" });
      await execute("UPDATE menu_items SET active = FALSE WHERE id = $1", [id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/tables", async (_req, res) => {
    try {
      const tables = [];
      for (let n = 1; n <= TABLE_COUNT; n++) {
        const open = (await getOpenTableOrder(n)) as
          | { id: number; total: number; created_at: string }
          | undefined;
        if (open) {
          const itemCount = await queryOne<{ c: string }>(
            "SELECT COALESCE(SUM(qty), 0)::int AS c FROM order_lines WHERE order_id = $1",
            [open.id]
          );
          tables.push({
            number: n,
            status: "occupied",
            orderId: open.id,
            total: open.total,
            itemCount: Number(itemCount?.c),
            since: open.created_at,
          });
        } else {
          tables.push({ number: n, status: "free" });
        }
      }
      res.json(tables);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/tables/:number/open", async (req, res) => {
    try {
      const tableNumber = Number(req.params.number);
      const { shiftId } = req.body;
      if (!shiftId) return res.status(400).json({ error: "Shift required" });
      if (tableNumber < 1 || tableNumber > TABLE_COUNT) {
        return res.status(400).json({ error: "Invalid table" });
      }

      const shift = await queryOne("SELECT id FROM shifts WHERE id = $1 AND ended_at IS NULL", [
        shiftId,
      ]);
      if (!shift) return res.status(400).json({ error: "Shift not open" });

      const orderId = await createOpenTableOrder(shiftId, tableNumber);
      res.json(await getOrderWithLines(orderId));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get("/api/orders/:id", async (req, res) => {
    try {
      const full = await getOrderWithLines(Number(req.params.id));
      if (!full) return res.status(404).json({ error: "Not found" });
      res.json(full);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.put("/api/orders/:id", async (req, res) => {
    try {
      const orderId = Number(req.params.id);
      const { lines, discountType, discountValue } = req.body;
      if (!lines) return res.status(400).json({ error: "Lines required" });
      res.json(await updateOpenOrder(orderId, lines, discountType, discountValue));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post("/api/orders/:id/pay", async (req, res) => {
    try {
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

      const order = await queryOne<{ total: number }>("SELECT total FROM orders WHERE id = $1", [
        orderId,
      ]);
      if (!order) return res.status(400).json({ error: "Order not found" });
      const resolvedCash = cash ?? order.total - (visa ?? 0);
      const resolvedVisa = visa ?? order.total - resolvedCash;
      res.json(await payOrder(orderId, { cashAmount: resolvedCash, visaAmount: resolvedVisa }));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.delete("/api/orders/:id", async (req, res) => {
    try {
      await cancelOpenOrder(Number(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const { shiftId, lines, discountType, discountValue, cashAmount, visaAmount, paymentMethod } =
        req.body;
      if (!shiftId || !lines?.length) {
        return res.status(400).json({ error: "Shift and items required" });
      }

      const shift = await queryOne("SELECT * FROM shifts WHERE id = $1 AND ended_at IS NULL", [
        shiftId,
      ]);
      if (!shift) return res.status(400).json({ error: "Shift not open" });

      const subtotal = lines.reduce(
        (s: number, l: { qty: number; unitPrice: number }) => s + l.qty * l.unitPrice,
        0
      );
      let discountAmount = 0;
      const dVal = Number(discountValue) || 0;
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
        return res.status(400).json({ error: "Payment required (cash and visa amounts)" });
      }

      res.json(
        await createTakeawayOrder(shiftId, lines, { cashAmount: cash, visaAmount: visa }, discountType, discountValue)
      );
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.get("/api/stock", async (_req, res) => {
    try {
      res.json(
        await query(
          `SELECT m.*, c.name as category_name,
            (m.stock_qty <= m.low_stock_threshold) as is_low_stock
           FROM menu_items m
           LEFT JOIN categories c ON c.id = m.category_id
           WHERE m.active = TRUE ORDER BY c.sort_order, m.name`
        )
      );
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.post("/api/stock/:id/adjust", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { qtyChange, reason } = req.body;
      if (qtyChange == null) return res.status(400).json({ error: "qtyChange required" });

      const item = await queryOne<{ stock_qty: number }>("SELECT * FROM menu_items WHERE id = $1", [
        id,
      ]);
      if (!item) return res.status(404).json({ error: "Not found" });

      const newQty = item.stock_qty + qtyChange;
      if (newQty < 0) return res.status(400).json({ error: "Stock cannot go below 0" });

      await transaction(async (client) => {
        await clientExecute(client, "UPDATE menu_items SET stock_qty = $1 WHERE id = $2", [
          newQty,
          id,
        ]);
        await clientExecute(
          client,
          "INSERT INTO stock_adjustments (menu_item_id, qty_change, reason) VALUES ($1, $2, $3)",
          [id, qtyChange, reason || null]
        );
      });

      res.json(await queryOne("SELECT * FROM menu_items WHERE id = $1", [id]));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  async function getPeriodReport(from: string, to: string) {
    const orderTotals = await queryOne<{
      cash_total: number;
      visa_total: number;
      order_count: number;
    }>(
      `SELECT
         COALESCE(SUM(cash_amount), 0) as cash_total,
         COALESCE(SUM(visa_amount), 0) as visa_total,
         COUNT(*) as order_count
       FROM orders
       WHERE created_at::date >= $1::date AND created_at::date <= $2::date
         AND status = 'paid'`,
      [from, to]
    );

    const lineTotals = await queryOne<{
      items_sold: number;
      cost_total: number;
    }>(
      `SELECT
         COALESCE(SUM(ol.qty), 0) as items_sold,
         COALESCE(SUM(ol.cost_total), 0) as cost_total
       FROM orders o
       JOIN order_lines ol ON ol.order_id = o.id
       WHERE o.created_at::date >= $1::date AND o.created_at::date <= $2::date
         AND o.status = 'paid'`,
      [from, to]
    );

    const discounts = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(discount_amount), 0) as total FROM orders
       WHERE created_at::date >= $1::date AND created_at::date <= $2::date
         AND status = 'paid'`,
      [from, to]
    );

    const byDay = await query(
      `SELECT o.created_at::date as day,
         SUM(ol.line_total) as revenue,
         SUM(ol.cost_total) as cost,
         SUM(ol.line_total - ol.cost_total) as profit,
         SUM(ol.qty) as items
       FROM order_lines ol
       JOIN orders o ON o.id = ol.order_id
       WHERE o.created_at::date >= $1::date AND o.created_at::date <= $2::date
         AND o.status = 'paid'
       GROUP BY o.created_at::date
       ORDER BY day`,
      [from, to]
    );

    return {
      from,
      to,
      summary: {
        ...orderTotals,
        ...lineTotals,
        grand_total: Number(orderTotals?.cash_total) + Number(orderTotals?.visa_total),
        profit_total:
          Number(orderTotals?.cash_total) +
          Number(orderTotals?.visa_total) -
          Number(lineTotals?.cost_total),
        discount_total: discounts?.total ?? 0,
      },
      byDay,
    };
  }

  app.get("/api/reports/daily", async (req, res) => {
    try {
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      res.json(await getPeriodReport(date, date));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/reports/monthly", async (req, res) => {
    try {
      const month = String(req.query.month || new Date().toISOString().slice(0, 7));
      const from = `${month}-01`;
      const lastDay = new Date(
        parseInt(month.slice(0, 4)),
        parseInt(month.slice(5, 7)),
        0
      ).getDate();
      const to = `${month}-${String(lastDay).padStart(2, "0")}`;
      res.json(await getPeriodReport(from, to));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/reports/range", async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: "from and to dates required" });
      res.json(await getPeriodReport(String(from), String(to)));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.get("/api/reports/items", async (req, res) => {
    try {
      const { from, to, groupBy } = req.query;
      if (!from || !to) return res.status(400).json({ error: "from and to required" });

      const fmt = periodFormat(String(groupBy || "day"));

      const items = await query(
        `SELECT
           ol.menu_item_id,
           ol.item_name,
           TO_CHAR(o.created_at, '${fmt}') as period,
           SUM(ol.qty) as qty_sold,
           SUM(ol.line_total) as revenue,
           SUM(ol.cost_total) as cost,
           SUM(ol.line_total - ol.cost_total) as profit
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id
         WHERE o.created_at::date >= $1::date AND o.created_at::date <= $2::date
           AND o.status = 'paid'
         GROUP BY ol.menu_item_id, ol.item_name, period
         ORDER BY period, qty_sold DESC`,
        [String(from), String(to)]
      );

      const totals = await query(
        `SELECT
           ol.item_name,
           SUM(ol.qty) as qty_sold,
           SUM(ol.line_total) as revenue,
           SUM(ol.cost_total) as cost,
           SUM(ol.line_total - ol.cost_total) as profit
         FROM order_lines ol
         JOIN orders o ON o.id = ol.order_id
         WHERE o.created_at::date >= $1::date AND o.created_at::date <= $2::date
           AND o.status = 'paid'
         GROUP BY ol.menu_item_id, ol.item_name
         ORDER BY qty_sold DESC`,
        [String(from), String(to)]
      );

      res.json({ from, to, groupBy: groupBy || "day", items, totals });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Server error" });
    }
  });

  if (!process.env.VERCEL) {
    const clientDist = path.join(__dirname, "..", "dist", "client");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"), (err) => {
        if (err) res.status(404).send("Run npm run build first, or use npm run dev");
      });
    });
  }

  return app;
}
