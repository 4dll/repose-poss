import express from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { parseCustomerMenu } from "../shared/customer-menu.js";
import { getMenuStore, type MenuStore } from "./menu-store.js";

export function createMenuApp(options: { store?: MenuStore; publishKey?: () => string | undefined } = {}) {
  const app = express();
  const paths = ["/api/live-menu", "/api/server"];
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });
  app.options(paths, (_req, res) => { res.sendStatus(204); });
  app.use(express.json({ limit: "1mb" }));
  const repository = () => options.store ?? getMenuStore();

  app.get(paths, async (_req, res) => {
    try {
      res.json(await repository().read());
    } catch {
      res.status(503).json({ error: "The online menu is temporarily unavailable. Please try again shortly." });
    }
  });

  app.put(paths, async (req, res) => {
    const secret = (options.publishKey ?? (() => process.env.MENU_PUBLISH_KEY))();
    if (!secret || secret.length < 32) {
      res.status(503).json({ error: "Online menu publishing has not been configured." });
      return;
    }
    const supplied = req.get("Authorization")?.replace(/^Bearer /, "") ?? "";
    const digest = (value: string) => createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(secret))) {
      res.status(401).json({ error: "The menu setup key is incorrect. Reconnect in Menu QR." });
      return;
    }
    let menu;
    let baseRevision;
    let mutationId;
    try {
      menu = parseCustomerMenu(req.body?.menu);
      baseRevision = req.body?.baseRevision;
      mutationId = req.body?.mutationId;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if ((baseRevision !== null && (typeof baseRevision !== "string" || !uuid.test(baseRevision))) ||
          typeof mutationId !== "string" || !uuid.test(mutationId)) throw new Error("Invalid revision.");
    } catch {
      res.status(400).json({ error: "Invalid menu data. Check item names, prices, stock and categories." });
      return;
    }
    try {
      const published = await repository().publish(menu, baseRevision, mutationId);
      if (!published) {
        res.status(409).json({ error: "Another POS has updated the online menu. Review it, then reconnect to publish this POS menu." });
        return;
      }
      res.json(published);
    } catch {
      res.status(503).json({ error: "The online menu could not be updated. Changes are saved on this POS and will retry." });
    }
  });
  app.use((_req, res) => { res.status(404).json({ error: "Not found" }); });
  app.use((error: { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status === 413 ? 413 : 400).json({ error: "Invalid or oversized menu request." });
  });
  return app;
}
