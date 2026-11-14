import type { ModelConfig } from "./config";
import type { BenchmarkCase } from "./corpus";
import type { BenchmarkArtifact, Calibration } from "./runner";
import { z } from "zod";
import { withOpenRouterFee } from "./budget";
import { variantCases } from "./config";
import { loadModels } from "./config";
import { type TaskCase } from "./contracts/types";
import { prepareCase, goldOutput } from "./execution";
import { reviewVerifierPolicy } from "./production";
import { completionTokenLimit } from "./production";
import { required } from "./required";
import { estimateBenchmark, benchmarkCaps } from "./runner";
import { routeFor, verifierModelFor } from "./runner";
import { returnedProvider } from "./study";
import { verifierBound } from "./verifier";

/** Offline ceiling, not calibration: task caps/bytes bound costs; measured core judge usage supplies a separate proxy. */
export function forecastTasksFromCore(
	core: BenchmarkArtifact,
	models: ModelConfig[],
	cases: TaskCase[],
	runs = 2,
	verifierCatalog = loadModels(),
) {
	if (core.mode !== "live" || core.study?.name === "tasks-v1") throw new Error("MEASURED_CORE_REQUIRED");
	if (!Number.isSafeInteger(runs) || runs < 1) throw new Error("INVALID_RUNS");
	const samples = core.calls.flatMap((c) =>
		c.category !== "summary" &&
		c.verifierUsage &&
		!c.verifierFault &&
		!c.verifierTruncated &&
		c.verifierUsage.costMicros >= 0 &&
		c.verifierUsage.inputTokens > 0 &&
		c.verifierUsage.outputTokens > 0
			? [c.verifierUsage]
			: [],
	);
	const perCase = models.flatMap((model) =>
		variantCases(model, cases).map((c) => {
			const vm = verifierModelFor(model, verifierCatalog);
			const observed = samples.filter(
				(s) => s.model === vm.model && returnedProvider(s.provider) === vm.provider && s.reasoning === vm.reasoning,
			);
			if (!observed.length) throw new Error("FORECAST_CORE_VERIFIER_MISSING");
			const { handler, payload } = prepareCase(c);
			const writerRoute = routeFor(model, "unused", false, c);
			const completionCap = completionTokenLimit(writerRoute);
			const inputBytes = Buffer.byteLength(
				JSON.stringify({ system: handler.systemPrompt, payload, schema: z.toJSONSchema(handler.output) }),
			);
			const goldBytes = Buffer.byteLength(JSON.stringify(goldOutput(c)));
			const writerCeiling = Math.ceil(
				(inputBytes + 4096) * model.inputPerMillion + completionCap * model.outputPerMillion,
			);
			const writerProjection = Math.ceil(
				Math.ceil(inputBytes / 3) * model.inputPerMillion +
					Math.ceil(((goldBytes / 3) * completionCap) / writerRoute.maxOutputTokens) * model.outputPerMillion,
			);
			const judge = verifierBound(vm, c, routeFor(vm, "unused", true, c));
			// Scale each observed cost by the largest input/output token expansion. This bounds its own repriced pair components.
			const measuredJudgeProjection = Math.max(
				...observed.map((s) =>
					Math.ceil(
						s.costMicros *
							Math.max(1, judge.estimatedInputTokens / s.inputTokens, judge.estimatedOutputTokens / s.outputTokens),
					),
				),
			);
			const judgeCeiling = Math.max(judge.micros, measuredJudgeProjection);
			const payers = (generation: number, verification: number) => ({
				openRouterMicros: withOpenRouterFee(
					(model.provider === "openai" ? 0 : generation) + (vm.provider === "openai" ? 0 : verification),
				),
				openaiMicros: (model.provider === "openai" ? generation : 0) + (vm.provider === "openai" ? verification : 0),
			});
			const ceiling = payers(writerCeiling, judgeCeiling);
			const projection = payers(writerProjection, measuredJudgeProjection);
			return {
				caseId: c.id,
				category: c.category,
				model: model.model,
				reasoning: model.reasoning,
				provider: model.provider,
				writer: {
					fixtureInputBytes: inputBytes,
					goldTokens: Math.ceil(goldBytes / 3),
					visibleCap: writerRoute.maxOutputTokens,
					completionCap,
				},
				verifier: {
					model: vm.model,
					provider: vm.provider,
					reasoning: vm.reasoning,
					observedCoreSamples: observed.length,
					observedCoreOutputTokens: Math.max(...observed.map((s) => s.outputTokens)),
					outputCeilingTokens: Math.max(judge.outputTokens, ...observed.map((s) => s.outputTokens)),
					inputCeilingTokens: judge.inputTokens,
					measuredCostProjectionMicros: measuredJudgeProjection,
				},
				...ceiling,
				ceilingMicros: ceiling.openRouterMicros + ceiling.openaiMicros,
				openRouterProxyMicros: projection.openRouterMicros,
				openaiProxyMicros: projection.openaiMicros,
				tokenProjectionMicros: projection.openRouterMicros + projection.openaiMicros,
			};
		}),
	);
	return {
		kind: "ceiling" as const,
		sourceCoreId: core.id,
		measuredCoreVerifierSamples: samples.length,
		runs,
		calls: perCase.length * runs,
		openRouterCeilingUsd: perCase.reduce((sum, c) => sum + c.openRouterMicros * runs, 0) / 1e6,
		openaiCeilingUsd: perCase.reduce((sum, c) => sum + c.openaiMicros * runs, 0) / 1e6,
		openRouterProxyUsd: perCase.reduce((sum, c) => sum + c.openRouterProxyMicros * runs, 0) / 1e6,
		openaiProxyUsd: perCase.reduce((sum, c) => sum + c.openaiProxyMicros * runs, 0) / 1e6,
		tokenProjectionUsd: perCase.reduce((sum, c) => sum + c.tokenProjectionMicros * runs, 0) / 1e6,
		basis:
			"Conservative fixture/schema UTF-8 byte input bounds and completion caps; gold-token projection and measured exact-route core verifier costs shown separately. Separate verifier catalog includes DeepSeek low. Not measured tasks usage, latency or paid authorization.",
		perCase,
	};
}

