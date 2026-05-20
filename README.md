# Repose Cafe POS

A simple point-of-sale system for a coffee shop. Runs in the browser — locally on your network or hosted on **Vercel** with **Supabase** (PostgreSQL).

## Features

- **Orders** — Categories, dine-in tables (5), takeaway, OMR prices
- **Shifts** — Staff login, cash/visa/split payment tracking
- **Reports** — Daily, monthly, custom range, item sales
- **Stock** — Quantities, categories, add items

## Quick start (local)

1. Create a [Supabase](https://supabase.com) project.
2. In Supabase **SQL Editor**, run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to your Supabase connection string  
   (Project Settings → Database → **URI**, use **Transaction** pooler for serverless).
4. Install and run:

```bash
npm install
npm run db:seed
npm run dev
```

Open **http://localhost:5173**.

- API: port **3002** (proxied from Vite)
- Database: Supabase Postgres (shared by all devices when deployed)

## Staff logins (default)

| Employee | Username | Password |
|----------|----------|----------|
| Staff 1  | `staff1` | `staff1` |
| Staff 2  | `staff2` | `staff2` |

## Deploy to Vercel + Supabase

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor.
3. Copy the **Transaction** pooler connection string (port **6543**).

### 2. Vercel

1. Push this repo to GitHub.
2. Import the project in [vercel.com](https://vercel.com) → **Add New Project**.
3. Add environment variable:
   - `DATABASE_URL` = your Supabase Postgres URI (transaction pooler)
4. Deploy. Vercel runs `npm run build`, serves the React app from `dist/client`, and routes every `/api/*` request through [`api/server.ts`](api/server.ts) (see `vercel.json` rewrites).

After deploy, open your Vercel URL (e.g. `https://your-app.vercel.app`). Multiple devices can use the same URL and share one database.

If the UI shows **`NOT_FOUND`** when calling the API, redeploy after pulling the latest changes — that usually means `/api` was not wired to the serverless function.

### 3. Seed menu (first time)

From your machine with `DATABASE_URL` set in `.env`:

```bash
npm run db:seed
```

## Payment (including split)

At checkout choose **All cash**, **All visa**, or **Split** and enter how much was paid each way. Cash + Visa must equal the order total.

## Using 2 computers (local dev)

Both PCs can use **http://MAIN_PC_IP:5173** while `npm run dev` runs on the main PC (same `DATABASE_URL` in Supabase).

## Using 2 computers (Vercel)

Open the same Vercel URL on each device — no local server required.

## Daily workflow

1. **Open shift** — Login (Staff 1 or 2).
2. **Order type** — Dine in (pick table 1–5) or Takeaway.
3. **Add items** — Category → items.
4. **Pay** — Cash, Visa, or Split.
5. **End shift** — Password required; view report.

## Production (self-hosted)

```bash
npm run build
HOST=0.0.0.0 PORT=3002 npm start
```

Serve **http://YOUR_IP:3002** on your LAN. Requires `DATABASE_URL` in the environment.
