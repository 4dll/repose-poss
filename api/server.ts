// The local POS needs only this narrow public-menu API in production.
// Do not expose the legacy sales/stock API when enabling online menu publishing.
import { createMenuApp } from "../server/menu-app.js";
export default createMenuApp();
