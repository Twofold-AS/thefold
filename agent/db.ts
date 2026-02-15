import { SQLDatabase } from "encore.dev/storage/sqldb";

// Shared database reference for the agent service
export const db = new SQLDatabase("agent", { migrations: "./migrations" });
