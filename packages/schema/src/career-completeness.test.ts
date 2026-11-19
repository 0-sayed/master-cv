import { expect, it } from "vite-plus/test";
import { careerCompleteness, CAREER_COMPLETENESS_WEIGHTS } from "./career-completeness";
import { careerMasterSchema } from "./career-master";

it("starts empty and chooses the first missing part", () => {
	expect(Object.values(CAREER_COMPLETENESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
	expect(careerCompleteness(careerMasterSchema.parse({ profileRevision: 0, sections: [], facts: [] }))).toEqual({
		percentage: 0,
		next: { part: "contact", gain: 20, target: 20 },
	});
});
it("uses saved master fields and removes the hint at 100 percent", () => {
	const facts = [
		["experience", "company", "e"],
		["experience", "position", "e"],
		["experience", "description", "e"],
		["education", "school", "s"],
		["education", "degree", "s"],
		["skills", "name", "k"],
		["languages", "language", "l"],
	].map(([section, field, entityId], i) => ({
		id: String(i),
		revision: 1,
		draftRevision: 0,
		status: "active",
		confirmation: "confirmed",
		text: "Saved value",
		structured: {
			section,
			field,
			entityId,
			value: "Saved value",
			source: { kind: "manual", id: "test", quote: "Saved value" },
		},
		proposedStructured: null,
		source: { kind: "manual", id: "test", quote: "Saved value" },
	}));
	const master = careerMasterSchema.parse({
		profileRevision: 1,
		sections: [],
		facts,
		contact: { name: "Name", email: "name@example.test", phone: "+966 50 000 0000", location: "Riyadh" },
	});
	expect(careerCompleteness(master)).toEqual({ percentage: 85, next: { part: "summary", gain: 15, target: 100 } });
	expect(
		careerCompleteness({ ...master, facts: master.facts.filter((f) => f.structured?.section !== "skills") }),
	).toEqual({
		percentage: 70,
		next: { part: "summary", gain: 15, target: 85 },
	});
	expect(careerCompleteness({ ...master, summary: "Career summary" })).toEqual({ percentage: 100, next: null });
	expect(
		careerCompleteness({ ...master, facts: master.facts.map((f) => ({ ...f, status: "pending" })) }).percentage,
	).toBe(20);
});
