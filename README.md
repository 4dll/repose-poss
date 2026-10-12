# Repose Cafe POS

A browser-local point-of-sale system for a coffee shop with an optional live customer menu. Orders, stock, shifts, reports, menu changes, and the signed-in admin stay in the browser's `localStorage`. A connected POS also publishes customer-facing menu changes to a shared PostgreSQL store.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The current POS data snapshot is added automatically the first time the app is opened in a browser.

## Default staff logins

| Employee | Username | Password |
|---|---|---|
| Aljulanda | `aljulanda` | `123` |
| Ghassan | `ghassan` | `123` |
| Kumar | `kumar` | `132` |
| Shwe | `shwe` | `132` |
| Admin | `admin` | `1234` |

## Important storage behavior

- Data is saved immediately in the current browser profile and remains after refresh or browser restart.
- The first local run starts from the latest copied POS snapshot: staff, categories, menu items, stock, shifts, orders, and report history.
- Each browser/device has its own independent POS records. Choose one POS browser to publish the customer menu. Customers on any device read the shared menu, refreshing every five seconds.
- Offline menu changes stay queued locally and retry when the POS reconnects or reopens. The sync banner shows pending changes and failures; a local save does not mean an online publish succeeded.
- Clearing site data/browser storage permanently removes the local POS records. Export or back up browser data before clearing it.
- Local storage is appropriate for a single-device POS and not for shared, multi-device sales reporting.

## Build / serve

```bash
npm run build
npm start
```

`npm start` serves the built static app on your local network. Local POS transactions work without a database. The public customer menu requires the online setup below.

## Connect the live customer menu

1. Configure a working PostgreSQL `DATABASE_URL` on the Vercel project. Supabase's transaction pooler works; use the actual connection string from the project's settings. The obsolete connection from an unavailable project must be replaced. Remote connections use TLS certificate verification.
2. Generate a private key with `openssl rand -hex 32`. Set it as `MENU_PUBLISH_KEY` in the same Vercel environment. Keep it out of Git, frontend `VITE_` variables, URLs and QR codes.
3. Deploy this version. `/api/live-menu` routes to the small menu API; `/menu` serves the customer page. The legacy sales API is not exposed by the deployed function. The API creates a separate `customer_menu_publication` table, with row-level security enabled, using the database owner connection. It does not migrate or overwrite existing sales tables.
4. On the POS device containing the current menu, open **Menu QR**. Enter the deployed HTTPS website address and the setup key, then choose **Connect and publish this POS menu**. This intentionally publishes this browser's visible items as the online menu. Other browsers must not be connected casually, since each has separate local data.
5. Wait for **Customer menu is up to date**, then open the menu on another device. Use the QR/PDF generated here. Its permanent `/menu` link follows future updates without reprinting; old links containing `#menu=` also now read the live menu instead of their frozen snapshot.

The setup key stays on the publishing browser only and authorizes menu publishing. Public responses contain item names, prices, stock quantities, categories and a publication timestamp—never costs, staff credentials, orders or reports. Sales, stock adjustments, price changes, visibility changes, new items and deletions all trigger publishing when the visible menu changes. Visible items without a category appear under **Other**.

An interrupted upload retries with the same mutation ID. A revision check stops a stale POS from silently replacing another device's publication. If the banner reports a conflict, review the customer menu before reconnecting and explicitly publishing the intended POS menu. Clearing browser storage removes both local POS data and pending publications.

If publishing fails, customers keep seeing the last successfully published menu. A customer fetch failure shows an error rather than silently substituting a fresh browser's sample menu. Connecting and publishing the first menu must happen before sharing the public link.

For local API development, copy `.env.example` to `.env`, fill in the database URL and publishing key, and run `npm run dev`. It starts Vite and the menu API; Vite proxies `/api/live-menu` to port 3002. To connect a locally served POS directly to the online menu, enter the online website address in Menu QR. Optionally set `VITE_MENU_ORIGIN` to that public origin before building; it is an address, not a secret.

## Verification

```bash
npm test
npx tsc --noEmit
npx tsc -p tsconfig.server.json --noEmit
npm run build
```

The PostgreSQL integration test runs when `TEST_DATABASE_URL` points to a disposable test database. It creates and drops a unique test schema. Do not point it at production. The other tests cover public field filtering, validation, publishing authentication, persistent offline queuing, retries and conflicts without a database.
