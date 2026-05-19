import { db } from "./db.js";

export const TABLE_COUNT = 5;

export type LineInput = {
  menuItemId: number;
  qty: number;
  unitPrice: number;
};

export function calcTotals(
  lines: LineInput[],
  discountType?: string | null,
  discountValue?: number
) {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  let discountAmount = 0;
  const dVal = Number(discountValue) || 0;
  if (discountType === "percent" && dVal > 0) {
    discountAmount = Math.min(subtotal, (subtotal * dVal) / 100);
  } else if (discountType === "fixed" && dVal > 0) {
    discountAmount = Math.min(subtotal, dVal);
  }
  return { subtotal, discountAmount, total: subtotal - discountAmount, discountValue: dVal };
}

export function getOpenTableOrder(tableNumber: number) {
  return db
    .prepare(
      `SELECT * FROM orders
       WHERE status = 'open' AND service_type = 'dine_in' AND table_number = ?`
    )
    .get(tableNumber) as Record<string, unknown> | undefined;
}

export function getOrderWithLines(orderId: number) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return null;
  const lines = db
    .prepare("SELECT * FROM order_lines WHERE order_id = ? ORDER BY id")
    .all(orderId);
  return { order, lines };
}

function validateStock(lines: LineInput[]) {
  for (const line of lines) {
    const item = db.prepare("SELECT * FROM menu_items WHERE id = ? AND active = 1").get(
      line.menuItemId
    ) as { stock_qty: number; name: string } | undefined;
    if (!item) throw new Error(`Item ${line.menuItemId} not found`);
    if (item.stock_qty < line.qty) {
      throw new Error(`Not enough stock for ${item.name} (have ${item.stock_qty})`);
    }
  }
}

function restoreStockFromOrder(orderId: number) {
  const oldLines = db
    .prepare("SELECT menu_item_id, qty FROM order_lines WHERE order_id = ?")
    .all(orderId) as { menu_item_id: number; qty: number }[];
  for (const line of oldLines) {
    db.prepare("UPDATE menu_items SET stock_qty = stock_qty + ? WHERE id = ?").run(
      line.qty,
      line.menu_item_id
    );
  }
}

