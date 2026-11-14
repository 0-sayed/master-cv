import type { BenchmarkArtifact } from "./runner";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vite-plus/test";
import { assertStudyForecast, projectObservedSpend, calibratedExpectedFull } from "./budget";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { forecastFromSmoke } from "./forecast";
import forecast from "./forecast-historical-effort-grid.json";

it("projects the eleven-variant BYOK grid from archived usage without charging OpenAI tokens to OpenRouter", () => {
	const smoke = JSON.parse(
		readFileSync(new URL(`../results/${forecast.source}/results.json`, import.meta.url), "utf8"),
	) as BenchmarkArtifact;
	const projected = forecastFromSmoke(
		smoke,
		loadModels(),
		cases.filter((c) => !c.exploratory),
	);
	// The archived forecast predates the production schema/prompt repair.
	// Observed usage repricing stays equal; current-schema reservations intentionally change.
	const retained = forecast.perVariant.filter((v) => v.provider !== "google-vertex");
	expect(projected.expectedTotalUsd).toBeCloseTo(
		retained.reduce((sum, v) => sum + v.smokeUsd + v.fullUsd, 0),
		10,
	);
	expect(projected.expectedFullUsd).toBeCloseTo(
		retained.reduce((sum, v) => sum + v.fullUsd, 0),
		10,
	);
	expect(projected.smokeSessions).toBe(33);
	expect(projected.fullSessions).toBe(2772);
	expect(projected.expectedTotalUsd).toBeCloseTo(
		projected.openRouter.expectedTotalUsd + projected.openai.expectedTotalUsd,
	);
	expect(projected.perVariant.some((v) => v.provider === "google-vertex")).toBe(false);
	const luna = projected.perVariant.find((v) => v.model === "openai/gpt-6-luna" && v.reasoning === "low");
	expect(luna?.openaiPairCostsMicros[0]).toBe(Math.ceil(796 * 0.5 + 430 * 1.5));
	expect(projected.minimumBudgetUsd).toBe(projected.openRouter.minimumBudgetUsd);
	expect(projected.minimumOpenaiBudgetUsd).toBe(projected.openai.minimumBudgetUsd);
});
it("calibrates the mean workload from smoke 2 without claiming the conservative reservation fits", () => {
	expect(projectObservedSpend(93963, 24, 2016, 10)).toEqual({
		smokeUsd: 0.093963,
		fullUsd: 7.892892,
		bufferedFullUsd: 9.866115,
		totalUsd: 9.960078,
		withinBudget: true,
	});
	expect(() => projectObservedSpend(0, 0, 2016, 10)).toThrow("INVALID_CALIBRATION");
});
it("reserves smoke inside the explicit calibrated study budget", () => {
	expect(() => assertStudyForecast(4.96, 40000, 5)).not.toThrow();
	expect(() => assertStudyForecast(4.960001, 40000, 5)).toThrow("CALIBRATED_FORECAST_LIMIT");
	expect(() => assertStudyForecast(4.4, 40000, 4.42)).toThrow("CALIBRATED_FORECAST_LIMIT");
});
it("prints the calibrated total including smoke before allowing or refusing the full run", () => {
	const print = vi.spyOn(console, "info").mockImplementation(() => {});
	try {
		expect(() => assertStudyForecast(4.96, 40000, 5)).not.toThrow();
		expect(print).toHaveBeenLastCalledWith(
			"Smoke-calibrated forecast: full $4.960000 + smoke $0.040000 = $5.000000; limit $5.000000.",
		);
		print.mockClear();
		expect(() => assertStudyForecast(4.960001, 40000, 5)).toThrow("CALIBRATED_FORECAST_LIMIT");
		expect(print).toHaveBeenCalledExactlyOnceWith(
			"Smoke-calibrated forecast: full $4.960001 + smoke $0.040000 = $5.000001; limit $5.000000.",
		);
	} finally {
		print.mockRestore();
	}
});

it("allows an explicitly larger budget without a hidden ceiling", () => {
	expect(() => assertStudyForecast(6, 100000, 7)).not.toThrow();
});

// Each cost is already fee-inclusive, as recorded by the runner.
it("allows a zero-spend payer in the calibrated forecast", () => {
	const variant = { model: "synthetic", provider: "openai", reasoning: "low" };
	expect(calibratedExpectedFull([{ ...variant, costMicros: 0 }], [{ ...variant, calls: 10 }])).toBe(0);
});
it("weights each variant by its own observed mean and full-session count", () => {
	const a = { model: "a", provider: "azure", reasoning: "low" };
	const b = { model: "b", provider: "together", reasoning: "low" };
	const measured = [
		{ ...a, costMicros: 1055 },
		{ ...a, costMicros: 3165 },
		{ ...b, costMicros: 10550 },
	];
	expect(
		calibratedExpectedFull(measured, [
			{ ...a, calls: 100 },
			{ ...b, calls: 10 },
		]),
	).toBe(0.395625);
	expect(() => calibratedExpectedFull(measured, [{ ...b, reasoning: "high", calls: 10 }])).toThrow(
		"INVALID_CALIBRATION",
	);
	expect(() => calibratedExpectedFull([{ ...a, costMicros: null }], [{ ...a, calls: 10 }])).toThrow(
		"INVALID_CALIBRATION",
	);
});
