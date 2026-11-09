import type { MasterFact, MasterFactInput } from "@reactive-resume/schema/career-master";
import z from "zod";
import { masterFactInputSchema } from "@reactive-resume/schema/career-master";

export const sectionFields = {
	experience: ["company", "position", "location", "description"],
	education: ["school", "degree", "area", "grade", "location", "description"],
	skills: ["name", "proficiency"],
	languages: ["language", "fluency"],
	certifications: ["title", "issuer", "description"],
} as const;
export type Section = MasterFactInput["section"];
export const draftSchema = z.object({
	values: z.record(z.string(), z.string()),
	profileRevision: z.number().int().nonnegative(),
	versions: z.array(
		z.object({
			id: z.string(),
			field: z.string(),
			expectedRevision: z.number().int().positive(),
			expectedDraftRevision: z.number().int().nonnegative(),
		}),
	),
	review: z.boolean(),
});
export type EntryDraft = z.infer<typeof draftSchema>;

export function initialDraft(facts: MasterFact[], profileRevision: number): EntryDraft {
	const values: Record<string, string> = {};
	for (const fact of facts) {
		const data = fact.proposedStructured ?? fact.structured;
		if (!data) continue;
		if (data.field === "dates") {
			values.start = data.value.start ?? "";
			values.end = data.value.end ?? "";
			values.present = String(data.value.present);
		} else values[data.field] = data.value;
	}
	return {
		values,
		profileRevision,
		review: false,
		versions: facts.flatMap((fact) => {
			const data = fact.proposedStructured ?? fact.structured;
			return data
				? [
						{
							id: fact.id,
							field: data.field,
							expectedRevision: fact.revision,
							expectedDraftRevision: fact.draftRevision,
						},
					]
				: [];
		}),
	};
}
export function entryInputs(
	section: Section,
	entityId: string,
	values: Record<string, string>,
	existingFields: string[] = [],
): MasterFactInput[] {
	const fields = sectionFields[section];
	if (!values[fields[0]]?.trim()) throw new Error("An entry name is required");
	const inputs: unknown[] = fields
		.filter((field) => values[field]?.trim() || existingFields.includes(field))
		.map((field) => ({
			section,
			entityId,
			field,
			value: values[field] ?? "",
			source: { kind: "manual", id: entityId, quote: (values[field] ?? "").slice(0, 4000) },
		}));
	if (values.start || values.end || values.present === "true" || existingFields.includes("dates"))
		inputs.push({
			section,
			entityId,
			field: "dates",
			value: { start: values.start || null, end: values.end || null, present: values.present === "true" },
			source: { kind: "manual", id: entityId, quote: [values.start, values.end].filter(Boolean).join(" – ") || "" },
		});
	return inputs.map((input) => masterFactInputSchema.parse(input));
}
