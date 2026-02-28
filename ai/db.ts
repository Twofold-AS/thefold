import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("ai", { migrations: "./migrations" });

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[ai] db warmed"); }
  catch (e) { console.warn("[ai] warmup failed:", e); }
})();
