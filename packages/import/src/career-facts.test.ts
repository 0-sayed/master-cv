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
