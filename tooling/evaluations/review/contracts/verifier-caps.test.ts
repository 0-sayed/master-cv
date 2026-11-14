import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries } from "../canaries";
import catalog from "../catalog-snapshot.json";
import { loadModels } from "../config";
import { completionTokenLimit } from "../production";
import { routeFor, verifierModelFor } from "../runner";
import { getTaskContract } from "./index";
import { buildTaskRoute } from "./route";
import { tasksVerifier } from "./verifier/verifier";

it.each(loadJudgeCanaries().filter((c) => c.language === "en"))(
	"allocates 12288 completion tokens within visible and pinned provider limits: $category",
	(c) => {
		const contract = getTaskContract(c.category);
		expect(contract.verifierCap).toBe(12288);
		for (const writer of loadModels()) {
			const judge = verifierModelFor(writer);
			const route = routeFor(judge, "offline", true, c);
			expect(route.maxOutputTokens).toBe(4096);
			expect(completionTokenLimit(route)).toBe(12288);
			const endpoints = catalog.endpoints.find((e) => e.body.data.id === judge.model)?.body.data.endpoints;
			const pinned = endpoints?.filter((e) => e.tag === judge.provider);
			expect(pinned?.length).toBeGreaterThan(0);
			for (const endpoint of pinned ?? [])
				expect(completionTokenLimit(route)).toBeLessThanOrEqual(endpoint.max_completion_tokens ?? Infinity);
			expect(() => buildTaskRoute({ ...contract, verifierCap: 12289 }, "low", route, true)).toThrow(
				"AI_INVALID_OUTPUT_LIMIT",
			);
		}
	},
);

it("asks for at most one short sentence per claim without dropping verdict coverage", () => {
	expect(tasksVerifier.systemPrompt).toContain("at most one short sentence per claim");
	expect(tasksVerifier.systemPrompt).toContain("For EVERY declared claim, give a verdict");
});
