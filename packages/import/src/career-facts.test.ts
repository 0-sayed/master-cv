// oxlint-disable typescript/no-non-null-assertion -- Synthetic fixtures assert required IDs and rows before use.
import { expect, it } from "vite-plus/test";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { buildCareerFactCandidates } from "./career-facts";
it("keeps contact data out of master candidates and retains raw date precision", () => {
	const data = structuredClone(sampleResumeData);
	const item = data.sections.experience.items[0]!;
	item.dates = { start: "2020", end: null, present: false, raw: "١٤٤١ هـ" };
	const facts = buildCareerFactCandidates(data, { kind: "resume", id: "cv", quote: "" });
	expect(facts.find((f) => f.entityId === item.id && f.field === "dates")?.value).toEqual(item.dates);
	expect(JSON.stringify(facts)).not.toContain(data.basics.email);
	expect(facts.every((f) => f.source.id === "cv")).toBe(true);
});
it("does not invent facts for empty values or unsupported sections", () => {
	const data = structuredClone(sampleResumeData);
	data.sections.skills.items.forEach((i) => {
		i.name = "";
		i.proficiency = "";
	});
	expect(
		buildCareerFactCandidates(data, { kind: "manual", id: "flow", quote: "" }).filter((f) => f.section === "skills"),
	).toEqual([]);
});

it("stores descriptions as readable plain text while retaining the CV rich text", () => {
	const data = structuredClone(sampleResumeData);
	const item = data.sections.experience.items[0]!;
	const description =
		"<p>Built <strong>R&amp;D</strong> tools.</p><ul><li>Saved &lt;5 hours</li><li>Led a team</li></ul>";
	item.description = description;
	const facts = buildCareerFactCandidates(data, { kind: "manual", id: "flow", quote: "" });
	expect(facts.find((fact) => fact.entityId === item.id && fact.field === "description")?.value).toBe(
		"Built R&D tools.\nSaved <5 hours\nLed a team",
	);
	expect(item.description).toBe(description);
});

it("keeps literal angle-bracket text after decoding a description", () => {
	const data = structuredClone(sampleResumeData);
	const item = data.sections.experience.items[0]!;
	item.description = "<p>&lt;5 hours&gt;</p>";
	const facts = buildCareerFactCandidates(data, { kind: "manual", id: "flow", quote: "" });
	expect(facts.find((fact) => fact.entityId === item.id && fact.field === "description")?.value).toBe("<5 hours>");
});
