import { execute, initDb, queryOne } from "./db.js";

await initDb();

const categories = [
  "Drip coffee",
  "Hot coffee",
  "iced coffee",
  "mojito",
  "milkshake",
  "juice",
  "sweets",
  "iced tea",
  "Hot tea",
  "frappuccino",
];

const menu: { category: string; name: string; price: number; stock?: number }[] = [
  { category: "Drip coffee", name: "V60", price: 1.8 },
  { category: "Drip coffee", name: "Chemex", price: 2 },
  { category: "Drip coffee", name: "Turkish coffee", price: 1 },

  { category: "Hot coffee", name: "Espresso", price: 1 },
  { category: "Hot coffee", name: "Americano", price: 1 },
  { category: "Hot coffee", name: "latte", price: 1.2 },
  { category: "Hot coffee", name: "Cappuccino", price: 1.2 },
  { category: "Hot coffee", name: "Flat white", price: 1.2 },
  { category: "Hot coffee", name: "cortado", price: 1.2 },
  { category: "Hot coffee", name: "spanish latte", price: 1.2 },
  { category: "Hot coffee", name: "pistachio latte", price: 1.4 },
  { category: "Hot coffee", name: "white mocha", price: 1.4 },
  { category: "Hot coffee", name: "hot chocolate", price: 1.2 },
  { category: "Hot coffee", name: "caramel latte", price: 1.3 },
  { category: "Hot coffee", name: "Dark moka", price: 1.4 },

  { category: "iced coffee", name: "americano", price: 1.2 },
  { category: "iced coffee", name: "Cappuccino", price: 1.3 },
  { category: "iced coffee", name: "latte", price: 1.3 },
  { category: "iced coffee", name: "spanish latte", price: 1.4 },
  { category: "iced coffee", name: "pistachio latte", price: 1.6 },
  { category: "iced coffee", name: "white mocha", price: 1.5 },

  { category: "mojito", name: "Strawberry", price: 1.2 },
  { category: "mojito", name: "Blueberry", price: 1.2 },
  { category: "mojito", name: "peach", price: 1.2 },
  { category: "mojito", name: "raspberry", price: 1.2 },
  { category: "mojito", name: "green apple", price: 1.2 },
  { category: "mojito", name: "passion", price: 1.2 },

  { category: "milkshake", name: "oreo", price: 1.4 },
  { category: "milkshake", name: "lotus", price: 1.5 },
  { category: "milkshake", name: "nutella", price: 1.6 },

  { category: "juice", name: "lemon mint", price: 1.2 },
  { category: "juice", name: "orange", price: 1.2 },

  { category: "sweets", name: "sansabstian", price: 2.2 },
  { category: "sweets", name: "chocolate cake", price: 1.8 },
  { category: "sweets", name: "pistachio cheesecake", price: 1.7 },

  { category: "iced tea", name: "peach iced tea", price: 1.8 },
  { category: "iced tea", name: "pasion iced tea", price: 1.8 },
  { category: "iced tea", name: "lemon iced tea", price: 1.8 },
  { category: "iced tea", name: "strawberry iced tea", price: 1.8 },
  { category: "iced tea", name: "pineapple", price: 1.8 },
  { category: "iced tea", name: "grenadine iced tea", price: 1.8 },

  { category: "Hot tea", name: "Green tea", price: 0.4 },
  { category: "Hot tea", name: "Black tea (meant)", price: 0.4 },
  { category: "Hot tea", name: "Hibicus tea", price: 0.4 },
  { category: "Hot tea", name: "Milk tea", price: 0.5 },

  { category: "frappuccino", name: "Vanilla frappe", price: 1.7 },
  { category: "frappuccino", name: "Pistachio frappe", price: 1.7 },
  { category: "frappuccino", name: "Caramel frappe", price: 1.7 },
  { category: "frappuccino", name: "Dark mocha frappe", price: 1.7 },
  { category: "frappuccino", name: "White mocha frappe", price: 1.7 },
  { category: "frappuccino", name: "Nutella frappe", price: 1.7 },
];

for (const [index, name] of categories.entries()) {
  await execute(
    `INSERT INTO categories (name, sort_order)
     VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
    [name, index + 1]
  );
}

let added = 0;
let updated = 0;

for (const item of menu) {
  const category = await queryOne<{ id: number }>("SELECT id FROM categories WHERE name = $1", [
    item.category,
  ]);
  if (!category) throw new Error(`Category not found: ${item.category}`);

  const existingInCategory = await queryOne<{ id: number }>(
    "SELECT id FROM menu_items WHERE lower(name) = lower($1) AND category_id = $2 LIMIT 1",
    [item.name, category.id]
  );

  if (existingInCategory) {
    await execute(
      `UPDATE menu_items
       SET name = $1, price = $2, stock_qty = GREATEST(stock_qty, $3), active = TRUE
       WHERE id = $4`,
      [item.name, item.price, item.stock ?? 100, existingInCategory.id]
    );
    updated += 1;
    continue;
  }

  const existingUncategorized = await queryOne<{ id: number }>(
    `SELECT id
     FROM menu_items
     WHERE lower(name) = lower($1)
       AND (category_id IS NULL OR category_id IN (
         SELECT id FROM categories WHERE name IN ('Hot Drinks', 'Cold Drinks', 'Food', 'Other')
       ))
     LIMIT 1`,
    [item.name]
  );

  if (existingUncategorized) {
    await execute(
      `UPDATE menu_items
       SET name = $1, price = $2, stock_qty = GREATEST(stock_qty, $3), category_id = $4, active = TRUE
       WHERE id = $5`,
      [item.name, item.price, item.stock ?? 100, category.id, existingUncategorized.id]
    );
    updated += 1;
    continue;
  }

  await execute(
    `INSERT INTO menu_items (name, price, stock_qty, low_stock_threshold, category_id, active)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [item.name, item.price, item.stock ?? 100, 5, category.id]
  );
  added += 1;
}

await execute(
  `DELETE FROM categories c
   WHERE c.name IN ('Hot Drinks', 'Cold Drinks', 'Food', 'Other')
     AND NOT EXISTS (SELECT 1 FROM menu_items m WHERE m.category_id = c.id)`
);

console.log(`Repose menu seed complete. Added ${added} item(s), updated ${updated} item(s).`);

await import("./db.js").then((m) => m.pool.end());
