import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { loadModels, parseOptions } from "./config";
import { cases, prepareCase } from "./corpus";
import { preflightRequests, assertStrictOutputSchema } from "./preflight";

it("exposes an explicitly offline preflight mode without credentials", () => {
	expect(parseOptions(["--preflight", "-o", "/tmp/preflight"])).toMatchObject({
		preflight: true,
		out: "/tmp/preflight",
		envFile: undefined,
	});
});

it("offers an extraction-only smoke scope explicitly bound into study identity", async () => {
	const { smokeCases, studyHash } = await import("./study");
	expect(parseOptions(["--smoke-category", "extraction"])).toMatchObject({ smokeCategory: "extraction" });
	const selected = smokeCases(cases, loadModels(), "extraction");
	expect(selected).toHaveLength(3);
	expect(selected.every((c) => c.category === "extraction")).toBe(true);
	expect(studyHash(loadModels(), cases, 3, "extraction")).not.toBe(studyHash(loadModels(), cases, 3));
});

it("covers wording and extraction in AR/EN/mixed for each repaired variant", async () => {
	const { smokeCases } = await import("./study");
	const { variantCases } = await import("./config");
	const selected = smokeCases(cases, loadModels(), "wording-extraction");
	expect(selected).toHaveLength(6);
	for (const model of loadModels())
		expect(variantCases(model, selected, "smoke", "wording-extraction")).toHaveLength(6);
});

it("validates every planned category and variant through the serialized production writer and judge", async () => {
	const result = await preflightRequests(
		loadModels(),
		cases.filter((c) => !c.exploratory),
	);
	expect(result.passed).toBe(true);
	expect(result.requests).toHaveLength(1848);
	for (const model of loadModels()) {
		const requests = result.requests.filter((r) => r.model === model.model && r.reasoning === model.reasoning);
		expect(new Set(requests.map((r) => r.category))).toEqual(
			new Set(["wording", "missing-info", "extraction", "injection"]),
		);
		expect(new Set(requests.map((r) => r.role))).toEqual(new Set(["writer", "verifier"]));
	}
});
it("rejects an untyped extraction request offline before a paid run", async () => {
	const c = cases.find((c) => c.kind === "extraction");
	if (!c) throw new Error("fixture");
	const handler = prepareCase(c).handler;
	const original = handler.output;
	handler.output = z.strictObject({ candidates: z.array(z.strictObject({ value: z.unknown() })) });
	try {
		await expect(preflightRequests(loadModels().slice(0, 1), [c])).rejects.toThrow("REQUEST_SCHEMA_ERROR");
	} finally {
		handler.output = original;
	}
});
it.each([
	{ type: "object", properties: { value: {} }, required: ["value"], additionalProperties: false },
	{ type: "object", properties: { value: { type: "string" } }, required: [], additionalProperties: false },
	{ type: "object", properties: {}, required: [] },
	{ type: "array", items: { anyOf: [{ type: "string" }, {}] } },
])("rejects malformed strict schema %j", (schema) => {
	expect(() => assertStrictOutputSchema(schema)).toThrow("REQUEST_SCHEMA_ERROR");
});
