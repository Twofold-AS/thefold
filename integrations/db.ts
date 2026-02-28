import { SQLDatabase } from "encore.dev/storage/sqldb";

export const integrationsDB = new SQLDatabase("integrations", {
  migrations: "./migrations",
});

(async () => {
  try { await integrationsDB.queryRow`SELECT 1`; console.log("[integrations] db warmed"); }
  catch (e) { console.warn("[integrations] warmup failed:", e); }
})();
