import { describe, expect, it } from "vite-plus/test";
import { masterFactInputSchema } from "./career-master";

const source = { kind: "manual", id: "entry-1", quote: "أدير فريق المنتج" };

describe("master career facts", () => {
	it.each([
		["2020-03", "2020", true],
		["2020", "2020-03", true],
		["2020-12", "2020", true],
		["2021", "2020-12", false],
		["2020-04", "2020-03", false],
		["٢٠٢٠-٠٣", "٢٠٢٠", true],
	])("validates mixed date precision %s to %s", (start, end, valid) => {
		expect(
			masterFactInputSchema.safeParse({
				section: "experience",
				entityId: "entry",
				field: "dates",
				value: { start, end, present: false },
				source,
			}).success,
		).toBe(valid);
	});
	it("rejects malformed reviewed dates without coercing them to missing facts", () => {
		expect(
			masterFactInputSchema.safeParse({
				section: "experience",
				entityId: "entry",
				field: "dates",
				value: { start: "2026-14", end: null, present: false },
				source,
			}).success,
		).toBe(false);
	});
	it("preserves user text and provenance while rejecting mismatched fields and values", () => {
		const input = { section: "skills", entityId: "entry-1", field: "name", value: "TypeScript / العربية", source };
		expect(masterFactInputSchema.parse(input)).toEqual(input);
		for (const change of [
			{ value: 42 },
			{ field: "company" },
			{ field: "id" },
			{ field: "hidden" },
			{ field: "icon" },
			{ field: "invented" },
			{ entityId: "" },
			{ section: "preferences" },
			{ extra: "unexpected" },
		])
			expect(masterFactInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
	});
});
