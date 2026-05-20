import { useEffect, useMemo, useState } from "react";
import { api, Category, MenuItem } from "../api";
import { Money } from "../components/Money";

export default function CustomerMenuPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [items, cats] = await Promise.all([api.menu(), api.categories()]);
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

  return (
    <main className="customer-menu">
      <header className="customer-menu-hero">
        <img src="/repose-logo.png" alt="Repose Cafe" />
        <div>
          <p>Repose Cafe</p>
          <h1>Menu</h1>
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
            <h2>{category.name}</h2>
            <div className="customer-menu-items">
              {items.map((item) => (
                <article key={item.id} className="customer-menu-item">
                  <div>
                    <h3>{item.name}</h3>
                    {item.stock_qty <= 0 && <span className="customer-sold-out">Sold out</span>}
                  </div>
                  <strong>
                    <Money amount={item.price} />
                  </strong>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
