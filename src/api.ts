const BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const msg =
      data.error ||
      res.statusText ||
      (res.status ? `Request failed (${res.status})` : "Request failed — is the API server running?");
    throw new Error(msg);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type Staff = { id: number; name: string; username: string };
export type Category = {
  id: number;
  name: string;
  sort_order: number;
};

export type MenuItem = {
  id: number;
  name: string;
  price: number;
  stock_qty: number;
  low_stock_threshold: number;
  active: number;
  category_id: number | null;
  category_name?: string;
  is_low_stock?: number;
};
export type Shift = {
  id: number;
  staff_id: number;
  staff_name: string;
  staff_username?: string;
  started_at: string;
  ended_at: string | null;
};
export type CartLine = {
  menuItemId: number;
  name: string;
  qty: number;
  unitPrice: number;
};

export type TableStatus = {
  number: number;
  status: "free" | "occupied";
  orderId?: number;
  total?: number;
  itemCount?: number;
  since?: string;
};

export type Order = {
  id: number;
  shift_id: number;
  created_at: string;
  updated_at: string | null;
  service_type: string;
  table_number: number | null;
  status: string;
  payment_method: string | null;
  subtotal: number;
  discount_amount: number;
  total: number;
  cash_amount: number;
  visa_amount: number;
  discount_type: string | null;
  discount_value: number;
};

export type OrderLine = {
  id: number;
  menu_item_id: number;
  item_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  payment_method: string;
};

export const api = {
  staff: () => request<Staff[]>("/staff"),
  login: (username: string, password: string) =>
    request<Staff>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  categories: () => request<Category[]>("/categories"),
  addCategory: (name: string) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) }),
  menu: () => request<MenuItem[]>("/menu"),
  menuAll: () => request<MenuItem[]>("/menu/all"),
  activeShifts: () => request<Shift[]>("/shifts/active"),
  openShift: (username: string, password: string) =>
    request<Shift>("/shifts/open", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  closeShift: (id: number, username: string, password: string) =>
    request<ShiftReport>(`/shifts/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  shiftReport: (id: number) => request<ShiftReport>(`/shifts/${id}/report`),
  shifts: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return request<Shift[]>(`/shifts?${q}`);
  },
  tables: () => request<TableStatus[]>("/tables"),
  openTable: (tableNumber: number, shiftId: number) =>
    request<{ order: Order; lines: OrderLine[] }>(`/tables/${tableNumber}/open`, {
      method: "POST",
      body: JSON.stringify({ shiftId }),
    }),
  getOrder: (id: number) =>
    request<{ order: Order; lines: OrderLine[] }>(`/orders/${id}`),
  updateOrder: (
    id: number,
    body: {
      lines: { menuItemId: number; qty: number; unitPrice: number }[];
      discountType?: string;
      discountValue?: number;
    }
  ) =>
    request<{ order: Order; lines: OrderLine[] }>(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  payOrder: (id: number, payment: { cashAmount: number; visaAmount: number }) =>
    request<{ order: Order; lines: OrderLine[] }>(`/orders/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(payment),
    }),
  cancelOrder: (id: number) =>
    request(`/orders/${id}`, { method: "DELETE" }),
  createTakeawayOrder: (body: {
    shiftId: number;
    lines: { menuItemId: number; qty: number; unitPrice: number }[];
    cashAmount: number;
    visaAmount: number;
    discountType?: string;
    discountValue?: number;
  }) =>
    request<{ order: Order; lines: OrderLine[] }>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  stock: () => request<MenuItem[]>("/stock"),
  adjustStock: (id: number, qtyChange: number, reason?: string) =>
    request<MenuItem>(`/stock/${id}/adjust`, {
      method: "POST",
      body: JSON.stringify({ qtyChange, reason }),
    }),
  addMenuItem: (body: {
    name: string;
    price: number;
    stockQty?: number;
    categoryId: number;
  }) => request<MenuItem>("/menu", { method: "POST", body: JSON.stringify(body) }),
  updateMenuItem: (id: number, body: Partial<MenuItem>) =>
    request<MenuItem>(`/menu/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  dailyReport: (date: string) => request<PeriodReport>(`/reports/daily?date=${date}`),
  monthlyReport: (month: string) => request<PeriodReport>(`/reports/monthly?month=${month}`),
  rangeReport: (from: string, to: string) =>
    request<PeriodReport>(`/reports/range?from=${from}&to=${to}`),
  itemsReport: (from: string, to: string, groupBy?: string) => {
    const q = new URLSearchParams({ from, to });
    if (groupBy) q.set("groupBy", groupBy);
    return request<ItemsReport>(`/reports/items?${q}`);
  },
};

export type ShiftReport = {
  shift: Shift;
  lines: {
    id: number;
    item_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
    payment_method: string;
    order_time: string;
  }[];
  summary: {
    cash_total: number;
    visa_total: number;
    items_sold: number;
    order_count: number;
    grand_total: number;
    discount_total: number;
  };
};

export type PeriodReport = {
  from: string;
  to: string;
  summary: ShiftReport["summary"];
  byDay: { day: string; revenue: number; items: number }[];
};

export type ItemsReport = {
  from: string;
  to: string;
  groupBy: string;
  totals: { item_name: string; qty_sold: number; revenue: number }[];
  items: { item_name: string; period: string; qty_sold: number; revenue: number }[];
};

export function formatDateTime(iso: string) {
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(normalized).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}
