import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import PosPage from "./pages/PosPage";
import StockPage from "./pages/StockPage";
import ReportsPage from "./pages/ReportsPage";
import CustomerMenuPage from "./pages/CustomerMenuPage";
import MenuQrPage from "./pages/MenuQrPage";

export default function App() {
  const location = useLocation();
  const isCustomerMenu = location.pathname === "/menu";

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
