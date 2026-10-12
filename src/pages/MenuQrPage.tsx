import { FormEvent, useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { getLocalCustomerMenu } from "../api";
import { connectMenuSync, getCustomerMenuUrl, getMenuOrigin } from "../menuSync";
import { useMenuSyncState } from "../components/MenuSyncStatus";

export default function MenuQrPage() {
  const [qr, setQr] = useState("");
  const sync = useMenuSyncState();
  const menuUrl = getCustomerMenuUrl();
  const [address, setAddress] = useState(getMenuOrigin);
  const [setupKey, setSetupKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);

  async function connect(e: FormEvent) {
    e.preventDefault();
    setError("");
    setConnecting(true);
    try {
      await connectMenuSync(address.trim(), setupKey, getLocalCustomerMenu());
      setSetupKey("");
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    QRCode.toDataURL(menuUrl, {
      errorCorrectionLevel: "H",
      margin: 3,
      width: 720,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [menuUrl]);

  function printQr() {
    document.body.classList.add("qr-printing");
    const removePrintClass = () => {
      document.body.classList.remove("qr-printing");
    };
    window.addEventListener("afterprint", removePrintClass, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(removePrintClass, 1000);
    }, 100);
  }

  function downloadPdf() {
    if (!qr) return;

    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const qrSize = 130;
    const qrX = (pageWidth - qrSize) / 2;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(24);
    pdf.text("Repose Cafe", pageWidth / 2, 32, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(15);
    pdf.text("Scan for menu", pageWidth / 2, 44, { align: "center" });

    pdf.addImage(qr, "PNG", qrX, 58, qrSize, qrSize);

    pdf.setFontSize(11);
    pdf.text(menuUrl, pageWidth / 2, 202, { align: "center" });
    pdf.save("repose-menu-qr.pdf");
  }

  return (
    <main className="menu-qr-page">
      <section className="card menu-sync-settings no-print">
        <h2>Online customer menu</h2>
        <p>Connect the POS device that manages your menu. Saved changes publish automatically, and this QR code stays the same.</p>
        {sync?.lastPublishedAt && <p>Last published: {new Date(sync.lastPublishedAt).toLocaleString()}</p>}
        {sync && !editing && !sync.blocked ? (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Change connection</button>
        ) : (
          <form className="form-row" onSubmit={connect}>
            <label>
              Customer website address
              <input type="url" value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="https://your-cafe.vercel.app" />
            </label>
            <label>
              Menu setup key
              <input type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} required autoComplete="off" />
            </label>
            <button type="submit" className="btn-primary" disabled={connecting}>
              {connecting ? "Connecting…" : "Connect and publish this POS menu"}
            </button>
            <p className="menu-sync-help">Use the setup key from your website configuration. Connecting replaces the online menu with the visible items on this POS.</p>
          </form>
        )}
        {error && <p className="alert alert-error" role="alert">{error}</p>}
      </section>
      <section className="menu-qr-card">
        <div className="menu-qr-brand">
          <img src="/repose-logo.png" alt="Repose Cafe" />
          <div>
            <p>Repose Cafe</p>
            <h1>Scan for menu</h1>
          </div>
        </div>

        <div className="menu-qr-code">
          {qr ? <img src={qr} alt={`QR code for ${menuUrl}`} /> : <span>Creating QR code...</span>}
        </div>

        <p className="menu-qr-url">{menuUrl}</p>
      </section>

      <div className="menu-qr-actions no-print">
        <a className="btn-secondary" href={menuUrl} target="_blank" rel="noreferrer">
          Open menu
        </a>
        <button type="button" className="btn-secondary" onClick={downloadPdf} disabled={!qr}>
          Download PDF
        </button>
        <button type="button" className="btn-primary" onClick={printQr}>
          Print QR
        </button>
      </div>
    </main>
  );
}
