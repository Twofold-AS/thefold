import { SQLDatabase } from "encore.dev/storage/sqldb";

export const db = new SQLDatabase("mcp", {
  migrations: "./migrations",
});

(async () => {
  try { await db.queryRow`SELECT 1`; console.log("[mcp] db warmed"); }
  catch (e) { console.warn("[mcp] warmup failed:", e); }
})();
