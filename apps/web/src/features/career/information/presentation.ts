import type { Section } from "./model";
import type { CareerMaster, MasterFact } from "@reactive-resume/schema/career-master";

export const careerSections = ["experience", "education", "skills", "languages", "certifications"] as const;
export const previewLimits: Record<Section, number> = {
	experience: 3,
	education: 2,
	skills: 8,
	languages: 4,
	certifications: 3,
};
export type CareerEntryView = {
	section: Section;
	entityId: string;
	facts: MasterFact[];
	documents: CareerMaster["links"];
	needsReview: boolean;
};
export function distinctDocuments(links: CareerMaster["links"]): CareerMaster["links"] {
	const seen = new Set<string>();
	return links.filter((link) => {
		if (seen.has(link.resumeId)) return false;
		seen.add(link.resumeId);
		return true;
	});
}
export function sectionEntries(master: CareerMaster, section: Section): CareerEntryView[] {
	const grouped = new Map<string, MasterFact[]>();
	for (const fact of master.facts) {
		const value = fact.proposedStructured ?? fact.structured;
		if (value?.section !== section) continue;
		const facts = grouped.get(value.entityId) ?? [];
		facts.push(fact);
		grouped.set(value.entityId, facts);
	}
	const order = new Set([
		...(master.sections.find((item) => item.section === section)?.entityIds ?? []),
		...grouped.keys(),
	]);
	return [...order].flatMap((entityId) => {
		const facts = grouped.get(entityId);
		if (!facts?.length) return [];
		const factIds = new Set(facts.map((fact) => fact.id));
		return [
			{
				section,
				entityId,
				facts,
				documents: distinctDocuments(master.links.filter((link) => factIds.has(link.factId))),
				needsReview: facts.some((fact) => !!fact.proposedStructured || fact.confirmation === "pending"),
			},
		];
	});
}
