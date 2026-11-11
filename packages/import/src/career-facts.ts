import type { CareerSource } from "@reactive-resume/schema/career";
import type { MasterFactInput } from "@reactive-resume/schema/career-master";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { htmlToMarkdown } from "@reactive-resume/resume/markdown";
import { masterFields, masterFactInputSchema } from "@reactive-resume/schema/career-master";

/** Only the supported factual fields. Empty values and unknown date precision are never invented. */
export function buildCareerFactCandidates(data: ResumeData, source: CareerSource): MasterFactInput[] {
	const facts: MasterFactInput[] = [];
	for (const [section, fields] of Object.entries(masterFields)) {
		const items = data.sections[section as keyof typeof masterFields].items;
		for (const item of items)
			for (const field of Object.keys(fields.shape)) {
				const original = (item as unknown as Record<string, unknown>)[field];
				// Strip formatting before entity decoding; retain paragraph/list boundaries as plain text.
				const value =
					field === "description" && typeof original === "string"
						? htmlToMarkdown(original.replace(/<br\s*\/?>|<\/(?:p|div|h[1-6]|li)>/gi, "\n").replace(/<[^>]*>/g, ""))
						: original;
				if (value === undefined || value === null || (typeof value === "string" && !value.trim())) continue;
				if (
					field === "dates" &&
					typeof value === "object" &&
					!(
						"start" in value &&
						(value.start || (value as { raw?: string }).raw || (value as { present?: boolean }).present)
					)
				)
					continue;
				const parsed = masterFactInputSchema.safeParse({ section, entityId: item.id, field, value, source });
				if (parsed.success) facts.push(parsed.data);
			}
	}
	return facts;
}
