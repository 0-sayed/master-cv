import type { BenchmarkArtifact, Calibration } from "./runner";
import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { assertStudyForecast, calibratedExpectedFull } from "./budget";
import catalogSnapshot from "./catalog-snapshot.json";
import {
	parseOptions,
	loadModels,
	applyReasoning,
	applyCatalogPrices,
	pruneTaskVariants,
	taskVariantId,
} from "./config";
import { readBenchmarkKey, readBenchmarkKeyFile } from "./credentials";
import { diagnostic } from "./diagnostics";
import { dispatchLimits } from "./dispatch";
import { assertFrozenStudy } from "./freeze";
import { appendEvent, readJournal } from "./journal";
import { evaluationOutputFolder } from "./output-directory";
import { captureCommand } from "./subprocess";

// Capture -o even when strict option validation fails.
const outputArgs = process.argv.slice(2);
let outputDirectory = resolve("evaluations/results");
for (let i = 0; i < outputArgs.length; i++) {
	const arg = outputArgs[i];
	const next = outputArgs[i + 1];
	if ((arg === "-o" || arg === "--out") && next) {
		outputDirectory = resolve(next);
		i++;
	} else if (arg?.startsWith("--out=")) outputDirectory = resolve(arg.slice(6));
}
async function main() {
	const options = parseOptions(process.argv.slice(2));
	outputDirectory = resolve(options.out);
	const frozen = assertFrozenStudy(undefined, options.study);
	// Live benchmarks also read only the explicitly supplied benchmark key file.
	process.loadEnvFile = () => {};
	if (options.startupCheck) globalThis.fetch = () => Promise.reject(new Error("STARTUP_CHECK_NETWORK_FORBIDDEN"));
	process.env.APP_URL ??= "http://localhost:3000";
	process.env.DATABASE_URL ??= "postgresql://synthetic:synthetic@localhost:1/synthetic";
	process.env.AUTH_SECRET ??= "synthetic-a02-benchmark-only";
	const [
		{ cases: coreCases },
		{ estimateBenchmark, refreshModels, runBenchmark },
		{ renderReport, identityMapping },
		{ scoreBenchmark },
		{
			controls,
			recordedControls,
			baselineChecks,
			arabicApprovalProvenance,
			loadStudyCases,
			studyReviewItems,
			smokeCases,
			requireFullModels,
			studyHash,
			validateSmoke,
			validateResume,
			caseVersions,
			assessSmoke,
		},
	] = await Promise.all([
		import("./corpus"),
		import("./runner"),
		import("./report"),
		import("./metrics"),
		import("./study"),
	]);
	const cases = options.study === "core" ? coreCases : loadStudyCases(options.study, options.categories);
	const config =
		options.config ??
		(options.study === "tasks-v1" ? new URL("./models-tasks.json", import.meta.url).pathname : undefined);
	let models = applyReasoning(loadModels(config, options.selected, options.allowGoogle), options.reasoning);
	if (options.study === "tasks-v1" && options.variants !== undefined)
		models = pruneTaskVariants(models, options.variants);
	if (options.study === "tasks-v1" && options.smokeCategory) throw new Error("TASKS_SMOKE_SCOPE_FORBIDDEN");
	const categories = options.categories;
	if (categories)
		models = models
			.map((model) => ({
				...model,
				categories: categories.filter((category) => !model.categories || model.categories.includes(category)),
			}))
			.filter((model) => model.categories.length > 0);
	if (options.stage === "full") requireFullModels(models);
	const selectedCases =
		options.stage === "smoke" ? smokeCases(cases, models, options.smokeCategory) : cases.filter((c) => !c.exploratory);
	const runs = options.stage === "smoke" ? 1 : options.runs;
	const tuningControl = controls(cases.filter((c) => !c.holdout && !c.exploratory));
	const control = recordedControls(undefined, options.study, options.categories) ?? {
		...tuningControl,
		pass: false,
		failures: [...tuningControl.failures, { id: "sealed", control: "freeze", reason: "SEALED_CONTROLS_REQUIRED" }],
	};
	const experimentHash = studyHash(models, cases, options.runs, options.smokeCategory, options.study);
	const { assertJudgeCanaries, runJudgeCanaryFile, forecastJudgeCanaries } = await import("./canaries");
	if (
		options.study === "tasks-v1" &&
		options.stage === "full" &&
		!options.dryRun &&
		!options.preflight &&
		!options.smokeFile
	)
		throw new Error("JUDGE_CANARY_GATE");
	const resumeManifest = options.resume
		? JSON.parse(await readFile(join(resolve(options.resume), "manifest.json"), "utf8"))
		: null;
	const repairContext =
		resumeManifest?.repair && options.resume
			? await (await import("./repair")).validateRepairFolder(resolve(options.resume), experimentHash)
			: null;
	const approvalFiles = await Promise.all(
		options.approvalFiles.map(async (path) => JSON.parse(await readFile(resolve(path), "utf8"))),
	);
	const approvalProvenance =
		approvalFiles.length || (!options.fake && !options.dryRun && !options.preflight)
			? arabicApprovalProvenance(approvalFiles, studyReviewItems(options.study, cases))
			: [];
	let key: string | undefined;
	let calibration: Calibration[] = [];
	let calibrationMode: "live" | "fake" | null = null;
	let priorSpendMicros = 0;
	let priorOpenaiSpendMicros = 0;
	let smokeCalls: BenchmarkArtifact["calls"] = [];
	let variantStatus: import("./study").SmokeVariant[] = [];
	// Runs before credentials, catalog refresh or any paid transport. Smoke also
	// checks the full planned category matrix, rather than just its three cases.
	if (options.preflight || (!options.fake && !options.dryRun)) {
		const { preflightRequests } = await import("./preflight");
		const preflight = await preflightRequests(
			models,
			cases.filter((c) => !c.exploratory),
		);
		await mkdir(resolve(options.out), { recursive: true });
		await writeFile(join(resolve(options.out), "preflight.json"), JSON.stringify(preflight, null, 2));
		if (options.preflight) return;
	}
	if (!options.fake && !options.dryRun) {
		if (!control.pass) throw new Error("GUARD_CONTROLS_FAILED");
		if (options.stage === "full") {
			if (!options.smokeFile) throw new Error("LIVE_SMOKE_REQUIRED");
			const smoke = JSON.parse(await readFile(resolve(options.smokeFile), "utf8")) as BenchmarkArtifact;
			if (
				smoke.mode !== "live" ||
				smoke.study?.phase !== "smoke" ||
				(smoke.study.name ?? "core") !== options.study ||
				smoke.study.hash !== experimentHash
			)
				throw new Error("LIVE_SMOKE_MISMATCH");
			if (options.study === "tasks-v1")
				assertJudgeCanaries(smoke.study.judgeCanaries, { studyHash: experimentHash, models, mode: "live" });
			variantStatus = assessSmoke(smoke, models, smokeCases(cases, models, options.smokeCategory), options.study);
			calibration = validateSmoke(smoke, models, smokeCases(cases, models, options.smokeCategory), options.study);
			calibrationMode = smoke.mode;
			smokeCalls = smoke.calls;
			priorSpendMicros = Math.ceil(smoke.reservedUsd * 1e6);
			priorOpenaiSpendMicros = Math.ceil((smoke.reservedOpenaiUsd ?? 0) * 1e6);
		}
		key = options.keyFile ? await readBenchmarkKeyFile(options.keyFile) : await readBenchmarkKey(options.envFile);
	}
	if ((options.fake || options.dryRun) && options.smokeFile) {
		const smoke = JSON.parse(await readFile(resolve(options.smokeFile), "utf8")) as BenchmarkArtifact;
		if (
			smoke.study?.phase !== "smoke" ||
			(smoke.study.name ?? "core") !== options.study ||
			smoke.study.hash !== experimentHash
		)
			throw new Error("LIVE_SMOKE_MISMATCH");
		if (options.study === "tasks-v1")
			assertJudgeCanaries(smoke.study.judgeCanaries, { studyHash: experimentHash, models, mode: smoke.mode });
		variantStatus = assessSmoke(smoke, models, smokeCases(cases, models, options.smokeCategory), options.study);
		calibration = validateSmoke(smoke, models, smokeCases(cases, models, options.smokeCategory), options.study);
		calibrationMode = smoke.mode;
		smokeCalls = smoke.calls;
		priorSpendMicros = Math.ceil(smoke.reservedUsd * 1e6);
		priorOpenaiSpendMicros = Math.ceil((smoke.reservedOpenaiUsd ?? 0) * 1e6);
	}

	if (repairContext) {
		priorSpendMicros += repairContext.original.priorSpendMicros;
		priorOpenaiSpendMicros += repairContext.original.priorOpenaiSpendMicros;
	}
	const priceSnapshots: unknown[] = [];
	let verifierModels = loadModels();
	if ((!options.fake && !options.dryRun) || options.refreshCatalog)
		verifierModels = await refreshModels(
			[
				...new Map(
					[...models, ...verifierModels].map((m) => [JSON.stringify([m.model, m.provider, m.reasoning]), m]),
				).values(),
			],
			options.startupCheck
				? (url) => {
						const entry = catalogSnapshot.endpoints.find((e) => e.url === String(url));
						if (!entry) throw new Error("STARTUP_CATALOG_SNAPSHOT_MISSING");
						return Promise.resolve(Response.json(entry.body));
					}
				: globalThis.fetch,
			(snapshot) => {
				priceSnapshots.push(snapshot);
			},
		);
	if (priceSnapshots.length) models = applyCatalogPrices(models, verifierModels);
	const priceSnapshot = {
		capturedAt: new Date().toISOString(),
		basis: options.startupCheck
			? "archived catalog snapshot; no network refresh"
			: priceSnapshots.length
				? "live public catalog"
				: "archived model-price assumptions; live refresh mandatory before paid run",
		models,
		verifierModels,
		endpoints: priceSnapshots,
	};
	if (options.refreshCatalog)
		await writeFile(resolve("evaluations/review/catalog-snapshot.json"), JSON.stringify(priceSnapshot, null, 2));
	const estimate = estimateBenchmark(
		models,
		selectedCases,
		runs,
		calibration,
		verifierModels,
		options.stage,
		options.smokeCategory,
	);
	const payerForecast = (field: "openRouterCostMicros" | "openaiCostMicros") =>
		options.stage === "full" && calibration.length
			? calibratedExpectedFull(
					smokeCalls.map((c) => ({
						...c,
						costMicros:
							field === "openRouterCostMicros" ? (c.openRouterCostMicros ?? c.costMicros) : (c.openaiCostMicros ?? 0),
					})),
					estimate.perModel,
				)
			: null;
	const calibratedExpectedOpenRouterUsd = payerForecast("openRouterCostMicros");
	const calibratedExpectedOpenaiUsd = payerForecast("openaiCostMicros");
	const calibratedExpectedFullUsd =
		calibratedExpectedOpenRouterUsd === null || calibratedExpectedOpenaiUsd === null
			? null
			: calibratedExpectedOpenRouterUsd + calibratedExpectedOpenaiUsd;
	const forecastNotices: string[] = [];
	const recordForecastNotice = (message: string) => forecastNotices.push(message);
	if (calibratedExpectedOpenRouterUsd !== null)
		assertStudyForecast(calibratedExpectedOpenRouterUsd, priorSpendMicros, options.budgetUsd, recordForecastNotice);
	if (calibratedExpectedOpenaiUsd !== null) {
		try {
			assertStudyForecast(
				calibratedExpectedOpenaiUsd,
				priorOpenaiSpendMicros,
				options.openaiBudgetUsd,
				recordForecastNotice,
			);
		} catch {
			throw new Error("OPENAI_CALIBRATED_FORECAST_LIMIT");
		}
	}
	let startupForecast: Record<string, unknown> | undefined;
	if (options.dryRun || options.startupCheck) {
		const judgeCanaries =
			options.study === "tasks-v1" && options.stage === "smoke" ? forecastJudgeCanaries(models, verifierModels) : null;
		const forecast = {
			judgeCanaries,
			forecastNotices,
			mode: options.startupCheck ? "startup-check" : "dry-run",
			routing:
				"Luna/Terra measured via OpenAI first-party (BYOK) for the benchmark; production routes via Azure ZDR; quality same model, latency may differ",
			forecastStatus: calibrationMode === "live" ? "live-smoke-calibrated" : "UNVERIFIED — paid BYOK smoke required",
			study: options.study,
			phase: options.stage,
			smokeCategory: options.smokeCategory,
			catalog: options.refreshCatalog ? "live public metadata" : "snapshot 2026-11-12",
			budgetUsd: options.budgetUsd,
			openaiBudgetUsd: options.openaiBudgetUsd,
			withinBudget:
				(calibratedExpectedOpenRouterUsd ?? estimate.openRouterUpperBoundUsd) +
					(judgeCanaries?.openRouterCeilingUsd ?? 0) +
					priorSpendMicros / 1e6 <=
					options.budgetUsd &&
				(calibratedExpectedOpenaiUsd ?? estimate.openaiUpperBoundUsd) +
					(judgeCanaries?.openaiCeilingUsd ?? 0) +
					priorOpenaiSpendMicros / 1e6 <=
					options.openaiBudgetUsd,
			calibratedExpectedFullUsd,
			calibratedExpectedOpenRouterUsd,
			calibratedExpectedOpenaiUsd,
			minimumBudgetUsd:
				Math.ceil(
					(estimate.openRouterUpperBoundUsd + (judgeCanaries?.openRouterCeilingUsd ?? 0) + priorSpendMicros / 1e6) *
						1e6,
				) / 1e6,
			minimumOpenaiBudgetUsd:
				Math.ceil(
					(estimate.openaiUpperBoundUsd + (judgeCanaries?.openaiCeilingUsd ?? 0) + priorOpenaiSpendMicros / 1e6) * 1e6,
				) / 1e6,
			priorSpendUsd: priorSpendMicros / 1e6,
			priorOpenaiSpendUsd: priorOpenaiSpendMicros / 1e6,
			controls: control,
			arabicApprovalRequired: true,
			...estimate,
		};
		const output = resolve(options.out);
		await mkdir(output, { recursive: true });
		if (!options.startupCheck) {
			await writeFile(join(output, "forecast.json"), JSON.stringify(forecast, null, 2));
			return;
		}
		startupForecast = forecast;
	}
	const root = resolve(options.out);
	const folder = evaluationOutputFolder({
		out: options.out,
		resume: options.resume,
		temporary: options.fake || options.startupCheck,
	});
	await mkdir(folder, { recursive: true });
	const manifestPath = join(folder, "manifest.json");
	let id: string = randomUUID();
	if (options.resume) {
		const previous = resumeManifest as {
			hash: string;
			id: string;
			study?: import("./config").StudyName;
			budgetUsd: number;
			openaiBudgetUsd: number;
			priorOpenaiSpendMicros: number;
			mode: string;
			phase: string;
			priorSpendMicros: number;
			calibration: Calibration[];
		};
		validateResume(previous, {
			hash: experimentHash,
			openaiBudgetUsd: options.openaiBudgetUsd,
			priorOpenaiSpendMicros,
			budgetUsd: options.budgetUsd,
			mode: options.fake ? "fake" : "live",
			study: options.study,
			phase: options.stage,
			priorSpendMicros,
			calibration,
		});
		id = previous.id;
	}
	const gitCommit = captureCommand("git", ["rev-parse", "HEAD"], { out: folder }).stdout.trim();
	const manifest = {
		forecastNotices,
		id,
		study: options.study,
		...(options.study === "tasks-v1" ? { variants: models.map(taskVariantId) } : {}),
		approvalProvenance,
		hash: experimentHash,
		createdAt: new Date().toISOString(),
		gitCommit,
		dirty: captureCommand("git", ["status", "--porcelain"], { out: folder }).stdout.length > 0,
		mode: options.fake ? "fake" : "live",
		...dispatchLimits(options),
		phase: options.stage,
		smokeCategory: options.smokeCategory,
		models,
		freeze: frozen,
		priceSnapshot,
		runs,
		openaiBudgetUsd: options.openaiBudgetUsd,
		priorOpenaiSpendMicros,
		budgetUsd: options.budgetUsd,
		priorSpendMicros,
		calibration,
		variantStatus,
		estimate,
		calibratedExpectedOpenRouterUsd,
		calibratedExpectedOpenaiUsd,
		calibratedExpectedFullUsd,
		controls: control,
		versions: caseVersions(selectedCases),
	};
	if (!options.resume && !options.startupCheck)
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
	const journal = join(folder, "calls.jsonl");
	let history = await readJournal(journal);
	if (options.reconcileFile) {
		const { validateSettlement } = await import("./reconcile");
		const sourceHash = createHash("sha256")
			.update(await readFile(journal))
			.digest("hex");
		const receipts: unknown = JSON.parse(await readFile(resolve(options.reconcileFile), "utf8"));
		if (!Array.isArray(receipts)) throw new Error("RECONCILIATION_ARRAY_REQUIRED");
		const keys = [
			...new Set([
				...history.pendingReservations.filter((r) => r.reservedMicros > 0).map((r) => r.key),
				...history.previousCalls.map((c) => c.key),
			]),
		];
		const settlements = receipts.map((r) => validateSettlement(r, sourceHash, keys));
		if (new Set(settlements.map((r) => r.key)).size !== settlements.length)
			throw new Error("RECONCILIATION_DUPLICATE_SESSION");
		if (!options.startupCheck) for (const data of settlements) await appendEvent(journal, { type: "settled", data });
		history = await readJournal(journal);
	}
	if (options.startupCheck) {
		if (history.pendingReservations.length) throw new Error("PENDING_BILLING");
		await writeFile(
			join(root, "startup-check.json"),
			JSON.stringify(
				{
					...startupForecast,
					paidCalls: 0,
					networkRequests: 0,
					credential: "[REDACTED]",
					approvalProvenance,
					studyHash: experimentHash,
					qualification:
						"Offline startup only; snapshot prices are not live route availability or judge qualification.",
				},
				null,
				2,
			),
		);
		return;
	}
	const { gracefulDrain } = await import("./interrupt");
	const drain = gracefulDrain();
	const chaos = options.chaos
		? (await import("./faults")).createFaultTransport({
				fault: "none",
				role: "writer",
				session: 3,
				chaos: true,
				seed: options.seed,
			})
		: null;
	let artifact: BenchmarkArtifact;
	let judgeCanaries: import("./canaries").JudgeCanaryReceipt | null = null;
	try {
		if (options.study === "tasks-v1" && options.stage === "smoke") {
			const path = join(folder, "canaries.json");
			judgeCanaries = await runJudgeCanaryFile(path, {
				phase: options.stage,
				studyHash: experimentHash,
				options: {
					models,
					verifierModels,
					cases: [],
					runs: 1,
					fake: options.fake,
					budgetUsd: options.budgetUsd,
					openaiBudgetUsd: options.openaiBudgetUsd,
					priorSpendMicros,
					priorOpenaiSpendMicros,
					...dispatchLimits(options),
					signal: drain.signal,
					...(key ? { key } : {}),
				},
			});
		}
		artifact = await runBenchmark({
			signal: drain.signal,
			recoverSystemic: options.recoverSystemic,
			...(chaos ? { fakeTransport: chaos.transport } : {}),
			...(repairContext ? { repairPlan: repairContext.plan } : {}),
			...dispatchLimits(options),
			phase: options.stage,
			smokeCategory: options.smokeCategory,
			models,
			verifierModels,
			cases: selectedCases,
			runs,
			openaiBudgetUsd: options.openaiBudgetUsd,
			priorOpenaiSpendMicros: priorOpenaiSpendMicros + (judgeCanaries?.openaiMicros ?? 0),
			budgetUsd: options.budgetUsd,
			fake: options.fake,
			id,
			calibration,
			priorSpendMicros: priorSpendMicros + (judgeCanaries?.openRouterMicros ?? 0),
			...history,
			...(key ? { key } : {}),
			onReserve: (data) => appendEvent(journal, { type: "reserved", data }),
			onRaw: (data) => appendEvent(journal, { type: "raw", data }),
			onAttempt: (data) => appendEvent(journal, { type: "attempt", data }),
			onCall: (data) => appendEvent(journal, { type: "scored", data }),
		});
	} finally {
		drain.dispose();
	}
	if (chaos)
		await writeFile(
			join(folder, "chaos.json"),
			JSON.stringify(
				{ seed: options.seed, faultRate: 0.025, injections: chaos.injections, receipts: chaos.receipts },
				null,
				2,
			),
		);
	artifact.study = {
		...(judgeCanaries ? { judgeCanaries } : {}),
		name: options.study,
		approvalProvenance,
		phase: options.stage,
		smokeCategory: options.smokeCategory,
		hash: experimentHash,
		gitCommit,
		controls: control,
		calibration,
		variantStatus,
	};
	if (options.stage === "smoke" && !artifact.stopReason) {
		try {
			if (options.study === "tasks-v1")
				assertJudgeCanaries(judgeCanaries, { studyHash: experimentHash, models, mode: artifact.mode });
			variantStatus = assessSmoke(artifact, models, selectedCases, options.study);
			calibration = validateSmoke(artifact, models, selectedCases, options.study);
		} catch (e) {
			artifact.stopReason = e instanceof Error ? e.message : "SMOKE_FAILED";
		}
	}
	artifact.study.calibration = calibration;
	artifact.study.variantStatus = variantStatus;
	const originalManifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
	await writeFile(
		manifestPath,
		JSON.stringify(
			{
				...originalManifest,
				...(judgeCanaries ? { judgeCanaries } : {}),
				approvalProvenance,
				budgetUsd: options.budgetUsd,
				openaiBudgetUsd: options.openaiBudgetUsd,
				budgetHistory: [
					...(Array.isArray(originalManifest.budgetHistory) ? originalManifest.budgetHistory : []),
					...(originalManifest.budgetUsd !== options.budgetUsd ||
					originalManifest.openaiBudgetUsd !== options.openaiBudgetUsd
						? [
								{
									at: new Date().toISOString(),
									before: { openRouter: originalManifest.budgetUsd, openai: originalManifest.openaiBudgetUsd },
									after: { openRouter: options.budgetUsd, openai: options.openaiBudgetUsd },
								},
							]
						: []),
				],
				versions: manifest.versions,
				variantStatus,
				completedCalls: artifact.calls.length,
				measuredCostMicros: artifact.calls.reduce((sum, c) => sum + (c.costMicros ?? 0), 0),
				unknownCosts: artifact.calls.filter((c) => c.costMicros === null).length,
				openRouterSpendMicros: artifact.calls.reduce((sum, c) => sum + (c.openRouterCostMicros ?? 0), 0),
				openaiSpendMicros: artifact.calls.reduce((sum, c) => sum + (c.openaiCostMicros ?? 0), 0),
				reservedOpenaiUsd: artifact.reservedOpenaiUsd,
				reservedUsd: artifact.reservedUsd,
				stopReason: artifact.stopReason,
				modelStops: artifact.modelStops,
				incomplete: artifact.incomplete,
				promptHashes: [...new Set(artifact.calls.map((c) => c.promptDigest))],
				fixtureHashes: [...new Set(artifact.calls.map((c) => c.fixtureHash))],
				tokenCaps: artifact.calls.map((c) => ({ key: c.key, input: c.inputTokenCap, output: c.outputTokenCap })),
			},
			null,
			2,
		),
	);
	await writeFile(
		join(folder, "results.json"),
		JSON.stringify({ ...artifact, scores: scoreBenchmark(artifact.calls) }, null, 2),
	);
	await writeFile(join(folder, "price-snapshot.json"), JSON.stringify(priceSnapshot, null, 2));
	await writeFile(
		join(folder, "baseline-checks.json"),
		JSON.stringify(
			{
				tuning: baselineChecks(coreCases.filter((c) => !c.holdout)),
				holdout: baselineChecks(coreCases.filter((c) => c.holdout)),
			},
			null,
			2,
		),
	);
	const privateMapping = identityMapping(artifact);
	await writeFile(join(folder, "report.html"), await renderReport(artifact, privateMapping));
	await writeFile(join(folder, "identities.private.json"), JSON.stringify(privateMapping, null, 2));
	try {
		await access(join(folder, "ratings.json"));
	} catch {
		await writeFile(join(folder, "ratings.json"), JSON.stringify({ reportId: id, ratings: [], picks: [] }, null, 2), {
			flag: "wx",
		});
	}
	const formatted = captureCommand(
		process.execPath,
		[
			resolve("../node_modules/vite-plus/bin/vp"),
			"fmt",
			"--no-error-on-unmatched-pattern",
			...[
				"manifest.json",
				"results.json",
				"ratings.json",
				"report.html",
				"price-snapshot.json",
				"baseline-checks.json",
				"identities.private.json",
			].map((name) => join(folder, name)),
		],
		{ out: folder },
	);
	if (formatted.error || formatted.status !== 0) throw new Error("ARTIFACT_FORMAT_FAILED");
	await writeFile(
		join(folder, "summary.json"),
		JSON.stringify(
			{
				study: options.study,
				mode: artifact.mode,
				phase: options.stage,
				calls: artifact.calls.length,
				plannedCalls: estimate.calls,
				stopReason: artifact.stopReason,
				modelStops: artifact.modelStops,
				variantStatus,
				reservedOpenaiUsd: artifact.reservedOpenaiUsd,
				reservedUsd: artifact.reservedUsd,
				folder,
			},
			null,
			2,
		),
	);
	if (artifact.stopReason || artifact.incomplete?.length) process.exitCode = 2;
}
try {
	await main();
} catch (error) {
	const report = diagnostic(error);
	console.error(`${report.code}: ${report.message}${report.stackTop ? ` (${report.stackTop})` : ""}`);
	process.exitCode = 1;
	try {
		await mkdir(outputDirectory, { recursive: true });
		await writeFile(join(outputDirectory, "error.json"), JSON.stringify(report, null, 2));
	} catch (outputError) {
		console.error(`ERROR_REPORT_WRITE_FAILED: ${diagnostic(outputError).message}`);
	}
}
