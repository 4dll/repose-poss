import { initDb } from "./db.js";
import { createApp } from "./app.js";

await initDb();
const app = await createApp();

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Repose Cafe POS API running on http://${HOST}:${PORT}`);
  if (HOST === "0.0.0.0") {
    console.log(`Other devices on your network can use http://<this-computer-ip>:${PORT}`);
  }
});
