import type { QualificationCase } from "./types";
import { z } from "zod";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";

const nonempty = z.string().trim().min(1);
const caseSchema = z.object({
	id: nonempty,
	language: z.enum(["ar", "en", "mixed"]),
	split: z.enum(["smoke", "development", "held-out"]),
	paths: z.array(z.enum(["import", "export"])).min(1),
	nativeInput: nonempty.optional(),
	data: resumeDataSchema,
	gold: z.object({
		review: z.discriminatedUnion("status", [
			z.object({ status: z.literal("draft") }),
			z.object({ status: z.literal("reviewed"), reviewer: nonempty, date: z.iso.date() }),
		]),
		text: nonempty,
		fields: z
			.array(
				z.object({
					id: nonempty,
					value: nonempty,
					occurrence: z.number().int().nonnegative().optional(),
					match: z.enum(["date", "mixed-free-text"]).optional(),
				}),
			)
			.min(1),
		associations: z.array(z.object({ id: nonempty, fields: z.array(nonempty).min(2) })),
		order: z.array(z.tuple([nonempty, nonempty])),
		forbidden: z.array(nonempty),
	}),
});
export function validateManifest(value: unknown): QualificationCase[] {
	const cases = z.array(caseSchema).min(1).parse(value);
	const ids = new Set<string>();
	for (const item of cases) {
		if (ids.has(item.id)) throw new Error(`Duplicate case ID: ${item.id}`);
		ids.add(item.id);
		if (item.paths.includes("import") && !item.nativeInput) throw new Error(`${item.id}: native import input required`);
		const fields = new Set(item.gold.fields.map((field) => field.id));
		if (fields.size !== item.gold.fields.length) throw new Error(`${item.id}: duplicate field ID`);
		const grouped = new Set<string>();
		for (const group of item.gold.associations)
			for (const id of group.fields) {
				if (!fields.has(id)) throw new Error(`${item.id}: unknown association field ${id}`);
				if (grouped.has(id)) throw new Error(`${item.id}: contradictory association ${id}`);
				grouped.add(id);
			}
		for (const pair of item.gold.order)
			for (const id of pair) if (!fields.has(id)) throw new Error(`${item.id}: unknown order field ${id}`);
	}
	return cases;
}
