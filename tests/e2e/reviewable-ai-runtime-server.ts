import "../../tooling/local/test-ai-guard.mjs";
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
const { serve } = createRequire(new URL("../../apps/server/package.json", import.meta.url))("@hono/node-server");
import { reviewHandlers } from "../../packages/api/src/features/ai/review-handlers";
import { withAiRuntime } from "../../packages/api/src/features/ai/route-policy";
import { syntheticReviewRuntime as syntheticRuntime } from "../../packages/api/src/features/ai/testing/runtime";
import { variantReviewHandlers } from "../../packages/api/src/features/ai/variant-handlers";
import { splitReviewClaims } from "../../packages/schema/src/resume/ai-review";
import { scriptedVariantResponse } from "./fixtures/variant-transport";

type Selection = { id: string; kind: string; section: string; text: string };
const runtime = {
	...syntheticRuntime,
	handlers: { ...reviewHandlers, ...variantReviewHandlers },
	fetch: (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		const selections: Selection[] = JSON.parse(body.messages.at(-1).content).selections;
		const variantResult = scriptedVariantResponse(selections);
		if (variantResult instanceof Response) return Promise.resolve(variantResult);
		if (variantResult !== undefined)
			return Promise.resolve(
				new Response(
					JSON.stringify({
						id: "synthetic-variant",
						model: "synthetic/model",
						provider: "Test",
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: JSON.stringify(variantResult) },
								finish_reason: "stop",
							},
						],
						usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.00001 },
					}),
					{ headers: { "content-type": "application/json" } },
				),
			);
		const source = selections.find((selection) => selection.id !== "intent");
		if (!source) throw new Error("Missing synthetic source");
		const intent = selections.find((selection) => selection.id === "intent")?.text ?? "";
		const extraction = source.kind === "unconfirmed_source";
		const result = extraction
			? {
					candidates: [
						{
							id: "candidate",
							section: source.section,
							entityId: "synthetic-entry",
							field: "description",
							value: source.text,
							confirmation: "needs_review",
							evidenceIds: [source.id],
							rawDateText: null,
						},
					],
					questions: [],
				}
			: {
					proposals: intent.startsWith("result")
						? []
						: [
								{
									id: "proposal",
									passageId: source.id,
									text: intent.includes("INVALID_METRIC")
										? "Led delivery with a 30% increase."
										: source.text.replace(/Built/gu, "Developed").replace(/بنيت/gu, "طورت"),
									reason: "Synthetic wording fixture",
									evidenceIds: [source.id],
								},
							],
					questions: [
						{ id: "outcome", passageId: source.id, prompt: "What result can you confirm?", evidenceIds: [source.id] },
					],
					notes: [],
				};
		const verify = selections.find((s) => s.id === "verification-claims");
		if ("proposals" in result)
			for (const proposal of result.proposals)
				Object.assign(proposal, { claims: splitReviewClaims(proposal.text, proposal.evidenceIds) });
		const finalResult = verify
			? {
					schemaVersion: 3,
					responseAssessment: { status: "appropriate", reason: "Synthetic response assessment." },
					factRetention: {
						status: "retained",
						evidenceIds: [
							...new Set((JSON.parse(verify.text) as { evidenceIds: string[] }[]).flatMap((c) => c.evidenceIds)),
						],
						reason: "Synthetic retention verdict.",
					},
					verdicts: (JSON.parse(verify.text) as { claimId: string; evidenceIds: string[] }[]).map((c) => ({
						claimId: c.claimId,
						evidenceIds: c.evidenceIds,
						verdict: "supported",
						reason: "Synthetic supported source",
					})),
				}
			: result;
		return Promise.resolve(
			new Response(
				JSON.stringify({
					id: "synthetic-review",
					model: "synthetic/model",
					provider: "Test",
					choices: [
						{ index: 0, message: { role: "assistant", content: JSON.stringify(finalResult) }, finish_reason: "stop" },
					],
					usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.00001 },
				}),
				{ headers: { "content-type": "application/json" } },
			),
		);
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
