import { syncRuntimeRole } from "./runtime-role.mjs";

if (!process.env.DATABASE_MIGRATION_URL) throw new Error("DATABASE_MIGRATION_URL is required");
if (!process.env.RUNTIME_DB_PASSWORD) throw new Error("RUNTIME_DB_PASSWORD is required");

const migrationUrl = new URL(process.env.DATABASE_MIGRATION_URL);
migrationUrl.hostname = "127.0.0.1";
await syncRuntimeRole(migrationUrl.toString(), "sirawise_runtime", process.env.RUNTIME_DB_PASSWORD);
