import {
  clientExecute,
  clientQuery,
  clientQueryOne,
  execute,
  query,
  queryOne,
  transaction,
} from "./db.js";
import type pg from "pg";

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

export async function getOpenTableOrder(tableNumber: number) {
  return queryOne(
    `SELECT * FROM orders
     WHERE status = 'open' AND service_type = 'dine_in' AND table_number = $1`,
    [tableNumber]
  );
}

export async function getOrderWithLines(orderId: number, client?: pg.PoolClient) {
  if (client) {
    const order = await clientQueryOne(client, "SELECT * FROM orders WHERE id = $1", [orderId]);
    if (!order) return null;
    const lines = await clientQuery(
      client,
      "SELECT * FROM order_lines WHERE order_id = $1 ORDER BY id",
      [orderId]
    );
    return { order, lines };
  }
  const order = await queryOne("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (!order) return null;
  const lines = await query("SELECT * FROM order_lines WHERE order_id = $1 ORDER BY id", [
    orderId,
  ]);
  return { order, lines };
}

function normalizeLines(lines: LineInput[]): LineInput[] {
  return lines.map((l) => ({
    menuItemId: Number(l.menuItemId),
    qty: Number(l.qty),
    unitPrice: Number(l.unitPrice),
  }));
}

async function validateStock(client: pg.PoolClient, lines: LineInput[]) {
  for (const line of lines) {
    const item = await clientQueryOne<{ stock_qty: number; name: string }>(
      client,
      "SELECT * FROM menu_items WHERE id = $1 AND active = TRUE",
      [line.menuItemId]
    );
    if (!item) throw new Error(`Item ${line.menuItemId} not found`);
    const stock = Number(item.stock_qty);
    if (stock < line.qty) {
      throw new Error(`Not enough stock for ${item.name} (have ${stock})`);
    }
  }
}

async function restoreStockFromOrder(client: pg.PoolClient, orderId: number) {
  const oldLines = await clientQuery<{ menu_item_id: number; qty: number }>(
    client,
    "SELECT menu_item_id, qty FROM order_lines WHERE order_id = $1",
    [orderId]
  );
  for (const line of oldLines) {
    await clientExecute(
      client,
      "UPDATE menu_items SET stock_qty = stock_qty + $1 WHERE id = $2",
      [line.qty, line.menu_item_id]
    );
  }
}

export async function replaceOrderLines(
  client: pg.PoolClient,
  orderId: number,
  lines: LineInput[],
  paymentMethod: string
) {
  await validateStock(client, lines);
  await restoreStockFromOrder(client, orderId);
  await clientExecute(client, "DELETE FROM order_lines WHERE order_id = $1", [orderId]);

  for (const line of lines) {
    const item = await clientQueryOne<{ name: string; cost_price: number }>(
      client,
      "SELECT name FROM menu_items WHERE id = $1",
      [line.menuItemId]
    );
    if (!item) throw new Error(`Item ${line.menuItemId} not found`);
    const lineTotal = line.qty * line.unitPrice;
    const costPrice = Number(item.cost_price) || 0;
    const costTotal = line.qty * costPrice;
    await clientExecute(
      client,
      `INSERT INTO order_lines (
        order_id, menu_item_id, item_name, qty, unit_price, cost_price, line_total, cost_total, payment_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        orderId,
        line.menuItemId,
        item.name,
        line.qty,
        line.unitPrice,
        costPrice,
        lineTotal,
        costTotal,
        paymentMethod,
      ]
    );
    await clientExecute(
      client,
      "UPDATE menu_items SET stock_qty = stock_qty - $1 WHERE id = $2",
      [line.qty, line.menuItemId]
    );
  }
}

export async function createOpenTableOrder(shiftId: number, tableNumber: number) {
  const existing = await getOpenTableOrder(tableNumber);
  if (existing) return Number((existing as { id: number }).id);

  const row = await queryOne<{ id: number }>(
    `INSERT INTO orders (
      shift_id, service_type, table_number, status,
      discount_type, discount_value, subtotal, discount_amount, total
    ) VALUES ($1, 'dine_in', $2, 'open', NULL, 0, 0, 0, 0)
    RETURNING id`,
    [shiftId, tableNumber]
  );
  if (!row) throw new Error("Failed to create table order");
  return row.id;
}

export async function updateOpenOrder(
  orderId: number,
  lines: LineInput[],
  discountType?: string | null,
  discountValue?: number
) {
  const normalized = normalizeLines(lines);
  return transaction(async (client) => {
    const order = await clientQueryOne<{ status: string }>(
      client,
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );
    if (!order) throw new Error("Order not found");
    if (order.status !== "open") throw new Error("Order is already paid");

    const { subtotal, discountAmount, total, discountValue: dVal } = calcTotals(
      normalized,
      discountType,
      discountValue
    );

    await replaceOrderLines(client, orderId, normalized, "cash");

    await clientExecute(
      client,
      `UPDATE orders SET
        discount_type = $1, discount_value = $2, subtotal = $3, discount_amount = $4, total = $5
       WHERE id = $6`,
      [discountType || null, dVal, subtotal, discountAmount, total, orderId]
    );

    const full = await getOrderWithLines(orderId, client);
    if (!full) throw new Error("Order not found after update");
    return full;
  });
}

export async function moveOpenTableOrder(orderId: number, tableNumber: number) {
  if (!Number.isInteger(tableNumber) || tableNumber < 1 || tableNumber > TABLE_COUNT) {
    throw new Error(`Choose a table from 1 to ${TABLE_COUNT}`);
  }

  return transaction(async (client) => {
    const order = await clientQueryOne<{
      id: number;
      status: string;
      service_type: string;
      table_number: number | null;
    }>(client, "SELECT * FROM orders WHERE id = $1", [orderId]);
    if (!order) throw new Error("Order not found");
    if (order.status !== "open" || order.service_type !== "dine_in") {
      throw new Error("Only an open dine-in order can be moved");
    }
    if (order.table_number === tableNumber) {
      const full = await getOrderWithLines(orderId, client);
      if (!full) throw new Error("Order not found after move");
      return full;
    }

    const occupied = await clientQueryOne<{ id: number }>(
      client,
      `SELECT id FROM orders
       WHERE id <> $1 AND status = 'open' AND service_type = 'dine_in' AND table_number = $2`,
      [orderId, tableNumber]
    );
    if (occupied) throw new Error(`Table ${tableNumber} is occupied`);

    await clientExecute(
      client,
      "UPDATE orders SET table_number = $1, updated_at = NOW() WHERE id = $2",
      [tableNumber, orderId]
    );

    const full = await getOrderWithLines(orderId, client);
    if (!full) throw new Error("Order not found after move");
    return full;
  });
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

async function applySplitToLines(
  client: pg.PoolClient,
  orderId: number,
  cashAmount: number,
  _visaAmount: number
) {
  const lines = await clientQuery<{ id: number; line_total: number }>(
    client,
    "SELECT id, line_total FROM order_lines WHERE order_id = $1 ORDER BY line_total DESC",
    [orderId]
  );

  let cashLeft = cashAmount;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    let method: "cash" | "visa";
    if (isLast) {
      method = cashLeft >= line.line_total - 0.001 ? "cash" : "visa";
    } else if (cashLeft >= line.line_total - 0.001) {
      method = "cash";
      cashLeft -= line.line_total;
    } else {
      method = "visa";
    }
    await clientExecute(client, "UPDATE order_lines SET payment_method = $1 WHERE id = $2", [
      method,
      line.id,
    ]);
  }
}

export async function payOrder(orderId: number, payment: PaymentSplit) {
  return transaction(async (client) => {
    const order = await clientQueryOne<{ status: string; total: number }>(
      client,
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );
    if (!order) throw new Error("Order not found");
    if (order.status !== "open") throw new Error("Order is already paid");

    const lineCount = await clientQueryOne<{ c: string }>(
      client,
      "SELECT COUNT(*)::int AS c FROM order_lines WHERE order_id = $1",
      [orderId]
    );
    if (Number(lineCount?.c) === 0) throw new Error("Add items before payment");

    const { cashAmount, visaAmount } = validatePayment(
      order.total,
      payment.cashAmount,
      payment.visaAmount
    );
    const label = paymentLabel(cashAmount, visaAmount);

    await applySplitToLines(client, orderId, cashAmount, visaAmount);
    await clientExecute(
      client,
      `UPDATE orders SET status = 'paid', payment_method = $1, cash_amount = $2, visa_amount = $3,
        updated_at = NOW() WHERE id = $4`,
      [label, cashAmount, visaAmount, orderId]
    );

    const full = await getOrderWithLines(orderId, client);
    if (!full) throw new Error("Order not found after payment");
    return full;
  });
}

export async function createTakeawayOrder(
  shiftId: number,
  lines: LineInput[],
  payment: PaymentSplit,
  discountType?: string | null,
  discountValue?: number
) {
  const normalized = normalizeLines(lines);
  return transaction(async (client) => {
    const { subtotal, discountAmount, total, discountValue: dVal } = calcTotals(
      normalized,
      discountType,
      discountValue
    );

    const { cashAmount, visaAmount } = validatePayment(
      total,
      payment.cashAmount,
      payment.visaAmount
    );
    const label = paymentLabel(cashAmount, visaAmount);
    const lineMethod = label === "split" ? "cash" : label;

    const inserted = await clientQueryOne<{ id: number }>(
      client,
      `INSERT INTO orders (
        shift_id, service_type, table_number, status, payment_method,
        cash_amount, visa_amount,
        discount_type, discount_value, subtotal, discount_amount, total
      ) VALUES ($1, 'takeaway', NULL, 'paid', $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        shiftId,
        label,
        cashAmount,
        visaAmount,
        discountType || null,
        dVal,
        subtotal,
        discountAmount,
        total,
      ]
    );
    if (!inserted) throw new Error("Failed to create order");

    await replaceOrderLines(client, inserted.id, normalized, lineMethod);
    if (label === "split") await applySplitToLines(client, inserted.id, cashAmount, visaAmount);

    const full = await getOrderWithLines(inserted.id, client);
    if (!full) throw new Error("Order not found after create");
    return full;
  });
}

export async function cancelOpenOrder(orderId: number) {
  return transaction(async (client) => {
    const order = await clientQueryOne<{ status: string }>(
      client,
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );
    if (!order || order.status !== "open") throw new Error("Cannot cancel this order");
    await restoreStockFromOrder(client, orderId);
    await clientExecute(client, "DELETE FROM order_lines WHERE order_id = $1", [orderId]);
    await clientExecute(client, "DELETE FROM orders WHERE id = $1", [orderId]);
  });
}
