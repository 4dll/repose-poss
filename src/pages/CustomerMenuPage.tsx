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
  const [search, setSearch] = useState("");
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
        items: menu.filter(
          (item) =>
            item.category_id === category.id &&
            item.name.toLowerCase().includes(search.trim().toLowerCase())
        ),
      })),
    [categories, menu, search]
  );

  const visibleGroups =
    selectedCategoryId == null
      ? grouped
      : grouped.filter((group) => group.category.id === selectedCategoryId);
  const visibleItemCount = visibleGroups.reduce((count, group) => count + group.items.length, 0);

  return (
    <main className="customer-menu">
      <header className="customer-menu-topbar">
        <button type="button" aria-label="Table selector" className="customer-table-button">
          <span aria-hidden="true">◴</span>
          Table
          <span aria-hidden="true">⌄</span>
        </button>
        <div className="customer-top-actions" aria-hidden="true">
          <span>♙</span>
          <span>☰</span>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="customer-venue">
        <div>
          <h1>REPOSE CAFE</h1>
          <p>Coffee shop</p>
        </div>
        <div className="customer-hours">
          <span aria-hidden="true">◷</span>
          7:00 AM - 12:00 AM
        </div>
      </section>

      <nav className="customer-category-strip" aria-label="Menu categories">
        <button
          type="button"
          className={selectedCategoryId === null ? "active" : ""}
          onClick={() => setSelectedCategoryId(null)}
        >
          <span>All categories</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={selectedCategoryId === category.id ? "active" : ""}
            onClick={() => setSelectedCategoryId(category.id)}
          >
            <span>{category.name}</span>
          </button>
        ))}
      </nav>

      <div className="customer-menu-tools">
        <label>
          <span className="sr-only">Search menu</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search..."
          />
        </label>
        <div className="customer-view-icons" aria-hidden="true">
          <span>☷</span>
          <span>⠿</span>
        </div>
      </div>

      <section className="customer-menu-list">
        {visibleGroups.map(({ category, items }) => (
          <div key={category.id} className="customer-menu-section">
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
