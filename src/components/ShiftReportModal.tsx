import { ShiftReport, formatDateTime } from "../api";
import { formatMoney } from "./Money";

type Props = {
  report: ShiftReport;
  onClose: () => void;
};

export default function ShiftReportModal({ report, onClose }: Props) {
  const { shift, lines, summary } = report;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        className="card report-print"
        style={{ maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Shift end report — {shift.staff_name}</h2>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
          Started: {formatDateTime(shift.started_at)}
          {shift.ended_at && <> · Ended: {formatDateTime(shift.ended_at)}</>}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <Stat label="Orders" value={String(summary.order_count)} />
          <Stat label="Items sold" value={String(summary.items_sold)} />
          <Stat label="Cash" value={formatMoney(summary.cash_total)} />
          <Stat label="Visa" value={formatMoney(summary.visa_total)} />
          <Stat label="Cost" value={formatMoney(summary.cost_total)} />
          <Stat label="Benefit" value={formatMoney(summary.profit_total)} />
          <Stat label="Discounts" value={formatMoney(summary.discount_total)} />
          <Stat label="Grand total" value={formatMoney(summary.grand_total)} highlight />
        </div>

        <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>All items sold</h3>
        {lines.length === 0 ? (
          <p className="empty-state">No sales this shift</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Pay</th>
                  <th>Cost</th>
                  <th>Benefit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDateTime(l.order_time).split(",")[1]?.trim() || formatDateTime(l.order_time)}</td>
                    <td>{l.item_name}</td>
                    <td>{l.qty}</td>
                    <td>
                      <span className={`badge badge-${l.payment_method}`}>{l.payment_method}</span>
                    </td>
                    <td>{formatMoney(l.cost_total)}</td>
                    <td>{formatMoney(l.line_total - l.cost_total)}</td>
                    <td>{formatMoney(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="no-print" style={{ marginTop: "1.25rem", display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            Print report
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? "#ecfdf5" : "var(--bg)",
        padding: "0.75rem",
        borderRadius: "var(--radius)",
      }}
    >
      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: 700 }}>{value}</div>
    </div>
  );
}
