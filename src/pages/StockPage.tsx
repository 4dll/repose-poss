import { FormEvent, useEffect, useState } from "react";
import { api, Category, MenuItem } from "../api";
import { Money } from "../components/Money";

export default function StockPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("0");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [adjustQty, setAdjustQty] = useState<Record<number, string>>({});
  const [adjustReason, setAdjustReason] = useState<Record<number, string>>({});

  async function load() {
    const [stock, cats] = await Promise.all([api.stock(), api.categories()]);
    setItems(stock);
    setCategories(cats);
    if (cats.length && !newCategoryId) setNewCategoryId(String(cats[0].id));
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    setError("");
    try {
      const cat = await api.addCategory(newCategoryName.trim());
      setNewCategoryName("");
      setNewCategoryId(String(cat.id));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.addMenuItem({
        name: newName.trim(),
        price: parseFloat(newPrice),
        stockQty: parseInt(newStock, 10) || 0,
        categoryId: parseInt(newCategoryId, 10),
      });
      setNewName("");
      setNewPrice("");
      setNewStock("0");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function adjust(id: number) {
    const qty = parseInt(adjustQty[id] || "0", 10);
    if (!qty) return;
    setError("");
    try {
      await api.adjustStock(id, qty, adjustReason[id]);
      setAdjustQty((p) => ({ ...p, [id]: "" }));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const lowStock = items.filter((i) => i.stock_qty <= i.low_stock_threshold);

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      {lowStock.length > 0 && (
        <div className="alert alert-warn">
          Low stock: {lowStock.map((i) => `${i.name} (${i.stock_qty})`).join(", ")}
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Add category</h2>
        <div className="form-row">
          <label style={{ flex: 1 }}>
            Category name
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Desserts"
            />
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={handleAddCategory}
            disabled={!newCategoryName.trim()}
          >
            Add category
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2>Add menu item</h2>
        <form className="form-row" onSubmit={handleAdd}>
          <label>
            Category
            <select
              value={newCategoryId}
              onChange={(e) => setNewCategoryId(e.target.value)}
              required
            >
              {categories.length === 0 && <option value="">No categories — add one above</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label>
            Price (OMR)
            <input
              type="number"
              step="0.001"
              min="0"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              required
            />
          </label>
          <label>
            Starting stock
            <input
              type="number"
              min="0"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!newCategoryId}>
            Add item
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Stock levels</h2>
        {items.length === 0 ? (
          <p className="empty-state">No items yet. Add a category and menu item above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>In stock</th>
                  <th>Adjust (+/−)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.name}
                      {item.is_low_stock ? (
                        <span className="badge badge-warn" style={{ marginLeft: 6 }}>
                          Low
                        </span>
                      ) : null}
                    </td>
                    <td>{item.category_name || "—"}</td>
                    <td>
                      <Money amount={item.price} />
                    </td>
                    <td>
                      <strong>{item.stock_qty}</strong>
                    </td>
                    <td>
                      <input
                        type="number"
                        placeholder="e.g. 10 or -5"
                        style={{ width: 120 }}
                        value={adjustQty[item.id] || ""}
                        onChange={(e) =>
                          setAdjustQty((p) => ({ ...p, [item.id]: e.target.value }))
                        }
                      />
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        style={{ width: 140, marginLeft: 8 }}
                        value={adjustReason[item.id] || ""}
                        onChange={(e) =>
                          setAdjustReason((p) => ({ ...p, [item.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-secondary" onClick={() => adjust(item.id)}>
                        Update
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
