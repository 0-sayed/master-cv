import { describe, expect, it } from "vite-plus/test";
import { entryInputs } from "./model";

it.each(["٢٠٢٤-٠٣", "۲۰۲۴-۰۳"])("normalizes date digits %s without rewriting narrative", (start) => {
	const facts = entryInputs("experience", "dates", { company: "مِثال ٢٠٢٤", start, end: "۲۰۲۵-۰۴" });
	expect(facts.find((f) => f.field === "dates")?.value).toEqual({ start: "2024-03", end: "2025-04", present: false });
	expect(facts.find((f) => f.field === "company")?.value).toBe("مِثال ٢٠٢٤");
});

describe("reviewed entry input", () => {
	it("preserves Arabic facts and rejects empty entries", () => {
		expect(entryInputs("experience", "entry", { company: "شركة مِثال", position: "Engineer" })[0]).toMatchObject({
			field: "company",
			value: "شركة مِثال",
			source: { kind: "manual" },
		});
		expect(() => entryInputs("skills", "entry", {})).toThrow();
	});
	it("rejects malformed dates rather than silently accepting null dates", () => {
		expect(() => entryInputs("experience", "entry", { company: "Example", start: "2026-14" })).toThrow();
		expect(() => entryInputs("education", "entry", { school: "Example", start: "2026", end: "2024" })).toThrow();
	});
	it.each(["experience", "education", "skills", "languages", "certifications"] as const)(
		"builds typed facts for %s",
		(section) => {
			const names = {
				experience: "company",
				education: "school",
				skills: "name",
				languages: "language",
				certifications: "title",
			};
			expect(entryInputs(section, "entity", { [names[section]]: "Synthetic" })).toHaveLength(1);
		},
	);
});

it("preserves long descriptions while bounding the provenance excerpt", () => {
	const value = "س".repeat(5000);
	const facts = entryInputs("experience", "entry", { company: "Example", description: value });
	expect(facts.find((f) => f.field === "description")?.value).toBe(value);
	expect(facts.every((f) => f.source.quote.length <= 4000)).toBe(true);
});
