import "dotenv/config";
import { createMenuApp } from "./menu-app.js";

const port = Number(process.env.PORT) || 3002;
createMenuApp().listen(port, process.env.HOST || "127.0.0.1", () => {
  console.log(`Customer menu API listening on port ${port}`);
});
