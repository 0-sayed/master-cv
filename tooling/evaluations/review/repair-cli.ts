import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { parseArgs } from "node:util";

async function main() {
	const { values } = parseArgs({
		options: { source: { type: "string" }, out: { type: "string", short: "o" }, "smoke-file": { type: "string" } },
		strict: true,
	});
	if (!values.source || !values.out) throw new Error("SOURCE_AND_EXPLICIT_OUTPUT_REQUIRED");
	const source = resolve(values.source);
	const out = resolve(values.out);
	if (out === source || !relative(source, out).startsWith("..")) throw new Error("REPAIR_OUTPUT_MUST_BE_SEPARATE");
	process.env.APP_URL ??= "http://localhost:3000";
	process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@localhost:1/synthetic";
	process.env.AUTH_SECRET ??= "synthetic-offline-audit";
	globalThis.fetch = () => Promise.reject(new Error("OFFLINE_AUDIT_NETWORK_FORBIDDEN"));
	const [
		{ readRepairSource, createRepairPlan },
		{ cases },
		{ auditInvalidOutput },
		{ estimateBenchmark },
		{ loadModels },
		{ smokeCases, validateSmoke, caseVersions },
	] = await Promise.all([
		import("./repair"),
		import("./corpus"),
		import("./invalid-output"),
		import("./runner"),
		import("./config"),
		import("./study"),
	]);
	const { manifest, history, journalBody } = await readRepairSource(source);
	const plan = createRepairPlan(manifest, history);
	const latest = [...new Map(history.previousCalls.map((c) => [c.key, c])).values()];
	const diagnostics = latest
		.filter((c) => c.outcome === "invalid")
		.map((c) => ({
			key: c.key,
			model: c.model,
			reasoning: c.reasoning,
			category: c.category,
			caseId: c.caseId,
			...auditInvalidOutput(c.category === "extraction" ? "extraction" : "wording", c.output),
			disposition: plan.slots.find((s) => s.key === c.key),
		}));
	const tabulation: Record<string, { invalidSessions: number; issues: Record<string, number> }> = {};
	for (const d of diagnostics) {
		const group = (tabulation[`${d.model}@${d.reasoning}/${d.category}`] ??= { invalidSessions: 0, issues: {} });
		group.invalidSessions++;
		for (const issue of d.issues) {
			const label = `${issue.path.map((p) => (typeof p === "number" ? "*" : String(p))).join(".")}: ${issue.message}`;
			group.issues[label] = (group.issues[label] ?? 0) + 1;
		}
	}
	const estimateSlots = (slots: typeof plan.slots) => {
		const result = {
			sessions: slots.length,
			estimatedUsd: 0,
			openRouterEstimatedUsd: 0,
			openaiEstimatedUsd: 0,
			upperBoundUsd: 0,
			openRouterUpperBoundUsd: 0,
			openaiUpperBoundUsd: 0,
		};
		for (const slot of slots) {
			const c = cases.find((c) => c.id === slot.caseId);
			const m = manifest.models.find(
				(m) => m.model === slot.model && m.provider === slot.provider && m.reasoning === slot.reasoning,
			);
			if (!c || !m) throw new Error("REPAIR_SLOT_MISMATCH");
			const e = estimateBenchmark([m], [c], 1, [], loadModels());
			for (const field of [
				"estimatedUsd",
				"openRouterEstimatedUsd",
				"openaiEstimatedUsd",
				"upperBoundUsd",
				"openRouterUpperBoundUsd",
				"openaiUpperBoundUsd",
			] as const)
				result[field] += e[field];
		}
		return result;
	};
	const done = new Set(latest.map((c) => c.key));
	const raws = new Set(history.rawRecords.map((r) => r.key));
	const pending = history.pendingReservations.filter(
		(r) => r.reservedMicros > 0 && !done.has(r.key.replace(/:verify$/u, "")) && !raws.has(r.key),
	);
	const selectedSmoke = smokeCases(cases, manifest.models);
	const rerun = plan.slots.filter((s) => s.action === "rerun");
	const paidAgain = rerun.filter((s) => (latest.find((c) => c.key === s.key)?.costMicros ?? 0) > 0);
	const report = {
		sourceStudyHash: manifest.hash,
		targetStudyHash: plan.toStudyHash,
		scoredEvents: history.previousCalls.length,
		latestSessions: latest.length,
		tabulation,
		diagnostics,
		rerun: estimateSlots(rerun),
		paidAgain: estimateSlots(paidAgain),
		priorPaidAgainUsd: paidAgain.reduce((n, s) => n + (latest.find((c) => c.key === s.key)?.costMicros ?? 0), 0) / 1e6,
		reused: plan.slots.filter((s) => s.action === "reuse").length,
		genuineModelErrors: plan.slots.filter((s) => s.action === "model-error").length,
		pendingBilling: { noResponse: pending, unsettledRetries: history.unsettledRetryReservations },
		smoke: {
			previousValid: false,
			reason:
				"Global study identity includes all task schemas/prompts, even absent extraction cases. Wording prompt also changes.",
			categories: ["wording", "extraction", "missing-info", "injection"],
			cases: selectedSmoke.map((c) => c.id),
			estimate: estimateBenchmark(manifest.models, selectedSmoke, 1, [], loadModels(), "smoke"),
		},
		basis:
			"Exact sum of deterministic gold-output token forecasts and archived price assumptions, including one judge per session and the OpenRouter fee. Actual new usage/cost is unknowable without inference. Upper bounds are per attempt; runtime reserves five attempts and may stop at original budgets.",
		readyToResume: false,
	};
	await mkdir(out, { recursive: true });
	await writeFile(join(out, "repair-plan.json"), JSON.stringify(plan, null, 2));
	await writeFile(join(out, "models.json"), JSON.stringify(manifest.models, null, 2));
	await writeFile(join(out, "repair-report.json"), JSON.stringify(report, null, 2));
	if (!values["smoke-file"]) return;
	const smoke = JSON.parse(await readFile(resolve(values["smoke-file"]), "utf8"));
	if (
		smoke.mode !== "live" ||
		smoke.study?.phase !== "smoke" ||
		smoke.study.hash !== plan.toStudyHash ||
		smoke.study.smokeCategory !== undefined
	)
		throw new Error("LIVE_SMOKE_MISMATCH");
	const calibration = validateSmoke(smoke, manifest.models, selectedSmoke);
	if (calibration.length !== manifest.models.length) throw new Error("REPAIR_SMOKE_VARIANTS_INCOMPLETE");
	// No pending payment is discarded: copied reservations still block the runner.
	await mkdir(join(out, "source"), { recursive: true });
	await writeFile(join(out, "source", "manifest.json"), await readFile(join(source, "manifest.json")), { flag: "wx" });
	await writeFile(join(out, "source", "calls.jsonl"), journalBody, { flag: "wx" });
	await writeFile(join(out, "calls.jsonl"), journalBody, { flag: "wx" });
	const original = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
	await writeFile(
		join(out, "manifest.json"),
		JSON.stringify(
			{
				...original,
				hash: plan.toStudyHash,
				calibration,
				priorSpendMicros: manifest.priorSpendMicros + Math.ceil(smoke.reservedUsd * 1e6),
				priorOpenaiSpendMicros: manifest.priorOpenaiSpendMicros + Math.ceil((smoke.reservedOpenaiUsd ?? 0) * 1e6),
				repair: true,
				smokeCategory: undefined,
				versions: caseVersions(cases.filter((c) => !c.exploratory)),
			},
			null,
			2,
		),
		{ flag: "wx" },
	);
	await writeFile(join(out, "repair-report.json"), JSON.stringify({ ...report, readyToResume: true }, null, 2));
}
await main();
