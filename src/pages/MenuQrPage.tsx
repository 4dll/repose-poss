import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export default function MenuQrPage() {
  const [qr, setQr] = useState("");
  const menuUrl = useMemo(() => `${window.location.origin}/menu`, []);

  useEffect(() => {
    QRCode.toDataURL(menuUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
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

  return (
    <main className="menu-qr-page">
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
        <a className="btn-secondary" href="/menu" target="_blank" rel="noreferrer">
          Open menu
        </a>
        <button type="button" className="btn-primary" onClick={printQr}>
          Print QR
        </button>
      </div>
    </main>
  );
}
