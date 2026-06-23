import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  CartLine,
  Category,
  formatDateTime,
  MenuItem,
  Order,
  OrderLine,
  Shift,
  ShiftReport,
  TableStatus,
} from "../api";
import { Money } from "../components/Money";
import ShiftReportModal from "../components/ShiftReportModal";
import StaffLoginModal from "../components/StaffLoginModal";

type Bill = {
  order: Order;
  lines: OrderLine[];
  draft?: boolean;
};

export default function PosPage() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMode, setPaymentMode] = useState<"cash" | "visa" | "split">("cash");
  const [cashPay, setCashPay] = useState("");
  const [visaPay, setVisaPay] = useState("");
  const [discountType, setDiscountType] = useState<"" | "percent" | "fixed">("");
  const [discountValue, setDiscountValue] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<"open" | "close" | null>(null);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemStock, setNewItemStock] = useState("99");
  const [newItemCategoryId, setNewItemCategoryId] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [serviceType, setServiceType] = useState<"dine_in" | "takeaway" | null>(null);
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableStatus[]>([]);
  const [lastBill, setLastBill] = useState<Bill | null>(null);
  const [pendingPrint, setPendingPrint] = useState(0);
  const printedJobRef = useRef(0);

  useEffect(() => {
    if (!pendingPrint || !lastBill || printedJobRef.current === pendingPrint) return;
    document.body.classList.add("receipt-printing");
    const removePrintClass = () => {
      document.body.classList.remove("receipt-printing");
    };
    window.addEventListener("afterprint", removePrintClass, { once: true });
    const timer = window.setTimeout(() => {
      printedJobRef.current = pendingPrint;
      window.print();
      window.setTimeout(removePrintClass, 1000);
    }, 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", removePrintClass);
      removePrintClass();
    };
  }, [lastBill, pendingPrint]);

  function loadOrderIntoCart(order: Order, lines: OrderLine[]) {
    setOpenOrderId(order.id);
    setDiscountType((order.discount_type as typeof discountType) || "");
    setDiscountValue(order.discount_value ? String(order.discount_value) : "");
    setCart(
      lines.map((l) => ({
        menuItemId: l.menu_item_id,
        name: l.item_name,
        qty: l.qty,
        unitPrice: l.unit_price,
      }))
    );
  }

  function resetOrderSession() {
    setCart([]);
    setDiscountType("");
    setDiscountValue("");
    setPaymentMode("cash");
    setCashPay("");
    setVisaPay("");
    setOpenOrderId(null);
    setSelectedTable(null);
    setSelectedCategoryId(null);
  }

  function showAndPrintBill(bill: Bill) {
    setLastBill(bill);
    setPendingPrint((job) => job + 1);
  }

  function draftBill(): Bill {
    return {
      draft: true,
      order: {
        id: 0,
        shift_id: selectedShiftId ?? 0,
        created_at: new Date().toISOString(),
        updated_at: null,
        service_type: serviceType ?? "takeaway",
        table_number: serviceType === "dine_in" ? selectedTable : null,
        status: "open",
        payment_method: null,
        subtotal,
        discount_amount: discountAmount,
        total,
        cash_amount: 0,
        visa_amount: 0,
        discount_type: discountType || null,
        discount_value: dVal,
      },
      lines: cart.map((line, index) => ({
        id: index + 1,
        menu_item_id: line.menuItemId,
        item_name: line.name,
        qty: line.qty,
        unit_price: line.unitPrice,
        cost_price: 0,
        line_total: line.qty * line.unitPrice,
        cost_total: 0,
        payment_method: "cash",
      })),
    };
  }

  async function printCurrentBill() {
    if (cart.length === 0) {
      setError("Add items before printing a bill");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (serviceType === "dine_in" && openOrderId) {
        const bill = await api.updateOrder(openOrderId, {
          lines: linesPayload(),
          discountType: discountType || undefined,
          discountValue: dVal || undefined,
        });
        showAndPrintBill({ ...bill, draft: true });
        await load();
      } else {
        showAndPrintBill(draftBill());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const load = useCallback(async () => {
    const [m, shifts, cats, tbl] = await Promise.all([
      api.menu(),
      api.activeShifts(),
      api.categories(),
      api.tables(),
    ]);
    setMenu(m);
    setCategories(cats);
    setTables(tbl);
    setActiveShifts(shifts);
    if (cats.length && !newItemCategoryId) {
      setNewItemCategoryId(String(cats[0].id));
    }
    if (shifts.length && !selectedShiftId) {
      setSelectedShiftId(shifts[0].id);
    }
    if (selectedShiftId && !shifts.find((sh) => sh.id === selectedShiftId)) {
      setSelectedShiftId(shifts[0]?.id ?? null);
    }
  }, [selectedShiftId, newItemCategoryId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const categoryItems = menu.filter((i) => i.category_id === selectedCategoryId);

  const canUseMenu =
    !!selectedShiftId &&
    (serviceType === "takeaway" || (serviceType === "dine_in" && openOrderId !== null));

  async function chooseServiceType(type: "dine_in" | "takeaway") {
    setError("");
    setServiceType(type);
    setCart([]);
    setDiscountType("");
    setDiscountValue("");
    setPaymentMode("cash");
    setCashPay("");
    setVisaPay("");
    setOpenOrderId(null);
    setSelectedTable(null);
    setSelectedCategoryId(null);
    await load();
  }

  async function selectTable(tableNumber: number) {
    if (!selectedShiftId) return;
    setError("");
    setLoading(true);
    try {
      const { order, lines } = await api.openTable(tableNumber, selectedShiftId);
      setSelectedTable(tableNumber);
      loadOrderIntoCart(order, lines);
      setSuccess(`Table ${tableNumber} — add or update items`);
      setTimeout(() => setSuccess(""), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function changeServiceOrTable() {
    setServiceType(null);
    resetOrderSession();
  }

  const linesPayload = () =>
    cart.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      unitPrice: l.unitPrice,
    }));

  async function handleOpenShift(username: string, password: string) {
    const shift = await api.openShift(username, password);
    setLoginMode(null);
    await load();
    setSelectedShiftId(shift.id);
    setSuccess("Shift opened");
    setTimeout(() => setSuccess(""), 2000);
  }

  async function handleCloseShift(username: string, password: string) {
    if (!closingShift) return;
    const report = await api.closeShift(closingShift.id, username, password);
    setLoginMode(null);
    setClosingShift(null);
    setShiftReport(report);
    await load();
    if (selectedShiftId === closingShift.id) setSelectedShiftId(null);
  }

  function startCloseShift(shift: Shift) {
    setClosingShift(shift);
    setLoginMode("close");
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    setError("");
    try {
      const cat = await api.addCategory(newCategoryName.trim());
      setNewCategoryName("");
      await load();
      setNewItemCategoryId(String(cat.id));
      setSelectedCategoryId(cat.id);
      setSuccess(`Category "${cat.name}" added`);
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice || !newItemCategoryId) return;
    setAddingItem(true);
    setError("");
    try {
      const item = await api.addMenuItem({
        name: newItemName.trim(),
        price: parseFloat(newItemPrice),
        stockQty: parseInt(newItemStock, 10) || 0,
        categoryId: parseInt(newItemCategoryId, 10),
      });
      setNewItemName("");
      setNewItemPrice("");
      setNewItemStock("99");
      setShowAddItem(false);
      setSelectedCategoryId(item.category_id);
      await load();
      setSuccess(`Added ${item.name}`);
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAddingItem(false);
    }
  }

  function addToCart(item: MenuItem) {
    if (!selectedShiftId) {
      setError("Open a shift and select it first");
      return;
    }
    if (!serviceType) {
      setError("Choose Dine in or Takeaway first");
      return;
    }
    if (serviceType === "dine_in" && !openOrderId) {
      setError("Select a table first");
      return;
    }
    if (item.stock_qty <= 0) {
      setError(`${item.name} is out of stock`);
      return;
    }
    setError("");
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        if (existing.qty >= item.stock_qty) {
          setError(`Only ${item.stock_qty} in stock`);
          return prev;
        }
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          qty: 1,
          unitPrice: item.price,
        },
      ];
    });
  }

  function updateLine(id: number, patch: Partial<CartLine>) {
    setCart((prev) =>
      prev.map((l) => (l.menuItemId === id ? { ...l, ...patch } : l))
    );
  }

  function removeLine(id: number) {
    setCart((prev) => prev.filter((l) => l.menuItemId !== id));
  }

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  let discountAmount = 0;
  const dVal = parseFloat(discountValue) || 0;
  if (discountType === "percent" && dVal > 0) {
    discountAmount = Math.min(subtotal, (subtotal * dVal) / 100);
  } else if (discountType === "fixed" && dVal > 0) {
    discountAmount = Math.min(subtotal, dVal);
  }
  const total = subtotal - discountAmount;

  function getPaymentAmounts() {
    if (paymentMode === "cash") return { cashAmount: total, visaAmount: 0 };
    if (paymentMode === "visa") return { cashAmount: 0, visaAmount: total };
    return {
      cashAmount: parseFloat(cashPay) || 0,
      visaAmount: parseFloat(visaPay) || 0,
    };
  }

  function setCashWithRest(amount: string) {
    setCashPay(amount);
    const cash = parseFloat(amount) || 0;
    const rest = Math.max(0, Math.round((total - cash) * 1000) / 1000);
    setVisaPay(rest > 0 ? rest.toFixed(3) : "");
    setPaymentMode("split");
  }

  async function saveTableOrder() {
    if (!openOrderId || !selectedShiftId) {
      setError("Select a table and open an order first");
      return;
    }
    if (cart.length === 0) {
      setError("Add at least one item before saving");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.updateOrder(openOrderId, {
        lines: linesPayload(),
        discountType: discountType || undefined,
        discountValue: dVal || undefined,
      });
      setSuccess(`Table ${selectedTable} order updated`);
      setTimeout(() => setSuccess(""), 2000);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function moveTable() {
    if (!openOrderId || selectedTable == null) return;
    const answer = window.prompt("Move this order to which free table? (1–5)", String(selectedTable));
    if (answer === null) return;
    const targetTable = Number(answer);
    if (!Number.isInteger(targetTable) || targetTable < 1 || targetTable > 5) {
      setError("Enter a table number from 1 to 5");
      return;
    }
    if (targetTable === selectedTable) return;

    setLoading(true);
    setError("");
    try {
      // Save the cart first so a move never loses any unsaved changes.
      await api.updateOrder(openOrderId, {
        lines: linesPayload(),
        discountType: discountType || undefined,
        discountValue: dVal || undefined,
      });
      await api.moveTable(openOrderId, targetTable);
      setSelectedTable(targetTable);
      setSuccess(`Order moved from Table ${selectedTable} to Table ${targetTable}`);
      setTimeout(() => setSuccess(""), 2500);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function payTableOrder() {
    if (!openOrderId || cart.length === 0) {
      setError("Add items before payment");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.updateOrder(openOrderId, {
        lines: linesPayload(),
        discountType: discountType || undefined,
        discountValue: dVal || undefined,
      });
      const bill = await api.payOrder(openOrderId, getPaymentAmounts());
      setSuccess(`Table ${selectedTable} paid — table is free`);
      setTimeout(() => setSuccess(""), 2500);
      showAndPrintBill(bill);
      resetOrderSession();
      setServiceType("dine_in");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function completeTakeaway() {
    if (!selectedShiftId || cart.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const bill = await api.createTakeawayOrder({
        shiftId: selectedShiftId,
        lines: linesPayload(),
        ...getPaymentAmounts(),
        discountType: discountType || undefined,
        discountValue: dVal || undefined,
      });
      showAndPrintBill(bill);
      resetOrderSession();
      setServiceType("takeaway");
      setSuccess("Takeaway order complete");
      setTimeout(() => setSuccess(""), 2000);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function clearTable() {
    if (!openOrderId || !confirm(`Clear Table ${selectedTable}? This removes the open order.`)) return;
    setLoading(true);
    try {
      await api.cancelOrder(openOrderId);
      resetOrderSession();
      setServiceType("dine_in");
      setSuccess("Table cleared");
      setTimeout(() => setSuccess(""), 2000);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const canOpenShift = activeShifts.length < 2;

  const menuHint =
    !selectedShiftId
      ? "Open a shift to start"
      : !serviceType
        ? "Pick Dine in or Takeaway above"
        : serviceType === "dine_in" && !openOrderId
          ? "Pick a table above, then tap a category"
          : selectedCategoryId
            ? "Tap items to add to the order"
            : "Tap a category below";

  return (
    <div className="pos-page">
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-info">{success}</div>}

      <header className="pos-header no-print">
        <div className="shift-bar shift-bar--compact">
          {activeShifts.length === 0 && (
            <p className="pos-header-hint">No shift open.</p>
          )}
          {canOpenShift && (
            <button type="button" className="btn-primary" onClick={() => setLoginMode("open")}>
              Start shift
            </button>
          )}
          {activeShifts.map((sh) => (
            <div
              key={sh.id}
              className={`shift-chip shift-chip--compact ${selectedShiftId === sh.id ? "shift-chip--selected" : ""}`}
              onClick={() => setSelectedShiftId(sh.id)}
              onKeyDown={(e) => e.key === "Enter" && setSelectedShiftId(sh.id)}
              role="button"
              tabIndex={0}
            >
              <strong>{sh.staff_name}</strong>
              <button
                type="button"
                className="btn-danger btn-danger--sm no-print"
                onClick={(e) => {
                  e.stopPropagation();
                  startCloseShift(sh);
                }}
              >
                End
              </button>
            </div>
          ))}
        </div>

        {selectedShiftId && (
          <div className="pos-toolbar">
            <div className="pos-toolbar-group">
              <span className="pos-toolbar-label">Type</span>
              {!serviceType ? (
                <div className="pos-chip-row">
                  <button
                    type="button"
                    className="pos-chip pos-chip--action"
                    onClick={() => chooseServiceType("dine_in")}
                  >
                    Dine in
                  </button>
                  <button
                    type="button"
                    className="pos-chip pos-chip--action"
                    onClick={() => chooseServiceType("takeaway")}
                  >
                    Takeaway
                  </button>
                </div>
              ) : (
                <div className="pos-chip-row">
                  <span className="pos-chip pos-chip--on">
                    {serviceType === "dine_in" ? "Dine in" : "Takeaway"}
                    {serviceType === "dine_in" && selectedTable != null && (
                      <> · T{selectedTable}</>
                    )}
                  </span>
                  <button type="button" className="pos-chip pos-chip--link" onClick={changeServiceOrTable}>
                    Change
                  </button>
                </div>
              )}
            </div>

            {serviceType === "dine_in" && (
              <div className="pos-toolbar-group pos-toolbar-group--tables">
                <span className="pos-toolbar-label">Table</span>
                <div className="pos-chip-row pos-table-row">
                  {tables.map((t) => (
                    <button
                      key={t.number}
                      type="button"
                      className={`pos-table-chip ${t.status} ${selectedTable === t.number ? "selected" : ""}`}
                      disabled={!selectedShiftId || loading}
                      onClick={() => selectTable(t.number)}
                      title={t.status === "occupied" ? "Occupied" : "Free"}
                    >
                      <span className="pos-table-num">{t.number}</span>
                      {t.status === "occupied" && t.total != null && t.total > 0 && (
                        <span className="pos-table-amt">
                          <Money amount={t.total} />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="pos-main">
        <section
          className={`pos-menu card ${canUseMenu ? "" : "pos-menu--locked"}`}
          aria-disabled={!canUseMenu}
        >
          <div className="pos-menu-head">
            <div>
              <h2 className="pos-menu-title">Categories</h2>
              <p className="pos-menu-hint">{menuHint}</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAddItem((v) => !v)}
            >
              {showAddItem ? "Cancel" : "+ Add item"}
            </button>
          </div>

          <div className="category-strip" role="tablist" aria-label="Menu categories">
            {categories.map((cat) => {
              const count = menu.filter((i) => i.category_id === cat.id).length;
              const isActive = selectedCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`category-pill ${isActive ? "category-pill--active" : ""}`}
                  disabled={!selectedShiftId}
                  onClick={() => setSelectedCategoryId(cat.id)}
                >
                  <span className="category-pill-name">{cat.name}</span>
                  <span className="category-pill-count">{count}</span>
                </button>
              );
            })}
          </div>

          {showAddItem && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "1rem",
                background: "var(--bg)",
                borderRadius: "var(--radius)",
              }}
            >
              <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>Add category</h3>
              <div className="form-row" style={{ marginBottom: "1rem" }}>
                <label style={{ flex: 1 }}>
                  New category name
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Desserts"
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim()}
                >
                  Add category
                </button>
              </div>

              <h3 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>Add menu item</h3>
              <form onSubmit={handleAddItem} className="form-row">
                <label>
                  Category
                  <select
                    value={newItemCategoryId}
                    onChange={(e) => setNewItemCategoryId(e.target.value)}
                    required
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Item name
                  <input
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g. Iced Latte"
                    required
                  />
                </label>
                <label>
                  Price (OMR)
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    placeholder="1.500"
                    required
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    min="0"
                    value={newItemStock}
                    onChange={(e) => setNewItemStock(e.target.value)}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={addingItem}>
                  {addingItem ? "Adding…" : "Save item"}
                </button>
              </form>
            </div>
          )}

          {!selectedCategoryId ? (
            <div className="category-grid category-grid--hero">
              {categories.map((cat) => {
                const count = menu.filter((i) => i.category_id === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className="category-btn category-btn--hero"
                    disabled={!selectedShiftId}
                    onClick={() => setSelectedCategoryId(cat.id)}
                  >
                    <span className="category-btn-name">{cat.name}</span>
                    <span className="category-btn-meta">{count} items</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="pos-items-panel">
              <h3 className="pos-items-heading">{selectedCategory?.name}</h3>
              {categoryItems.length === 0 ? (
                <p className="empty-state">No items in this category. Tap + Add item.</p>
              ) : (
                <div className="menu-grid">
                  {categoryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="menu-btn"
                      disabled={!canUseMenu || item.stock_qty <= 0}
                      onClick={() => addToCart(item)}
                    >
                      <span className="name">{item.name}</span>
                      <span className="price">
                        <Money amount={item.price} />
                      </span>
                      <span className="stock">
                        Stock: {item.stock_qty}
                        {item.stock_qty <= item.low_stock_threshold && item.stock_qty > 0 && (
                          <span className="badge badge-warn" style={{ marginLeft: 4 }}>
                            Low
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <aside className={`pos-cart card ${canUseMenu ? "" : "pos-cart--locked"}`}>
          <h2>
            Current order
            {serviceType === "dine_in" && selectedTable && (
              <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: "0.9rem" }}>
                {" "}
                — Table {selectedTable}
              </span>
            )}
            {serviceType === "takeaway" && (
              <span style={{ fontWeight: 500, color: "var(--muted)", fontSize: "0.9rem" }}>
                {" "}
                — Takeaway
              </span>
            )}
          </h2>
          {cart.length === 0 ? (
            <p className="empty-state" style={{ padding: "2rem 0" }}>
              {serviceType === "dine_in"
                ? "Select table, pick category, add items"
                : "Pick category, then tap items"}
            </p>
          ) : (
            <>
              {cart.map((line) => (
                <div key={line.menuItemId} className="cart-line">
                  <div>
                    <strong>{line.name}</strong>
                    <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      <Money amount={line.unitPrice} /> each
                    </div>
                  </div>
                  <div className="qty-controls">
                    <button
                      type="button"
                      onClick={() => updateLine(line.menuItemId, { qty: Math.max(1, line.qty - 1) })}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 24, textAlign: "center" }}>{line.qty}</span>
                    <button
                      type="button"
                      onClick={() => updateLine(line.menuItemId, { qty: line.qty + 1 })}
                    >
                      +
                    </button>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div>
                      <Money amount={line.qty * line.unitPrice} />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ marginTop: 4, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => removeLine(line.menuItemId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: "1rem" }}>
                <div className="form-row">
                  <label>
                    Discount
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
                    >
                      <option value="">None</option>
                      <option value="percent">Percent %</option>
                      <option value="fixed">Fixed OMR</option>
                    </select>
                  </label>
                  {discountType && (
                    <label>
                      Amount
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === "percent" ? "10" : "0.500"}
                      />
                    </label>
                  )}
                </div>

                <div className="summary-row">
                  <span>Subtotal</span>
                  <span>
                    <Money amount={subtotal} />
                  </span>
                </div>
                {discountAmount > 0 && (
                  <div className="summary-row">
                    <span>Discount</span>
                    <span>
                      −<Money amount={discountAmount} />
                    </span>
                  </div>
                )}
                <div className="summary-row total">
                  <span>Total</span>
                  <span>
                    <Money amount={total} />
                  </span>
                </div>

                <div className="payment-block">
                  <label>Payment</label>
                  <div className="payment-buttons">
                    <button
                      type="button"
                      className={`btn-cash ${paymentMode === "cash" ? "active" : ""}`}
                      onClick={() => setPaymentMode("cash")}
                    >
                      All cash
                    </button>
                    <button
                      type="button"
                      className={`btn-visa ${paymentMode === "visa" ? "active" : ""}`}
                      onClick={() => setPaymentMode("visa")}
                    >
                      All visa
                    </button>
                    <button
                      type="button"
                      className={paymentMode === "split" ? "btn-primary" : "btn-secondary"}
                      onClick={() => {
                        setPaymentMode("split");
                        setCashPay("");
                        setVisaPay(total.toFixed(3));
                      }}
                    >
                      Split
                    </button>
                  </div>
                  {paymentMode === "split" && (
                    <div className="form-row" style={{ marginTop: "0.75rem" }}>
                      <label>
                        Cash (OMR)
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={cashPay}
                          onChange={(e) => setCashWithRest(e.target.value)}
                        />
                      </label>
                      <label>
                        Visa (OMR)
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={visaPay}
                          onChange={(e) => {
                            setVisaPay(e.target.value);
                            setPaymentMode("split");
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {paymentMode === "split" && (
                    <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.35rem" }}>
                      Must total <Money amount={total} />
                    </p>
                  )}
                </div>

                {serviceType === "dine_in" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%" }}
                      disabled={loading || cart.length === 0}
                      onClick={printCurrentBill}
                    >
                      Print bill
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%" }}
                      disabled={loading || !openOrderId}
                      onClick={saveTableOrder}
                    >
                      {loading ? "Saving…" : "Save to table"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%" }}
                      disabled={loading || !openOrderId}
                      onClick={moveTable}
                    >
                      Move to another table
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "100%" }}
                      disabled={loading || !openOrderId || cart.length === 0}
                      onClick={payTableOrder}
                    >
                      {loading ? "Please wait…" : "Pay & close table"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%", color: "var(--danger)" }}
                      disabled={loading || !openOrderId}
                      onClick={clearTable}
                    >
                      Clear table
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: "100%" }}
                      disabled={loading || cart.length === 0}
                      onClick={printCurrentBill}
                    >
                      Print bill
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ width: "100%" }}
                      disabled={loading || !selectedShiftId}
                      onClick={completeTakeaway}
                    >
                      {loading ? "Saving…" : "Complete order"}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {shiftReport && (
        <ShiftReportModal report={shiftReport} onClose={() => setShiftReport(null)} />
      )}

      {loginMode === "open" && (
        <StaffLoginModal
          mode="open"
          onSubmit={handleOpenShift}
          onCancel={() => setLoginMode(null)}
        />
      )}

      {loginMode === "close" && closingShift && (
        <StaffLoginModal
          mode="close"
          staffName={closingShift.staff_name}
          defaultUsername={closingShift.staff_username || ""}
          usernameReadonly
          onSubmit={handleCloseShift}
          onCancel={() => {
            setLoginMode(null);
            setClosingShift(null);
          }}
        />
      )}

      {lastBill && (
        <BillReceipt
          bill={lastBill}
          onPrint={() => {
            setPendingPrint((job) => job + 1);
          }}
          onClose={() => setLastBill(null)}
        />
      )}
    </div>
  );
}

function BillReceipt({
  bill,
  onPrint,
  onClose,
}: {
  bill: Bill;
  onPrint: () => void;
  onClose: () => void;
}) {
  const { order, lines } = bill;
  const isPaid = order.status === "paid" && !bill.draft;
  const printedAt = order.updated_at || order.created_at;
  const serviceLabel =
    order.service_type === "dine_in" && order.table_number
      ? `Dine in - Table ${order.table_number}`
      : "Takeaway";

  return (
    <div className="bill-overlay">
      <div className="bill-actions no-print">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn-primary" onClick={onPrint}>
          Print bill
        </button>
      </div>

      <section className="bill-print" aria-label="Printed bill">
        <div className="bill-header">
          <h1>Repose Cafe</h1>
          <p className="bill-status">{isPaid ? "Paid bill" : "Unpaid bill"}</p>
        </div>

        <div className="bill-meta">
          <div>
            <span>Bill</span>
            <strong>{order.id ? `#${order.id}` : "Draft"}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{serviceLabel}</strong>
          </div>
          <div>
            <span>Time</span>
            <strong>{formatDateTime(printedAt)}</strong>
          </div>
        </div>

        <div className="bill-lines">
          {lines.map((line) => (
            <div key={line.id} className="bill-line">
              <div className="bill-line-name">{line.item_name}</div>
              <div className="bill-line-detail">
                <span>
                  {line.qty} x {line.unit_price.toFixed(3)}
                </span>
                <strong>{line.line_total.toFixed(3)}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="bill-summary">
          <div>
            <span>Subtotal</span>
            <span>{order.subtotal.toFixed(3)}</span>
          </div>
          {order.discount_amount > 0 && (
            <div>
              <span>Discount</span>
              <span>-{order.discount_amount.toFixed(3)}</span>
            </div>
          )}
          <div className="bill-total">
            <span>{isPaid ? "Total" : "Amount due"}</span>
            <span>{order.total.toFixed(3)} OMR</span>
          </div>
          {isPaid && (
            <>
              <div>
                <span>Cash</span>
                <span>{order.cash_amount.toFixed(3)}</span>
              </div>
              <div>
                <span>Visa</span>
                <span>{order.visa_amount.toFixed(3)}</span>
              </div>
            </>
          )}
        </div>

        <div className="bill-footer">
          <strong>Thank you</strong>
          <span>Repose Cafe</span>
        </div>
      </section>
    </div>
  );
}
