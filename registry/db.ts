import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("registry", {
  migrations: "./migrations",
});

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[registry] db warmed"); }
  catch (e) { console.warn("[registry] warmup failed:", e); }
})();
