// oxlint-disable typescript/no-non-null-assertion -- Synthetic fixtures assert required IDs and rows before use.
import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { reuseConfirmedFacts } from "./reuse-master";
it("copies only confirmed values, preserving entity IDs and leaving contacts and master untouched", () => {
	const structured = {
		section: "skills" as const,
		entityId: "skill-1",
		field: "name" as const,
		value: "TypeScript",
		source: { kind: "manual" as const, id: "s", quote: "TypeScript" },
	};
	const facts = [
		{
			id: "f",
			text: "",
			source: structured.source,
			status: "",
			structured,
			proposedStructured: { ...structured, value: "Unreviewed" },
			confirmation: "confirmed" as const,
			revision: 2,
			draftRevision: 3,
		},
	];
	const original = structuredClone(facts);
	const result = reuseConfirmedFacts(defaultResumeData, facts);
	expect(result.sections.skills.items[0]).toMatchObject({ id: "skill-1", name: "TypeScript" });
	expect(result.basics).toEqual(defaultResumeData.basics);
	expect(facts).toEqual(original);
	expect(defaultResumeData.sections.skills.items).toHaveLength(0);
	expect(
		reuseConfirmedFacts(defaultResumeData, [{ ...facts[0]!, confirmation: "pending" }]).sections.skills.items,
	).toHaveLength(0);
});
