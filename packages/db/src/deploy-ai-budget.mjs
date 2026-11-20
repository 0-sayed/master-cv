import { readFile } from "node:fs/promises";
import { ensureAiBudget } from "./ai-budget.mjs";

if (!process.env.DATABASE_MIGRATION_URL) throw new Error("DATABASE_MIGRATION_URL is required");

const migrationUrl = new URL(process.env.DATABASE_MIGRATION_URL);
migrationUrl.hostname = "127.0.0.1";
const route = JSON.parse(await readFile("/app/apps/server/ai-route.json", "utf8"));
const inserted = await ensureAiBudget(migrationUrl.toString(), route);
console.info(`AI budget rows inserted: ${inserted}`);
