import { NavLink, Route, Routes } from "react-router-dom";
import PosPage from "./pages/PosPage";
import StockPage from "./pages/StockPage";
import ReportsPage from "./pages/ReportsPage";

export default function App() {
  return (
    <div className="app">
      <nav className="nav no-print">
        <NavLink to="/" end className="brand-link">
          <img src="/repose-logo.png" alt="Repose Cafe" className="brand-logo" />
          <span>POS</span>
        </NavLink>
        <NavLink to="/stock">Stock</NavLink>
        <NavLink to="/reports">Reports</NavLink>
      </nav>
      <Routes>
        <Route path="/" element={<PosPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </div>
  );
}
