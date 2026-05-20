import { useEffect, useState } from "react";
import {
  api,
  ItemsReport,
  PeriodReport,
  Shift,
  ShiftReport,
} from "../api";
import { formatMoney } from "../components/Money";
import ShiftReportModal from "../components/ShiftReportModal";

type Tab = "daily" | "monthly" | "range" | "items" | "shifts";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [periodReport, setPeriodReport] = useState<PeriodReport | null>(null);
  const [itemsReport, setItemsReport] = useState<ItemsReport | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (tab === "daily") {
        setPeriodReport(await api.dailyReport(date));
        setItemsReport(null);
      } else if (tab === "monthly") {
        setPeriodReport(await api.monthlyReport(month));
        setItemsReport(null);
      } else if (tab === "range") {
        setPeriodReport(await api.rangeReport(from, to));
        setItemsReport(null);
      } else if (tab === "items") {
        setItemsReport(await api.itemsReport(from, to, groupBy));
        setPeriodReport(null);
      } else if (tab === "shifts") {
        setShifts(await api.shifts(from, to));
        setPeriodReport(null);
        setItemsReport(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [tab, date, month, from, to, groupBy]);

  async function viewShift(id: number) {
    try {
      setShiftReport(await api.shiftReport(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function printDailyReport() {
    document.body.classList.add("daily-report-printing");
    const removePrintClass = () => {
      document.body.classList.remove("daily-report-printing");
    };
    window.addEventListener("afterprint", removePrintClass, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(removePrintClass, 1000);
    }, 100);
  }

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabs no-print">
        {(
          [
            ["daily", "Today / day"],
            ["monthly", "Month"],
            ["range", "Date range"],
            ["items", "Item sales"],
            ["shifts", "Shift history"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <div className="form-row">
          {tab === "daily" && (
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          )}
          {tab === "monthly" && (
            <label>
              Month
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
          )}
          {(tab === "range" || tab === "items" || tab === "shifts") && (
            <>
              <label>
                From
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label>
                To
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </>
          )}
          {tab === "items" && (
            <label>
              Group by
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
          )}
          <button type="button" className="btn-secondary" onClick={load} disabled={loading}>
            Refresh
          </button>
          {tab === "daily" && periodReport && (
            <button type="button" className="btn-primary" onClick={printDailyReport}>
              Print daily report
            </button>
          )}
        </div>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}

      {periodReport && (
        <PeriodSummary report={periodReport} title={tabLabel(tab, date, month, from, to)} />
      )}

      {itemsReport && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h2>Items sold ({itemsReport.from} → {itemsReport.to})</h2>
          <h3 style={{ fontSize: "0.95rem", margin: "1rem 0 0.5rem", color: "var(--muted)" }}>
            Totals for period
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {itemsReport.totals.map((row) => (
                  <tr key={row.item_name}>
                    <td>{row.item_name}</td>
                    <td>{row.qty_sold}</td>
                    <td>{formatMoney(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {groupBy !== "day" && itemsReport.items.length > 0 && (
            <>
              <h3 style={{ fontSize: "0.95rem", margin: "1.25rem 0 0.5rem", color: "var(--muted)" }}>
                By {groupBy}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsReport.items.map((row, i) => (
                      <tr key={`${row.period}-${row.item_name}-${i}`}>
                        <td>{row.period}</td>
                        <td>{row.item_name}</td>
                        <td>{row.qty_sold}</td>
                        <td>{formatMoney(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "shifts" && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h2>Shifts</h2>
          {shifts.length === 0 ? (
            <p className="empty-state">No shifts in this range</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td>{s.staff_name}</td>
                      <td>{s.started_at}</td>
                      <td>{s.ended_at || "Open"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => viewShift(s.id)}
                        >
                          View report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {shiftReport && (
        <ShiftReportModal report={shiftReport} onClose={() => setShiftReport(null)} />
      )}
    </div>
  );
}

function PeriodSummary({ report, title }: { report: PeriodReport; title: string }) {
  const s = report.summary;
  return (
    <div className="card report-print">
      <h2>{title}</h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <MiniStat label="Orders" value={String(s.order_count)} />
        <MiniStat label="Items" value={String(s.items_sold)} />
        <MiniStat label="Cash" value={formatMoney(s.cash_total)} />
        <MiniStat label="Visa" value={formatMoney(s.visa_total)} />
        <MiniStat label="Discounts" value={formatMoney(s.discount_total)} />
        <MiniStat label="Total" value={formatMoney(s.grand_total)} />
      </div>
      {report.byDay.length > 1 && (
        <>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>By day</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Revenue</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {report.byDay.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{formatMoney(d.revenue)}</td>
                    <td>{d.items}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg)", padding: "0.75rem", borderRadius: "var(--radius)" }}>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function tabLabel(tab: Tab, date: string, month: string, from: string, to: string) {
  if (tab === "daily") return `Daily report — ${date}`;
  if (tab === "monthly") return `Monthly report — ${month}`;
  return `Report — ${from} to ${to}`;
}
