# Repose Cafe POS

A simple point-of-sale system for a coffee shop. Runs in the browser on one or more computers on your local network.

## Features

- **Orders** — Categories, dine-in tables (5), takeaway, OMR prices
- **Shifts** — Staff login, cash/visa/split payment tracking
- **Reports** — Daily, monthly, custom range, item sales
- **Stock** — Quantities, categories, add items

## Quick start

```bash
cd "pos cafe"
npm install
npm run db:seed
npm run dev
```

Open **http://localhost:5173** on the main computer.

- API: port **3002**
- Data: `data/cafe-pos.db` (SQLite, shared by all PCs)

## Staff logins (default)

| Employee | Username | Password |
|----------|----------|----------|
| Staff 1  | `staff1` | `staff1` |
| Staff 2  | `staff2` | `staff2` |

## Payment (including split)

At checkout choose **All cash**, **All visa**, or **Split** and enter how much was paid each way. Cash + Visa must equal the order total.

## Using 2 computers (same cafe)

Both PCs share **one database** on the computer that runs the server.

### Option A — Development (easiest to try)

1. On the **main PC** (where the app folder lives), run:
   ```bash
   npm run dev
   ```
2. Find the main PC’s IP address:
   - Mac: System Settings → Network, or Terminal: `ipconfig getifaddr en0`
   - Windows: `ipconfig` → IPv4 Address
3. On the **second PC**, open a browser to:
   ```
   http://MAIN_PC_IP:5173
   ```
   Example: `http://192.168.1.50:5173`

Both PCs use the same menu, tables, and orders.

### Option B — Production (stable for daily use)

On the **main PC only**:

```bash
npm run build
npm start
```

On **any PC** on the same Wi‑Fi, open:

```
http://MAIN_PC_IP:3002
```

Example: `http://192.168.1.50:3002`

### Tips

- Keep the main PC **on** and `npm run dev` or `npm start` **running** while the shop is open.
- Both PCs must be on the **same network** (same Wi‑Fi).
- Allow through the firewall if Windows/macOS blocks port **5173** (dev) or **3002** (production).
- Do **not** run two copies of the server on two PCs — only one machine should run the app; others only use the browser.

## Daily workflow

1. **Open shift** — Login (Staff 1 or 2).
2. **Order type** — Dine in (pick table 1–5) or Takeaway.
3. **Add items** — Category → items.
4. **Pay** — Cash, Visa, or Split.
5. **End shift** — Password required; view report.

## Production

```bash
npm run build
HOST=0.0.0.0 PORT=3002 npm start
```
