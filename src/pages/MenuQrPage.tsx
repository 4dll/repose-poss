import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";

export default function MenuQrPage() {
  const [qr, setQr] = useState("");
  const menuUrl = `${window.location.origin}/menu`;

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
