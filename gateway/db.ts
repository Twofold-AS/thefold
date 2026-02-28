import { SQLDatabase } from "encore.dev/storage/sqldb";
export const db = new SQLDatabase("gateway", { migrations: "./migrations" });

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[gateway] db warmed"); }
  catch (e) { console.warn("[gateway] warmup failed:", e); }
})();
