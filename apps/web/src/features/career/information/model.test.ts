import type { MasterFact, MasterFactInput } from "@reactive-resume/schema/career-master";
import { describe, expect, it } from "vite-plus/test";
import { draftSchema, entryInputs, formatFactValue, initialDraft, mergeLatestDraft } from "./model";

it("shows the original raw date text during review instead of an inferred Gregorian date", () => {
	expect(formatFactValue({ start: "2020", end: null, present: false, raw: "صيف ١٤٤٠ هـ" }, "Present")).toBe(
		"صيف ١٤٤٠ هـ",
	);
	expect(formatFactValue({ start: "2024-03", end: null, present: true }, "حاليًا")).toBe("2024-03 – حاليًا");
});

function masterFact(structured: MasterFactInput, revision = 1): MasterFact {
	return {
		id: structured.field,
		text: "",
		source: structured.source,
		status: "active",
		structured,
		proposedStructured: null,
		confirmation: "confirmed",
		revision,
		draftRevision: 0,
	};
}

describe("conflict recovery", () => {
	it("merges a newly saved remote field without erasing a local edit", () => {
		const original = entryInputs("experience", "entry", { company: "Original" }).map((input) => masterFact(input));
		const draft = initialDraft(original, 1);
		draft.values.company = "Local company";
		const remote = entryInputs("experience", "entry", { company: "Original", position: "Remote role" }).map((input) =>
			masterFact(input, 2),
		);
		const merged = mergeLatestDraft(draft, remote, 2);
		expect(
			entryInputs(
				"experience",
				"entry",
				merged.values,
				merged.versions.map((version) => version.field),
			),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ field: "company", value: "Local company" }),
				expect.objectContaining({ field: "position", value: "Remote role" }),
			]),
		);
		expect(merged.profileRevision).toBe(2);
		expect(merged.review).toBe(false);
		expect(merged.versions).toEqual([
			{ id: "company", field: "company", expectedRevision: 2, expectedDraftRevision: 0 },
			{ id: "position", field: "position", expectedRevision: 2, expectedDraftRevision: 0 },
		]);
	});

	it("refreshes untouched fields while preserving an explicit local clear", () => {
		const original = entryInputs("experience", "entry", { company: "Original", position: "Old role" }).map((input) =>
			masterFact(input),
		);
		const draft = initialDraft(original, 1);
		draft.values.position = "";
		const remote = entryInputs("experience", "entry", { company: "Remote company", position: "Remote role" }).map(
			(input) => masterFact(input, 2),
		);
		const merged = mergeLatestDraft(draft, remote, 2);
		expect(merged.values).toMatchObject({ company: "Remote company", position: "" });
		const refreshedAgain = mergeLatestDraft(
			merged,
			remote.map((fact) => ({ ...fact, revision: 3 })),
			3,
		);
		expect(refreshedAgain.values).toMatchObject({ company: "Remote company", position: "" });
	});

	it("preserves new remote raw dates when the local dates were untouched", () => {
		const draft = initialDraft([], 1);
		draft.values.company = "Local company";
		const merged = mergeLatestDraft(draft, datedFacts(), 2);
		expect(
			entryInputs("experience", "entry", merged.values, ["dates"]).find((fact) => fact.field === "dates")?.value,
		).toEqual({ start: null, end: null, present: false, raw: "صيف ١٤٤٠ هـ" });
	});

	it("keeps locally corrected dates instead of reintroducing a remote raw date", () => {
		const draft = initialDraft(datedFacts(), 1);
		draft.values.company = "Local company";
		draft.values.start = "2024";
		const merged = mergeLatestDraft(draft, datedFacts(), 2);
		expect(
			entryInputs("experience", "entry", merged.values, ["dates"]).find((fact) => fact.field === "dates")?.value,
		).toEqual({ start: "2024", end: null, present: false });
	});

	it("merges missing fields into drafts saved before baseline tracking without discarding local values", () => {
		const draft = initialDraft([], 1);
		delete draft.baseValues;
		draft.values.company = "Local company";
		const remote = entryInputs("experience", "entry", { company: "Remote company", position: "Remote role" }).map(
			(input) => masterFact(input, 2),
		);
		expect(mergeLatestDraft(draft, remote, 2).values).toMatchObject({
			company: "Local company",
			position: "Remote role",
		});
	});
});

function datedFacts(): MasterFact[] {
	return [
		{
			id: "dates",
			text: "صيف ١٤٤٠ هـ",
			source: { kind: "manual", id: "entry", quote: "صيف ١٤٤٠ هـ" },
			status: "active",
			structured: {
				section: "experience",
				entityId: "entry",
				field: "dates",
				value: { start: null, end: null, present: false, raw: "صيف ١٤٤٠ هـ" },
				source: { kind: "manual", id: "entry", quote: "صيف ١٤٤٠ هـ" },
			},
			proposedStructured: null,
			confirmation: "confirmed",
			revision: 1,
			draftRevision: 0,
		},
	];
}

it("preserves unparsed source dates through a restored draft and an unrelated edit", () => {
	const draft = draftSchema.parse(JSON.parse(JSON.stringify(initialDraft(datedFacts(), 1))));
	const facts = entryInputs("experience", "entry", { ...draft.values, company: "Updated company" }, ["dates"]);
	expect(facts.find((fact) => fact.field === "dates")).toMatchObject({
		value: { start: null, end: null, present: false, raw: "صيف ١٤٤٠ هـ" },
		source: { quote: "صيف ١٤٤٠ هـ" },
	});
});

it.each([{ start: "2024" }, { end: "2025-03" }, { present: "true" }])(
	"replaces the unparsed date only when a date field changes: %j",
	(changes) => {
		const draft = initialDraft(datedFacts(), 1);
		const facts = entryInputs("experience", "entry", { ...draft.values, company: "Example", ...changes }, ["dates"]);
		expect(facts.find((fact) => fact.field === "dates")?.value).not.toHaveProperty("raw");
	},
);

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
