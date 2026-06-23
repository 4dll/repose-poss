# Repose Cafe POS

A fast, browser-local point-of-sale system for a coffee shop. Orders, stock, shifts, reports, menu changes, and the signed-in admin are stored in the browser's `localStorage`; there is no database or API request in the normal POS flow.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. The standard menu is added automatically the first time the app is opened in a browser.

## Default staff logins

| Employee | Username | Password |
|---|---|---|
| Aljulanda | `aljulanda` | `123` |
| Ghassan | `ghassan` | `123` |

## Important storage behavior

- Data is saved immediately in the current browser profile and remains after refresh or browser restart.
- Each browser/device has its own independent POS data. A customer-menu tab on the same browser and origin sees the same menu; another device does not.
- Clearing site data/browser storage permanently removes the local POS records. Export or back up browser data before clearing it.
- Local storage is appropriate for a single-device POS and not for shared, multi-device sales reporting.

## Build / serve

```bash
npm run build
npm start
```

`npm start` serves the built static app on your local network. No `DATABASE_URL`, Supabase project, or backend process is required.
