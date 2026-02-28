import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("templates", {
  migrations: "./migrations",
});

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[templates] db warmed"); }
  catch (e) { console.warn("[templates] warmup failed:", e); }
})();
