/* eslint-disable no-restricted-imports -- Test-only composition exercises real, private server startup and synthetic runtime without exposing production exports. */
// Test-only composition. This entry is never imported by the application or production build.
import { createRequire } from "node:module";
import { createApp } from "../../apps/server/src/http/app";
import { startAiScheduler } from "../../apps/server/src/startup/ai-scheduler";
import { startCareerScheduler } from "../../apps/server/src/startup/career-scheduler";
import { runStartupChecks } from "../../apps/server/src/startup/checks";
import { initializeAuth } from "../../packages/auth/src/config";
import { getPool } from "../../packages/db/src/client";
import { getRedis } from "../../packages/db/src/redis";
const { serve } = createRequire(process.cwd() + "/apps/server/package.json")("@hono/node-server");
import { withAiRuntime } from "../../packages/api/src/features/ai/route-policy";
import { syntheticRuntime } from "../../packages/api/src/features/ai/testing/runtime";

const review = syntheticRuntime.handlers.review;
if (!review) throw new Error("Missing synthetic review handler");
let calls = 0;
const runtime = {
	...syntheticRuntime,
	handlers: {
		...syntheticRuntime.handlers,
		failure: { ...review, buildInput: () => Promise.reject(new Error("Synthetic input failure")) },
		hold: {
			...review,
			buildInput: async (...args: Parameters<typeof review.buildInput>) => {
				await new Promise((resolve) => setTimeout(resolve, 3000));
				return review.buildInput(...args);
			},
		},
	},
	fetch: (...args: Parameters<typeof fetch>) => {
		calls++;
		if (calls % 2 === 1)
			return Promise.resolve(
				new Response('{"error":{"message":"Synthetic rate limit"}}', {
					status: 429,
					headers: { "content-type": "application/json" },
				}),
			);
		if (!syntheticRuntime.fetch) throw new Error("Missing synthetic transport");
		return syntheticRuntime.fetch(...args);
	},
};

async function start() {
	await runStartupChecks();
	await initializeAuth();
	const app = createApp();
	const server = serve({
		port: Number(process.env.PORT),
		fetch: (...args: Parameters<typeof app.fetch>) => withAiRuntime(runtime, () => app.fetch(...args)),
	});
	const ai = withAiRuntime(runtime, () => startAiScheduler());
	const career = startCareerScheduler();
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
