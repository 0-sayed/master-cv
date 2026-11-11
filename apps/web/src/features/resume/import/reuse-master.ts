import type { MasterFact } from "@reactive-resume/schema/career-master";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { addBuiltinSection, createEntry } from "../editor/write/model";
/** Explicit reuse copies accepted values; proposed edits never overwrite a confirmed value. */
export function reuseConfirmedFacts(initial: ResumeData, facts: MasterFact[]): ResumeData {
	const data = structuredClone(initial);
	for (const fact of facts) {
		if (fact.confirmation !== "confirmed" || !fact.structured) continue;
		const { section, entityId, field, value } = fact.structured;
		const items = data.sections[section].items;
		let entry = items.find((item) => item.id === entityId);
		if (!entry) {
			// Reuse the owning model's placement behavior, replacing its temporary empty entry.
			const temporary = addBuiltinSection(data, section);
			const index = items.findIndex((item) => item.id === temporary);
			const created = { ...createEntry(section), id: entityId };
			items.splice(index, 1, created as never);
			entry = items.find((item) => item.id === entityId);
		}
		if (!entry) throw new Error("Could not create a career entry");
		Object.assign(entry, { [field]: structuredClone(value) });
	}
	return data;
}