export function replaceOrderLines(
  orderId: number,
  lines: LineInput[],
  paymentMethod: string
) {
  validateStock(lines);
  restoreStockFromOrder(orderId);
  db.prepare("DELETE FROM order_lines WHERE order_id = ?").run(orderId);

  const insertLine = db.prepare(
    `INSERT INTO order_lines (order_id, menu_item_id, item_name, qty, unit_price, line_total, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const line of lines) {
    const item = db.prepare("SELECT name FROM menu_items WHERE id = ?").get(line.menuItemId) as {
      name: string;
    };
    const lineTotal = line.qty * line.unitPrice;
    insertLine.run(
      orderId,
      line.menuItemId,
      item.name,
      line.qty,
      line.unitPrice,
      lineTotal,
      paymentMethod
    );
    db.prepare("UPDATE menu_items SET stock_qty = stock_qty - ? WHERE id = ?").run(
      line.qty,
      line.menuItemId
    );
  }
}

export function createOpenTableOrder(shiftId: number, tableNumber: number) {
  const existing = getOpenTableOrder(tableNumber);
  if (existing) return Number(existing.id);

  db.prepare(
    `INSERT INTO orders (
      shift_id, service_type, table_number, status,
      discount_type, discount_value, subtotal, discount_amount, total
    ) VALUES (?, 'dine_in', ?, 'open', NULL, 0, 0, 0, 0)`
  ).run(shiftId, tableNumber);

  return (db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
}

export function updateOpenOrder(
  orderId: number,
  lines: LineInput[],
  discountType?: string | null,
  discountValue?: number
) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as
    | { status: string; service_type: string }
    | undefined;
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("Order is already paid");

  const { subtotal, discountAmount, total, discountValue: dVal } = calcTotals(
    lines,
    discountType,
    discountValue
  );

  replaceOrderLines(orderId, lines, "cash");

  db.prepare(
    `UPDATE orders SET
      discount_type = ?, discount_value = ?, subtotal = ?, discount_amount = ?, total = ?
     WHERE id = ?`
  ).run(discountType || null, dVal, subtotal, discountAmount, total, orderId);

  return getOrderWithLines(orderId);
}

export type PaymentSplit = { cashAmount: number; visaAmount: number };

export function validatePayment(total: number, cashAmount: number, visaAmount: number) {
  const cash = Math.round(cashAmount * 1000) / 1000;
  const visa = Math.round(visaAmount * 1000) / 1000;
  const sum = Math.round((cash + visa) * 1000) / 1000;
  const t = Math.round(total * 1000) / 1000;
  if (cash < 0 || visa < 0) throw new Error("Amounts cannot be negative");
  if (Math.abs(sum - t) > 0.01) {
    throw new Error(`Cash + Visa must equal ${t.toFixed(3)} OMR (got ${sum.toFixed(3)})`);
  }
  return { cashAmount: cash, visaAmount: visa };
}

function paymentLabel(cashAmount: number, visaAmount: number) {
  if (cashAmount > 0 && visaAmount > 0) return "split";
  if (visaAmount > 0) return "visa";
  return "cash";
}

/** Assign cash/visa to lines so line totals match order payment split. */
function applySplitToLines(orderId: number, cashAmount: number, visaAmount: number) {
  const lines = db
    .prepare("SELECT id, line_total FROM order_lines WHERE order_id = ? ORDER BY line_total DESC")
    .all(orderId) as { id: number; line_total: number }[];

  let cashLeft = cashAmount;
  const update = db.prepare("UPDATE order_lines SET payment_method = ? WHERE id = ?");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    if (isLast) {
      update.run(cashLeft >= line.line_total - 0.001 ? "cash" : "visa", line.id);
    } else if (cashLeft >= line.line_total - 0.001) {
      update.run("cash", line.id);
      cashLeft -= line.line_total;
    } else {
      update.run("visa", line.id);
    }
  }
}

export function payOrder(orderId: number, payment: PaymentSplit) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as
    | { status: string; total: number }
    | undefined;
  if (!order) throw new Error("Order not found");
  if (order.status !== "open") throw new Error("Order is already paid");

  const lineCount = db
    .prepare("SELECT COUNT(*) as c FROM order_lines WHERE order_id = ?")
    .get(orderId) as { c: number };
  if (lineCount.c === 0) throw new Error("Add items before payment");

  const { cashAmount, visaAmount } = validatePayment(order.total, payment.cashAmount, payment.visaAmount);
  const label = paymentLabel(cashAmount, visaAmount);

  applySplitToLines(orderId, cashAmount, visaAmount);
  db.prepare(
    `UPDATE orders SET status = 'paid', payment_method = ?, cash_amount = ?, visa_amount = ?,
      updated_at = datetime('now') WHERE id = ?`
  ).run(label, cashAmount, visaAmount, orderId);

  return getOrderWithLines(orderId);
}

export function createTakeawayOrder(
  shiftId: number,
  lines: LineInput[],
  payment: PaymentSplit,
  discountType?: string | null,
  discountValue?: number
) {
  const { subtotal, discountAmount, total, discountValue: dVal } = calcTotals(
    lines,
    discountType,
    discountValue
  );

  const { cashAmount, visaAmount } = validatePayment(total, payment.cashAmount, payment.visaAmount);
  const label = paymentLabel(cashAmount, visaAmount);
  const lineMethod = label === "split" ? "cash" : label;

  db.prepare(
    `INSERT INTO orders (
      shift_id, service_type, table_number, status, payment_method,
      cash_amount, visa_amount,
      discount_type, discount_value, subtotal, discount_amount, total
    ) VALUES (?, 'takeaway', NULL, 'paid', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    shiftId,
    label,
    cashAmount,
    visaAmount,
    discountType || null,
    dVal,
    subtotal,
    discountAmount,
    total
  );

  const orderId = (db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }).id;
  replaceOrderLines(orderId, lines, lineMethod);
  if (label === "split") applySplitToLines(orderId, cashAmount, visaAmount);

  return getOrderWithLines(orderId);
}

export function cancelOpenOrder(orderId: number) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) as
    | { status: string }
    | undefined;
  if (!order || order.status !== "open") throw new Error("Cannot cancel this order");
  restoreStockFromOrder(orderId);
  db.prepare("DELETE FROM order_lines WHERE order_id = ?").run(orderId);
  db.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
}