/** Offline token-price proxies only; archived Azure smoke cannot qualify a BYOK run. */
export function forecastFromSmoke(smoke: BenchmarkArtifact, models: ModelConfig[], cases: BenchmarkCase[], runs = 3) {
	const calibration: Calibration[] = [];
	const perVariant = models.map((model) => {
		const sourceModel = model.model;
		const sourceProvider = model.provider === "openai" ? "azure" : model.provider;
		const order = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
		const available = smoke.calls.filter((c) => c.model === sourceModel && c.provider === sourceProvider);
		const efforts = [...new Set(available.map((c) => c.reasoning))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
		const sourceEffort = efforts.includes(model.reasoning)
			? model.reasoning
			: ([...efforts].reverse().find((e) => order.indexOf(e) <= order.indexOf(model.reasoning)) ?? efforts[0]);
		if (!sourceEffort) throw new Error("FORECAST_SMOKE_INCOMPLETE");
		const caps = benchmarkCaps(model.reasoning);
		const writerOutputScale = caps.writerCompletionTokenCap / benchmarkCaps(sourceEffort).writerCompletionTokenCap;
		const calls = smoke.calls.filter(
			(c) => c.model === sourceModel && c.provider === sourceProvider && c.reasoning === sourceEffort,
		);
		if (calls.length !== 3) throw new Error("FORECAST_SMOKE_INCOMPLETE");
		const verifierPolicy = reviewVerifierPolicy(model.model);
		const verifierModel = required(
			models.find(
				(m) =>
					m.model === verifierPolicy.model &&
					m.provider === verifierPolicy.downstreamProvider &&
					m.reasoning === verifierPolicy.reasoningEffort,
			),
		);
		const pairs = calls.map((call) => {
			const writer = required(call.generationUsage);
			const verifier = call.verifierUsage;
			const generation =
				model.provider === "openai" || sourceEffort !== model.reasoning
					? Math.ceil(
							writer.inputTokens * model.inputPerMillion +
								Math.ceil(writer.outputTokens * writerOutputScale) * model.outputPerMillion,
						)
					: writer.costMicros;
			const verification = !verifier
				? 0
				: verifierModel.provider === "openai"
					? Math.ceil(
							verifier.inputTokens * verifierModel.inputPerMillion +
								verifier.outputTokens * verifierModel.outputPerMillion,
						)
					: verifier.costMicros;
			const openRouter = withOpenRouterFee(
				(model.provider === "openai" ? 0 : generation) + (verifierModel.provider === "openai" ? 0 : verification),
			);
			const openai =
				(model.provider === "openai" ? generation : 0) + (verifierModel.provider === "openai" ? verification : 0);
			return { openRouter, openai, total: openRouter + openai };
		});
		calibration.push({
			model: model.model,
			provider: model.provider,
			reasoning: model.reasoning,
			samples: calls.length,
			inputTokens: Math.max(...calls.map((c) => required(c.inputTokens))),
			outputTokens: Math.max(...calls.map((c) => required(c.outputTokens))),
			pairCostMicros: Math.max(...pairs.map((p) => p.total)),
			pairOpenRouterCostMicros: Math.max(...pairs.map((p) => p.openRouter)),
			pairOpenaiCostMicros: Math.max(...pairs.map((p) => p.openai)),
			referenceInputTokens: Math.max(...calls.map((c) => required(c.generationUsage).inputTokens)),
		});
		const smokeMicros = pairs.reduce((n, p) => n + p.total, 0);
		const fullSessions = variantCases(model, cases).length * runs;
		return {
			model: model.model,
			provider: model.provider,
			reasoning: model.reasoning,
			sourceModel,
			sourceProvider,
			sourceEffort,
			writerOutputScale,
			...caps,
			basis:
				"Smoke-2 tokens repriced; unmeasured efforts use the nearest lower observed effort (or lowest available) and writer output scaled by completion-cap ratio. Verifier charge stays per session. Not measured new-effort/BYOK usage or latency.",
			measuredSourceWriterTokens: calls.map((c) => ({
				caseId: c.caseId,
				input: required(c.generationUsage).inputTokens,
				output: required(c.generationUsage).outputTokens,
			})),
			pairCostsMicros: pairs.map((p) => p.total),
			openRouterPairCostsMicros: pairs.map((p) => p.openRouter),
			openaiPairCostsMicros: pairs.map((p) => p.openai),
			smokeSessions: calls.length,
			fullSessions,
			smokeUsd: smokeMicros / 1e6,
			costPerSessionUsd: smokeMicros / calls.length / 1e6,
			fullUsd: Math.ceil((smokeMicros * fullSessions) / calls.length) / 1e6,
		};
	});
	const reservation = estimateBenchmark(models, cases, runs, calibration);
	const worst = estimateBenchmark(models, cases, runs);
	const payer = (
		key: "openRouterPairCostsMicros" | "openaiPairCostsMicros",
		reservationUsd: number,
		worstUsd: number,
	) => {
		const smokeMicros = perVariant.reduce((sum, v) => sum + v[key].reduce((n, c) => n + c, 0), 0);
		const fullMicros = perVariant.reduce(
			(sum, v) => sum + Math.ceil((v[key].reduce((n, c) => n + c, 0) * v.fullSessions) / v.smokeSessions),
			0,
		);
		return {
			expectedSmokeUsd: smokeMicros / 1e6,
			expectedFullUsd: fullMicros / 1e6,
			expectedTotalUsd: (smokeMicros + fullMicros) / 1e6,
			minimumBudgetUsd: (smokeMicros + Math.ceil(fullMicros * 1.25)) / 1e6,
			conservativeReservationFullUsd: reservationUsd,
			conservativeReservationTotalUsd: (Math.ceil(reservationUsd * 1e6) + smokeMicros) / 1e6,
			uncalibratedWorstCaseFullUsd: worstUsd,
		};
	};
	const openRouter = payer(
		"openRouterPairCostsMicros",
		reservation.openRouterUpperBoundUsd,
		worst.openRouterUpperBoundUsd,
	);
	const openai = payer("openaiPairCostsMicros", reservation.openaiUpperBoundUsd, worst.openaiUpperBoundUsd);
	return {
		perVariant,
		smokeSessions: perVariant.reduce((n, v) => n + v.smokeSessions, 0),
		fullSessions: perVariant.reduce((n, v) => n + v.fullSessions, 0),
		openRouter,
		openai,
		expectedSmokeUsd: openRouter.expectedSmokeUsd + openai.expectedSmokeUsd,
		expectedFullUsd: openRouter.expectedFullUsd + openai.expectedFullUsd,
		expectedTotalUsd: openRouter.expectedTotalUsd + openai.expectedTotalUsd,
		with25PercentFullHeadroomUsd: openRouter.minimumBudgetUsd + openai.minimumBudgetUsd,
		minimumBudgetUsd: openRouter.minimumBudgetUsd,
		minimumOpenaiBudgetUsd: openai.minimumBudgetUsd,
		conservativeReservationFullUsd: reservation.upperBoundUsd,
		conservativeReservationTotalUsd:
			openRouter.conservativeReservationTotalUsd + openai.conservativeReservationTotalUsd,
		reservationPerVariant: reservation.perModel,
	};
}
