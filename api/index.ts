import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initDb } from "../server/db.js";
import { createApp } from "../server/app.js";
import type { Express } from "express";

let app: Express | null = null;
let ready: Promise<void> | null = null;

function ensureReady() {
  if (!ready) {
    ready = (async () => {
      await initDb();
      app = await createApp();
    })();
  }
  return ready;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureReady();
  if (!app) {
    res.status(500).json({ error: "Server failed to start" });
    return;
  }
  return app(req, res);
}
