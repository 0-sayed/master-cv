import type { CareerMaster, MasterFact } from "@reactive-resume/schema/career-master";
import { expect, it } from "vite-plus/test";
import { careerSections, distinctDocuments, previewLimits, sectionEntries } from "./presentation";

const fact = (id: string, entityId: string): MasterFact => ({
	id,
	text: id,
	source: { kind: "manual", id: "test", quote: "" },
	status: "active",
	confirmation: "confirmed",
	revision: 1,
	draftRevision: 0,
	structured: {
		section: "experience",
		entityId,
		field: "position",
		value: id,
		source: { kind: "manual", id: "test", quote: "" },
	},
	proposedStructured: null,
});
const master: CareerMaster = {
	profileRevision: 1,
	sections: [{ section: "experience", entityIds: ["second", "first", "deleted", "second"] }],
	facts: [
		fact("a", "first"),
		fact("b", "second"),
		fact("c", "unlisted"),
		{
			...fact("d", "unlisted"),
			structured: null,
			proposedStructured: {
				section: "experience",
				entityId: "unlisted",
				field: "company",
				value: "Pending",
				source: { kind: "manual", id: "test", quote: "" },
			},
			confirmation: "pending",
		},
	],
	links: [
		{ resumeId: "cv-a", name: "First", factId: "a", acceptedRevision: 1 },
		{ resumeId: "cv-a", name: "First", factId: "b", acceptedRevision: 1 },
		{ resumeId: "cv-b", name: "Second", factId: "b", acceptedRevision: 1 },
	],
};
it("preserves section order and appends missing fact entities once", () => {
	const original = structuredClone(master);
	expect(careerSections).toEqual(["experience", "education", "skills", "languages", "certifications"]);
	expect(previewLimits).toEqual({ experience: 3, education: 2, skills: 8, languages: 4, certifications: 3 });
	expect(sectionEntries(master, "experience").map((entry) => entry.entityId)).toEqual(["second", "first", "unlisted"]);
	expect(sectionEntries(master, "experience")[2]?.needsReview).toBe(true);
	expect(master).toEqual(original);
});
it("counts distinct CVs across all entry fields", () => {
	expect(distinctDocuments(master.links).map((link) => link.resumeId)).toEqual(["cv-a", "cv-b"]);
	expect(sectionEntries(master, "experience")[0]?.documents.map((link) => link.resumeId)).toEqual(["cv-a", "cv-b"]);
});
