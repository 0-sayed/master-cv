import { beforeAll, expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { saveJobTarget, selectResumeJob } from "../career/job-targets";
import { resumeService } from "../resume/service";
import { runAiOperations } from "./operation-worker";
import { operationService } from "./operations";
import { withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticReviewRuntime } from "./testing/runtime";
import { prepareVariantReview } from "./variant-sources";

const database = aiTestDatabase();
let cv: string;
let revision: string;
let job: Awaited<ReturnType<typeof saveJobTarget>>;
let selection: Awaited<ReturnType<typeof selectResumeJob>>;
let mode: "supported" | "missing" | "unavailable" | "changed" | "fabricated" = "supported";
let calls: Record<string, unknown>[] = [];
const runtime = {
	...syntheticReviewRuntime,
	fetch: async (_url: unknown, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body));
		calls.push(body);
		const payload = JSON.parse(body.messages.at(-1).content);
		const task = payload.selections.find((entry: { id: string }) => entry.id === "variant-verification-task");
		let output: unknown;
		if (task) {
			if (mode === "unavailable") return Response.json({ error: "Synthetic unavailable" }, { status: 503 });
			const inventory = JSON.parse(task.text);
			if (mode === "changed")
				selection = await database.run(() =>
					selectResumeJob("alice", {
						resumeId: cv,
						expectedUpdatedAt: revision,
						jobId: job.jobId,
						jobRevision: job.revision,
						expectedSelectionRevision: selection.revision,
					}),
				);
			output = {
				schemaVersion: 1,
				verdicts:
					mode === "missing"
						? []
						: inventory.claims.map((claim: { id: string; evidenceIds: string[] }) => ({
								claimId: claim.id,
								verdict: "supported",
								evidenceIds: claim.evidenceIds,
								reason: "Synthetic supported",
							})),
				absence: inventory.absence.map((entry: { id: string }) => ({ id: entry.id, verdict: "confirmed_absent" })),
				premises: inventory.premises.map((entry: { id: string }) => ({
					id: entry.id,
					verdict: "supported",
					reason: "Synthetic checked",
				})),
				retention: null,
				coverage: { status: "complete", reason: "Synthetic complete" },
				quality: { status: "appropriate", reason: "Advisory only" },
			};
		} else {
			const cvEvidence = JSON.parse(
				payload.selections.find((entry: { id: string }) => entry.id === "variant-cv-evidence").text,
			);
			const jobContext = JSON.parse(
				payload.selections.find((entry: { id: string }) => entry.id === "variant-job-context").text,
			);
			output = {
				requirements: [
					{
						id: "react",
						spanIds: [jobContext.segments[0].id],
						importance: "essential",
						verdict: "supported",
						evidenceIds: [cvEvidence[0].id],
						explanation: mode === "fabricated" ? "Used React and SAP and increased revenue 30%." : "Used React.",
					},
				],
				notes: [],
			};
		}
		return Response.json({
			id: "scripted-variant",
			model: "synthetic/model",
			provider: "Test",
			choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }],
			usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10, cost: 0.00001 },
		});
	},
};
const run = <T>(work: () => T) => database.run(() => withAiRuntime(runtime, work));
beforeAll(async () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Used React.</p>";
	data.summary.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	data.basics.name = "Private Name";
	data.basics.email = "private@example.test";
	data.basics.phone = "+966501234567";
	cv = await run(() => resumeService.create({ userId: "alice", name: "Synthetic", tags: [], data, locale: "en-US" }));
	revision = (
		await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [cv])
	).rows[0].updated_at.toISOString();
	job = await run(() =>
		saveJobTarget("alice", { role: "Engineer", employer: "", text: "React required. SAP preferred." }),
	);
	selection = await run(() =>
		selectResumeJob("alice", {
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
		}),
	);
	await database
		.admin()
		.query(
			"INSERT INTO ai_processing_consent(id,user_id,route_id,route_revision,notice_version,purpose,config_revision) VALUES ('consent','alice','synthetic','1','1','review.job-evidence','1')",
		);
	await database
		.admin()
		.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
		);
});

async function start(requestKey: string) {
	const prepared = await run(() =>
		prepareVariantReview("alice", {
			kind: "review.job-evidence",
			resumeId: cv,
			expectedUpdatedAt: revision,
			jobId: job.jobId,
			jobRevision: job.revision,
			expectedSelectionRevision: selection.revision,
		}),
	);
	return run(() =>
		operationService.start("alice", {
			kind: prepared.kind,
			parameters: prepared.parameters,
			sources: prepared.sources,
			requestKey,
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
		}),
	);
}

it("delivers complete independently verified evidence once without changing the CV", async () => {
	calls = [];
	const operation = await start("complete");
	await run(() => runAiOperations());
	expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
		state: "waiting_review",
		failureCode: null,
	});
	expect(await run(() => operationService.getResult("alice", operation.id))).toMatchObject({
		kind: "review.job-evidence",
		output: { requirements: [{ id: "react" }] },
	});
	expect(calls).toHaveLength(2);
	for (const secret of ["Private Name", "private@example.test", "+966501234567"])
		expect(JSON.stringify(calls)).not.toContain(secret);
	expect(calls[0]).toMatchObject({
		model: "openai/gpt-6-luna",
		reasoning: { effort: "low" },
		provider: { only: ["azure"] },
	});
	expect(calls[1]).toMatchObject({
		model: "deepseek/deepseek-v4.1-flash-1017",
		reasoning: { effort: "low" },
		provider: { only: ["together"] },
	});
	await run(() => runAiOperations());
	expect(
		(await database.admin().query("SELECT updated_at FROM resume WHERE id=$1", [cv])).rows[0].updated_at.toISOString(),
	).toBe(revision);
	expect(
		(
			await database
				.admin()
				.query("SELECT count(*)::int n FROM ai_usage_ledger WHERE operation_id=$1 AND kind='settle'", [operation.id])
		).rows[0].n,
	).toBe(1);
});

it.each(["missing", "unavailable", "fabricated", "changed"] as const)(
	"withholds %s results and releases the reservation",
	async (value) => {
		mode = value;
		calls = [];
		const operation = await start(value);
		await run(() => runAiOperations());
		expect(await run(() => operationService.get("alice", operation.id))).toMatchObject({
			state: "failed",
			resultId: null,
		});
		expect(
			(
				await database
					.admin()
					.query("SELECT kind FROM ai_usage_ledger WHERE operation_id=$1 ORDER BY created_at", [operation.id])
			).rows.map((row) => row.kind),
		).toEqual(["reserve", "release"]);
		if (value === "fabricated") expect(calls).toHaveLength(1);
		mode = "supported";
	},
);
