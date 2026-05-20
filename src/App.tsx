import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { FormEvent, useEffect, useState } from "react";
import PosPage from "./pages/PosPage";
import StockPage from "./pages/StockPage";
import ReportsPage from "./pages/ReportsPage";
import CustomerMenuPage from "./pages/CustomerMenuPage";
import MenuQrPage from "./pages/MenuQrPage";
import { api, Staff } from "./api";

const ADMIN_SESSION_KEY = "repose-admin-session";

export default function App() {
  const location = useLocation();
  const isCustomerMenu = location.pathname === "/menu";
  const [admin, setAdmin] = useState<Staff | null>(() => {
    const stored = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as Staff;
    } catch {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
  });

  function handleAdminLogin(staff: Staff) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(staff));
    setAdmin(staff);
  }

  function handleAdminLogout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAdmin(null);
  }

  if (!isCustomerMenu && !admin) {
    return <AdminLoginPage onLogin={handleAdminLogin} />;
  }

  return (
    <div className={isCustomerMenu ? "customer-app" : "app"}>
      {!isCustomerMenu && (
        <nav className="nav no-print">
        <NavLink to="/" end className="brand-link">
          <img src="/repose-logo.png" alt="Repose Cafe" className="brand-logo" />
          <span>POS</span>
        </NavLink>
        <NavLink to="/stock">Stock</NavLink>
        <NavLink to="/reports">Reports</NavLink>
        <NavLink to="/menu-qr">Menu QR</NavLink>
        <NavLink to="/menu" target="_blank">Customer menu</NavLink>
        <button type="button" className="nav-logout" onClick={handleAdminLogout}>
          Logout
        </button>
        </nav>
      )}
      <Routes>
        <Route path="/" element={<PosPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/menu" element={<CustomerMenuPage />} />
        <Route path="/menu-qr" element={<MenuQrPage />} />
      </Routes>
    </div>
  );
}

function AdminLoginPage({ onLogin }: { onLogin: (staff: Staff) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.classList.remove("receipt-printing", "daily-report-printing", "qr-printing");
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      onLogin(await api.login(username.trim(), password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="admin-login-page">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <img src="/repose-logo.png" alt="Repose Cafe" />
        <h1>Staff login</h1>
        <p>Enter staff credentials to access POS, reports, stock, and QR tools.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label>
          Username
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Checking..." : "Login"}
        </button>
      </form>
    </main>
  );
}
