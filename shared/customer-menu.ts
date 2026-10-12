export type CustomerCategory = { id: number; name: string; sort_order: number };
export type CustomerItem = {
  id: number;
  name: string;
  price: number;
  stock_qty: number;
  category_id: number | null;
};
export type CustomerMenu = { categories: CustomerCategory[]; items: CustomerItem[] };
export type LiveMenu = { menu: CustomerMenu | null; revision: string | null; updatedAt: string | null };

/** Explicit allowlist: never publish costs, staff credentials, orders or reports. */
export function publicMenu(
  categories: CustomerCategory[],
  items: (CustomerItem & { active: number; show_on_customer_menu: boolean })[]
): CustomerMenu {
  const visible = items.filter((item) => item.active && item.show_on_customer_menu);
  return {
    categories: categories
      .filter((category) => visible.some((item) => item.category_id === category.id))
      .map(({ id, name, sort_order }) => ({ id, name, sort_order }))
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    items: visible.map(({ id, name, price, stock_qty, category_id }) => ({
      id, name, price, stock_qty, category_id,
    })),
  };
}

export function parseCustomerMenu(input: unknown): CustomerMenu {
  const fail = (): never => { throw new Error("Invalid customer menu."); };
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : fail();
  const integer = (value: unknown): number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fail();
  const name = (value: unknown): string =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 200 ? value : fail();
  const data = object(input);
  if (!Array.isArray(data.categories) || !Array.isArray(data.items) ||
      data.categories.length > 500 || data.items.length > 5000) return fail();
  const categories = data.categories.map((entry) => {
    const row = object(entry);
    return { id: integer(row.id), name: name(row.name), sort_order: integer(row.sort_order) };
  });
  const categoryIds = new Set(categories.map((category) => category.id));
  if (categoryIds.size !== categories.length) return fail();
  const items = data.items.map((entry) => {
    const row = object(entry);
    if (typeof row.price !== "number" || !Number.isFinite(row.price) || row.price < 0 || row.price > 1000000) return fail();
    const category_id = row.category_id === null ? null : integer(row.category_id);
    if (category_id !== null && !categoryIds.has(category_id)) return fail();
    return { id: integer(row.id), name: name(row.name), price: row.price,
      stock_qty: integer(row.stock_qty), category_id };
  });
  if (new Set(items.map((item) => item.id)).size !== items.length) return fail();
  return { categories, items };
}
