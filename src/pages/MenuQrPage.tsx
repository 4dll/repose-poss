import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, DATA_CHANGE_EVENT } from "../api";
import { encodePublishedMenu } from "../menuShare";

export default function MenuQrPage() {
  const [qr, setQr] = useState("");
  const [menuUrl, setMenuUrl] = useState(() => `${window.location.origin}/menu`);
  const displayUrl = `${window.location.origin}/menu`;

  const refreshQr = useCallback(async () => {
    setQr("");
    try {
      const [items, categories] = await Promise.all([api.customerMenu(), api.categories()]);
      const encodedMenu = await encodePublishedMenu(categories, items);
      setMenuUrl(`${window.location.origin}/menu#menu=${encodedMenu}`);
    } catch {
      setMenuUrl(`${window.location.origin}/menu?v=${Date.now()}`);
    }
  }, []);

  useEffect(() => {
    QRCode.toDataURL(menuUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 920,
      color: {
        dark: "#111111",
        light: "#ffffff",
      },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [menuUrl]);

  useEffect(() => {
    void refreshQr();
  }, [refreshQr]);

  useEffect(() => {
    function refreshOnVisible() {
      if (document.visibilityState === "visible") {
        void refreshQr();
      }
    }

    window.addEventListener(DATA_CHANGE_EVENT, refreshQr);
    window.addEventListener("storage", refreshQr);
    window.addEventListener("focus", refreshQr);
    document.addEventListener("visibilitychange", refreshOnVisible);
    const refreshTimer = window.setInterval(refreshQr, 5000);

    return () => {
      window.removeEventListener(DATA_CHANGE_EVENT, refreshQr);
      window.removeEventListener("storage", refreshQr);
      window.removeEventListener("focus", refreshQr);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.clearInterval(refreshTimer);
    };
  }, [refreshQr]);

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

        <p className="menu-qr-url">{displayUrl}</p>
      </section>

      <div className="menu-qr-actions no-print">
        <a className="btn-secondary" href={menuUrl} target="_blank" rel="noreferrer">
          Open menu
        </a>
        <button type="button" className="btn-secondary" onClick={() => void refreshQr()}>
          Refresh QR
        </button>
        <button type="button" className="btn-primary" onClick={printQr}>
          Print QR
        </button>
      </div>
    </main>
  );
}
