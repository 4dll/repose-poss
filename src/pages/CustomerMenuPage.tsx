import { useEffect, useMemo, useState } from "react";
import { api, Category, MenuItem } from "../api";
import { Money } from "../components/Money";

const ITEM_IMAGES: Record<string, string> = {
  v60: "/menu-images/v60.jpg",
  chemex: "/menu-images/chemex.jpg",
  "turkish coffee": "/menu-images/turkish-coffee.jpg",
};

function itemImage(item: MenuItem) {
  return ITEM_IMAGES[item.name.trim().toLowerCase()];
}

export default function CustomerMenuPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [items, cats] = await Promise.all([api.customerMenu(), api.categories()]);
        const visibleCats = cats.filter((cat) => items.some((item) => item.category_id === cat.id));
        setMenu(items);
        setCategories(visibleCats);
        setSelectedCategoryId((current) => current ?? visibleCats[0]?.id ?? null);
      } catch (e) {
        setError((e as Error).message);
      }
    }
    load();
  }, []);

  const grouped = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: menu.filter((item) => item.category_id === category.id),
      })),
    [categories, menu]
  );

  const visibleGroups =
    selectedCategoryId == null
      ? grouped
      : grouped.filter((group) => group.category.id === selectedCategoryId);
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const visibleItemCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);

  return (
    <main className="customer-menu">
      <header className="customer-menu-hero">
        <img src="/repose-logo.png" alt="Repose Cafe" />
        <div>
          <p>Repose Cafe</p>
          <h1>{selectedCategory?.name ?? "Menu"}</h1>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <nav className="customer-category-strip" aria-label="Menu categories">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={selectedCategoryId === category.id ? "active" : ""}
            onClick={() => setSelectedCategoryId(category.id)}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <section className="customer-menu-list">
        {visibleGroups.map(({ category, items }) => (
          <div key={category.id} className="customer-menu-section">
            <div className="customer-menu-section-head">
              <h2>{category.name}</h2>
              <span>{items.length} items</span>
            </div>
            <div className="customer-menu-items">
              {items.map((item) => (
                <article key={item.id} className="customer-menu-item">
                  {itemImage(item) ? (
                    <img
                      className="customer-menu-item-image"
                      src={itemImage(item)}
                      alt={item.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="customer-menu-item-fallback" aria-hidden="true">
                      {item.name.slice(0, 1)}
                    </div>
                  )}
                  <div className="customer-menu-item-row">
                    <div>
                      <h3>{item.name}</h3>
                      {item.stock_qty <= 0 && <span className="customer-sold-out">Sold out</span>}
                    </div>
                    <strong>
                      <Money amount={item.price} />
                    </strong>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
        {!error && visibleItemCount === 0 && (
          <p className="customer-menu-empty">No items are available in this category.</p>
        )}
      </section>
    </main>
  );
}
