import { SQLDatabase } from "encore.dev/storage/sqldb";

export const integrationsDB = new SQLDatabase("integrations", {
  migrations: "./migrations",
});
