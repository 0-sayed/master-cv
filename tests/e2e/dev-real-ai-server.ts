/* eslint-disable no-restricted-imports -- Dev-only composition reuses private server startup; never imported by app/build. */
import { createRequire } from "node:module";
import { createApp } from "../../apps/server/src/http/app";
import { startAiScheduler } from "../../apps/server/src/startup/ai-scheduler";
import { startCareerScheduler } from "../../apps/server/src/startup/career-scheduler";
import { runStartupChecks } from "../../apps/server/src/startup/checks";
import { withAiRuntime } from "../../packages/api/src/features/ai/route-policy";
import { initializeAuth } from "../../packages/auth/src/config";
import { getPool } from "../../packages/db/src/client";
import { getRedis } from "../../packages/db/src/redis";
import { realAiConfig } from "../../tooling/local/real-ai-config";

const { serve } = createRequire(new URL("../../apps/server/package.json", import.meta.url))("@hono/node-server");
import { createRealAiRuntime } from "../../tooling/local/real-ai-runtime";
const config = realAiConfig(process.env);
const runtime = createRealAiRuntime(process.env);
async function start() {
	await runStartupChecks();
	await initializeAuth();
	const app = createApp();
	const server = serve({
		hostname: "127.0.0.1",
		port: config.port,
		fetch: (...args: Parameters<typeof app.fetch>) => withAiRuntime(runtime, () => app.fetch(...args)),
	});
	const ai = withAiRuntime(runtime, () => startAiScheduler());
	const career = startCareerScheduler();
	console.info("LOCAL REAL AI — dev only, provisional models");
	console.info(`${config.appUrl} · synthetic/sample CVs only · writer Luna/Azure low · verifier DeepSeek/Together low`);
	console.info(
		config.allowance
			? "Selected local owner allowance: 50 operations"
			: "Set LOCAL_REAL_AI_OWNER_ID for the local owner's 50-operation allowance",
	);
	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		const httpDrain = new Promise<void>((resolve, reject) =>
			server.close((error?: Error) => (error ? reject(error) : resolve())),
		);
		void Promise.allSettled([httpDrain, ai.stop(), career.stop()]).then(async (results) => {
			await getPool().end();
			getRedis()?.disconnect();
			process.exit(results.some((result) => result.status === "rejected") ? 1 : 0);
		});
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}
void start().catch((error) => {
	console.error(error);
	process.exit(1);
});
