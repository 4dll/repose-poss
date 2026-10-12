// Items explicitly removed by the cafe on 2026-10-12. Match both ID and name
// so newly created items with different IDs are not affected.
const retired = new Map([
  [100, "classic hot matcha"], [101, "iced cloudy matcha"],
  [102, "iced creamy matcha"], [103, "classic iced matcha"],
  [125, "cream brulle matcha"], [126, "cream brelle matcha"],
]);

export function isRetiredMenuItem(item: { id: number; name: string }) {
  return retired.get(item.id) === item.name.trim().toLowerCase();
}

export function retireLocalMenuItems(data: {
  menu: { id: number; name: string; active: number; show_on_customer_menu: boolean; category_id: number | null }[];
  categories: { id: number; name: string }[];
}) {
  let changed = false;
  for (const item of data.menu) {
    if (isRetiredMenuItem(item) && (item.active || item.show_on_customer_menu)) {
      item.active = 0;
      item.show_on_customer_menu = false;
      changed = true;
    }
  }
  const index = data.categories.findIndex((category) => category.id === 30 && category.name.toLowerCase() === "matcha");
  if (index >= 0 && !data.menu.some((item) => item.category_id === 30 && item.active)) {
    data.categories.splice(index, 1);
    changed = true;
  }
  return changed;
}

export function removeRetiredPublicItems<T extends { items: { id: number; name: string; category_id: number | null }[]; categories: { id: number }[] }>(menu: T): T {
  const items = menu.items.filter((item) => !isRetiredMenuItem(item));
  return { ...menu, items, categories: menu.categories.filter((category) => items.some((item) => item.category_id === category.id)) };
}
