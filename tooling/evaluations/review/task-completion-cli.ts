import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { required } from "./required";

process.loadEnvFile = () => {};
process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET ??= "synthetic-offline-completion";
const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: { live: { type: "boolean" }, fake: { type: "boolean" }, out: { type: "string", short: "o" } },
});
const action = positionals[0];
if (!values.live) globalThis.fetch = () => Promise.reject(new Error("OFFLINE_COMPLETION_NETWORK_FORBIDDEN"));
if (values.live && values.fake) throw new Error("CHOOSE_LIVE_OR_FAKE");
const { completionContext, outputRoot, sourceFolder, readJson, saveJson } = await import("./task-completion-context");
const { repairGuards, translationSeed, translationReviewOutputs } = await import("./task-completion");
const context = await completionContext();
const { source, cases, models, unfinished, binding, bindingHash } = context;
const root = values.out ?? outputRoot;

if (action === "prepare") {
	if (values.live || values.fake) throw new Error("PREPARE_IS_OFFLINE");
	const { preflightRequests } = await import("./preflight");
	const preflight = await preflightRequests(
		models,
		cases.filter((c) => c.holdout && ["translation", "cover-letter"].includes(c.category)),
	);
	if (!preflight.passed) throw new Error("COMPLETION_PREFLIGHT_FAILED");
	await saveJson(join(root, "preflight.json"), preflight);
	await saveJson(join(root, "controls.json"), context.controlResult);
	await saveJson(join(root, "plan.json"), {
		version: 1,
		binding,
		bindingHash,
		forecast: context.forecast,
		canaryReuse:
			"Original paid binding retained; current exact probe/verifier hashes and votes re-audited. Corrected smoke passes unchanged category gate.",
		arabicApproval: context.approval,
		sourceFolder,
		translationSessions: 11,
		coverLetterSessions: 324,
	});
	const directory = join(root, "translation-ratings");
	const outputs = translationReviewOutputs(cases, source.calls);
	const { translationGlossary } = await import("./contracts/translation/contract");
	await saveJson(join(directory, "approved-glossary.json"), translationGlossary);
	await saveJson(join(directory, "private-binding.json"), { version: 1, bindingHash, outputs });
	for (let i = 0; i < outputs.length; i += 12)
		await saveJson(join(directory, `batch-${String(i / 12 + 1).padStart(2, "0")}.json`), {
			version: 1,
			outputs: outputs.slice(i, i + 12).map(({ key: _key, writerDigest: _digest, ...o }) => o),
		});
	for (const n of [1, 2])
		await saveJson(join(directory, `ratings-pass-${n}.template.json`), {
			version: 1,
			reviewKind: "ai",
			model: "gpt-6-astra",
			reviewer: `Astra independent pass ${n}`,
			sessionId: "REPLACE_WITH_REAL_INDEPENDENT_SESSION_ID",
			ratings: outputs.map((o) => ({
				outputId: o.id,
				fidelity: null,
				naturalness: null,
				arabic: null,
				unsupportedFact: null,
				notes: "",
				mqm: null,
			})),
		});
	console.log(
		JSON.stringify({
			prepared: true,
			translation: unfinished.length,
			letters: 324,
			ratings: outputs.length,
			forecast: context.forecast,
		}),
	);
} else if (["resume-translation", "cover-letter-full"].includes(action ?? "")) {
	if (!values.live && !values.fake) throw new Error("EXPLICIT_LIVE_OR_FAKE_REQUIRED");
	if (values.live && !process.env.OPENROUTER_BENCHMARK_KEY) throw new Error("PROCESS_BENCHMARK_KEY_REQUIRED");
	const plan = await readJson(join(root, "plan.json"));
	if (plan.bindingHash !== bindingHash) throw new Error("COMPLETION_PLAN_CHANGED");
	const translation = action === "resume-translation";
	const category = translation ? "translation" : "cover-letter";
	if (!translation && values.live) {
		const prior = await readJson(join(root, "translation", "results.json"));
		if (
			prior.mode !== "live" ||
			prior.stopReason ||
			prior.incomplete.length ||
			prior.completion?.bindingHash !== bindingHash
		)
			throw new Error("COMPLETE_TRANSLATION_FIRST");
	}
	const folder = join(root, (values.fake ? "fake-" : "") + (translation ? "translation" : "cover-letter"));
	await mkdir(folder, { recursive: true });
	const lockPath = join(folder, "session.lock");
	try {
		const pid = Number(await readFile(lockPath, "utf8"));
		try {
			process.kill(pid, 0);
			throw new Error("COMPLETION_ALREADY_RUNNING");
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
			await unlink(lockPath);
		}
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
	}
	const lock = await open(lockPath, "wx");
	await lock.writeFile(String(process.pid));
	try {
		const sessionBinding = { bindingHash, mode: values.fake ? "fake" : "live", category };
		try {
			const recorded = await readJson(join(folder, "continuation-manifest.json"));
			if (JSON.stringify(recorded) !== JSON.stringify(sessionBinding)) throw new Error("CONTINUATION_IDENTITY_CHANGED");
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
			await saveJson(join(folder, "continuation-manifest.json"), sessionBinding);
		}
		const { runBenchmark } = await import("./runner");
		const { readJournal, appendEvent } = await import("./journal");
		const local = await readJournal(join(folder, "calls.jsonl"));
		const seed = translationSeed(source);
		if (seed.heldExposureMicros > 5_000_000) throw new Error("BILLING_UNKNOWN_EXPOSURE_LIMIT");
		const sourceCalls = translation ? seed.previousCalls : [];
		const permitted = new Set(translation ? unfinished : []);
		const previous = new Map(sourceCalls.map((c) => [c.key, c]));
		for (const c of local.previousCalls) {
			if (translation && !permitted.has(c.key)) throw new Error("UNAUTHORIZED_RESUME_SLOT");
			if (translation && c.outputDigest !== source.calls.find((s) => s.key === c.key)?.outputDigest)
				throw new Error("TRANSLATION_WRITER_CHANGED");
			if (c.costMicros !== null) previous.set(c.key, c);
		}
		const unknownLocal = [...new Map(local.previousCalls.map((c) => [c.key, c])).values()].filter(
			(c) => c.costMicros === null,
		);
		const localExposureMicros = unknownLocal.reduce(
			(n, c) => n + (c.unknownExposureMicros ?? c.reservedOpenRouterMicros ?? c.reservedMicros),
			0,
		);
		if (seed.heldExposureMicros + localExposureMicros > 5_000_000) throw new Error("BILLING_UNKNOWN_EXPOSURE_LIMIT");
		const belongs = (key: string) => !translation || [...permitted].some((k) => key === k || key.startsWith(k + ":"));
		const sourceRaw = translation ? context.history.rawRecords.filter((r) => belongs(r.key)) : [];
		const sourceAttempts = translation ? context.history.attempts.filter((a) => belongs(a.key)) : [];
		const priorArtifact =
			!translation && values.live ? await readJson(join(root, "translation", "results.json")) : null;
		const baseCalls = priorArtifact
			? source.calls.map((c) => priorArtifact.calls.find((t: { key: string }) => t.key === c.key) ?? c)
			: source.calls;
		const outside = baseCalls.filter((c) => c.category !== category);
		const priorSpendMicros = values.fake
			? 0
			: outside.reduce((n, c) => n + (c.openRouterCostMicros ?? 0), 0) +
				context.smoke.calls.reduce((n, c) => n + (c.openRouterCostMicros ?? 0), 0) +
				seed.heldExposureMicros +
				localExposureMicros +
				required(context.smoke.study?.judgeCanaries).openRouterMicros;
		const priorOpenaiSpendMicros = values.fake
			? 0
			: outside.reduce((n, c) => n + (c.openaiCostMicros ?? 0), 0) +
				context.smoke.calls.reduce((n, c) => n + (c.openaiCostMicros ?? 0), 0);
		const controller = new AbortController();
		const stop = () => controller.abort();
		process.once("SIGINT", stop);
		process.once("SIGTERM", stop);
		let writerDispatches = 0;
		let verifierDispatches = 0;
		const actualFetch = globalThis.fetch;
		const result = await runBenchmark({
			id: "completion-" + category + "-" + bindingHash.slice(0, 16),
			models,
			cases: cases.filter((c) => c.category === category && c.holdout),
			runs: 3,
			phase: "full",
			fake: Boolean(values.fake),
			...(process.env.OPENROUTER_BENCHMARK_KEY ? { key: process.env.OPENROUTER_BENCHMARK_KEY } : {}),
			budgetUsd: 40,
			openaiBudgetUsd: 15,
			priorSpendMicros,
			priorOpenaiSpendMicros,
			sessionConcurrency: 16,
			openaiConcurrency: 8,
			togetherConcurrency: 8,
			maxUnverified: 16,
			recoverSystemic: true,
			previousCalls: [...previous.values()],
			rawRecords: [...sourceRaw, ...local.rawRecords],
			attempts: [...sourceAttempts, ...local.attempts],
			pendingReservations: local.pendingReservations,
			unsettledRetryReservations: local.unsettledRetryReservations,
			transport: (url, init) => {
				const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
				if (translation && body?.model && models.some((m) => m.model === body.model))
					throw new Error("TRANSLATION_WRITER_MUST_NOT_BE_REBOUGHT");
				return actualFetch(url, init);
			},
			fakeTransport: (_url, _init, next, request) => {
				if (translation && request.role === "writer") throw new Error("TRANSLATION_WRITER_MUST_NOT_BE_REBOUGHT");
				return next();
			},
			recordedBillingModels: context.sourceManifest.priceSnapshot.models.concat(
				context.sourceManifest.priceSnapshot.verifierModels,
			),
			signal: controller.signal,
			onReserve: (r) => {
				if (translation && !belongs(r.key)) throw new Error("UNAUTHORIZED_RESUME_SLOT");
				return appendEvent(join(folder, "calls.jsonl"), { type: "reserved", data: r });
			},
			onAttempt: (a) => appendEvent(join(folder, "calls.jsonl"), { type: "attempt", data: a }),
			onRaw: async (r) => {
				if (r.key.includes(":verify")) verifierDispatches++;
				else {
					writerDispatches++;
					if (translation) throw new Error("TRANSLATION_WRITER_MUST_NOT_BE_REBOUGHT");
				}
				await appendEvent(join(folder, "calls.jsonl"), { type: "raw", data: r });
			},
			onCall: (c) => appendEvent(join(folder, "calls.jsonl"), { type: "scored", data: c }),
		});
		process.removeListener("SIGINT", stop);
		process.removeListener("SIGTERM", stop);
		const output = {
			...result,
			completion: {
				legacyHeldExposureMicros: seed.heldExposureMicros,
				localHeldExposureMicros: localExposureMicros,
				billingNote:
					"Past incomplete attempts stay in their source journal. Their unresolved costs remain reserved exposure, not invented zero-cost settlements.",
				bindingHash,
				binding,
				category,
				sourceFolder,
				canaryReuse: true,
				writerDispatches,
				verifierDispatches,
			},
			study: {
				name: "tasks-v1",
				phase: "full",
				hash: bindingHash,
				judgeCanaries: required(context.smoke.study?.judgeCanaries),
			},
		};
		await saveJson(join(folder, "results.json"), output);
		await saveJson(join(folder, "guard-replay.json"), {
			...output.completion,
			calls: repairGuards(cases, result.calls),
		});
		console.log(
			JSON.stringify({
				category,
				calls: result.calls.length,
				incomplete: result.incomplete?.length ?? 0,
				stopReason: result.stopReason,
				writerDispatches,
				verifierDispatches,
				mode: result.mode,
			}),
		);
		if (result.stopReason || result.incomplete?.length) process.exitCode = 2;
	} finally {
		await lock.close();
		await unlink(lockPath);
	}
} else throw new Error("Use prepare, resume-translation, or cover-letter-full");
