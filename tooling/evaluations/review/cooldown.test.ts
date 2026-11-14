import { expect, it, vi } from "vite-plus/test";
import { loadModels } from "./config";
import { ProviderCooldown } from "./cooldown";
import { required } from "./required";
import { vertexFixture } from "./vertex-test-fixture";

it("shares exponential cooldown across efforts, isolates providers, and clears it on a returned non-429 result", () => {
	vi.useFakeTimers();
	const random = vi.spyOn(Math, "random").mockReturnValue(0);
	try {
		const model = required(loadModels()[0]);
		const other = vertexFixture;
		const state = new ProviderCooldown();
		for (const wait of [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
			state.record(model, true, "transient");
			expect(state.delay([{ ...model, reasoning: "high" }])).toBe(wait);
			expect(state.delay([other])).toBe(0);
			vi.advanceTimersByTime(wait);
			expect(state.delay([model])).toBe(0);
		}
		state.record(model, false, "invalid");
		vi.advanceTimersByTime(30 * 60_000);
		expect(state.expired([model])).toBe(false);
	} finally {
		random.mockRestore();
		vi.useRealTimers();
	}
});
