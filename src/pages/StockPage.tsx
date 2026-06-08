import { FormEvent, useEffect, useState } from "react";
import { api, Category, MenuItem } from "../api";

export default function StockPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("0");
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newShowOnCustomerMenu, setNewShowOnCustomerMenu] = useState(true);
  const [adjustQty, setAdjustQty] = useState<Record<number, string>>({});
  const [adjustReason, setAdjustReason] = useState<Record<number, string>>({});
  const [editCost, setEditCost] = useState<Record<number, string>>({});
  const [editPrice, setEditPrice] = useState<Record<number, string>>({});
  const [savingItems, setSavingItems] = useState<Record<number, boolean>>({});

  async function load() {
    const [stock, cats] = await Promise.all([api.stock(), api.categories()]);
    setItems(stock);
    setCategories(cats);
    setEditCost(Object.fromEntries(stock.map((item) => [item.id, String(item.cost_price ?? 0)])));
    setEditPrice(Object.fromEntries(stock.map((item) => [item.id, String(item.price)])));
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
        costPrice: parseFloat(newCost) || 0,
        stockQty: parseInt(newStock, 10) || 0,
        categoryId: parseInt(newCategoryId, 10),
        showOnCustomerMenu: newShowOnCustomerMenu,
      });
      setNewName("");
      setNewCost("");
      setNewPrice("");
      setNewStock("0");
      setNewShowOnCustomerMenu(true);
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
      const updated = await api.adjustStock(id, qty, adjustReason[id]);
      setAdjustQty((p) => ({ ...p, [id]: "" }));
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                stock_qty: updated.stock_qty,
                is_low_stock: updated.stock_qty <= item.low_stock_threshold ? 1 : 0,
              }
            : item
        )
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveItem(id: number) {
    setError("");
    setSavingItems((current) => ({ ...current, [id]: true }));
    try {
      const updated = await api.updateMenuItem(id, {
        price: parseFloat(editPrice[id]) || 0,
        costPrice: parseFloat(editCost[id]) || 0,
      });
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                price: updated.price,
                cost_price: updated.cost_price,
              }
            : item
        )
      );
      setEditPrice((current) => ({ ...current, [id]: String(updated.price) }));
      setEditCost((current) => ({ ...current, [id]: String(updated.cost_price ?? 0) }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingItems((current) => ({ ...current, [id]: false }));
    }
  }

  async function toggleCustomerMenu(item: MenuItem) {
    setError("");
    setSavingItems((current) => ({ ...current, [item.id]: true }));
    try {
      const updated = await api.updateMenuItem(item.id, {
        showOnCustomerMenu: !item.show_on_customer_menu,
      });
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                show_on_customer_menu: updated.show_on_customer_menu,
              }
            : currentItem
        )
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingItems((current) => ({ ...current, [item.id]: false }));
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Delete ${item.name}? It will be removed from POS and customer menu.`)) return;
    setError("");
    try {
      await api.deleteMenuItem(item.id);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setEditCost((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setEditPrice((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
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
            Cost (OMR)
            <input
              type="number"
              step="0.001"
              min="0"
              value={newCost}
              onChange={(e) => setNewCost(e.target.value)}
              placeholder="0.000"
            />
          </label>
          <label>
            Sale price (OMR)
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
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={newShowOnCustomerMenu}
              onChange={(e) => setNewShowOnCustomerMenu(e.target.checked)}
            />
            Show on customer menu
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
                  <th>Cost</th>
                  <th>Sale price</th>
                  <th>Customer menu</th>
                  <th>In stock</th>
                  <th>Adjust (+/−)</th>
                  <th></th>
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
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        style={{ width: 90 }}
                        value={editCost[item.id] ?? String(item.cost_price ?? 0)}
                        onChange={(e) =>
                          setEditCost((p) => ({ ...p, [item.id]: e.target.value }))
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        style={{ width: 90 }}
                        value={editPrice[item.id] ?? String(item.price)}
                        onChange={(e) =>
                          setEditPrice((p) => ({ ...p, [item.id]: e.target.value }))
                        }
                        />
                      </td>
                    <td>
                      <label className="checkbox-label table-checkbox-label">
                        <input
                          type="checkbox"
                          checked={Boolean(item.show_on_customer_menu)}
                          disabled={savingItems[item.id]}
                          onChange={() => toggleCustomerMenu(item)}
                        />
                        {item.show_on_customer_menu ? "Shown" : "Hidden"}
                      </label>
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
                        Stock
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={savingItems[item.id]}
                        onClick={() => saveItem(item.id)}
                      >
                        {savingItems[item.id] ? "Saved" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        style={{ marginLeft: 8 }}
                        onClick={() => deleteItem(item)}
                      >
                        Delete
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
