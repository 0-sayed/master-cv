import "../../tooling/local/test-ai-guard.mjs";
/* eslint-disable no-restricted-imports -- Runner-only composition exercises the real worker without adding production exports. */
import { syntheticMailEnvironment } from "../../tooling/local/e2e-mail.mjs";

// Runner-only composition; never imported by the application or its build.
const database = new URL(process.env.DATABASE_MIGRATION_URL ?? "invalid:");
if (
	process.env.TEST_INFERENCE_ISOLATION !== "true" ||
	!["localhost", "127.0.0.1"].includes(database.hostname) ||
	database.port !== new URL(process.env.DATABASE_URL ?? "invalid:").port ||
	!(
		database.pathname.startsWith("/ci_browser_") ||
		(process.env.GITHUB_ACTIONS === "true" && database.pathname === "/postgres")
	)
)
	throw new Error("Disposable privacy browser runtime required");
// Apply the same sink as Playwright before importing server configuration or claiming any mail work.
Object.assign(process.env, syntheticMailEnvironment(process.env));
async function main() {
	const { runPrivacyWork } = await import("../../packages/api/src/features/privacy/work");
	const { getPool } = await import("../../packages/db/src/client");
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
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
