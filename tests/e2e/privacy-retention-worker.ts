import "../../tooling/local/test-ai-guard.mjs";
/* eslint-disable no-restricted-imports -- Runner-only composition exercises the real worker without adding production exports. */
import { runPrivacyWork } from "../../packages/api/src/features/privacy/work";
import { getPool } from "../../packages/db/src/client";

// Runner-only composition; never imported by the application or its build.
const database = new URL(process.env.DATABASE_MIGRATION_URL ?? "invalid:");
if (
	process.env.TEST_INFERENCE_ISOLATION !== "true" ||
	!["localhost", "127.0.0.1"].includes(database.hostname) ||
	database.port !== "55432" ||
	!database.pathname.startsWith("/ci_browser_")
)
	throw new Error("Disposable privacy browser runtime required");
const controller = new AbortController();
let flight: Promise<void> | null = null;
const tick = () => {
	if (flight || controller.signal.aborted) return;
	flight = runPrivacyWork({
		signal: controller.signal,
		trashPolicy: { enabled: true, version: "synthetic-browser-30d", retentionMs: 30 * 86400000 },
	})
		.catch(() => console.error("Synthetic retention tick failed"))
		.finally(() => {
			flight = null;
		});
};
const timer = setInterval(tick, 1000);
tick();
const stop = async () => {
	controller.abort();
	clearInterval(timer);
	await flight;
	await getPool().end();
};
process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());
