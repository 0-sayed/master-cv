import type { CareerMaster } from "./career-master";

export const CAREER_COMPLETENESS_WEIGHTS = {
	contact: 20,
	summary: 15,
	experience: 25,
	education: 15,
	skills: 15,
	languages: 10,
} as const;
export type CompletenessPart = keyof typeof CAREER_COMPLETENESS_WEIGHTS;

/** Contact 20, summary 15, described experience 25, education 15, skills 15, languages 10. Only saved master data counts. */
export function careerCompleteness(master: CareerMaster) {
	const fields = (section: string, field: string) =>
		master.facts
			.filter(
				(fact) =>
					fact.status === "active" &&
					fact.confirmation === "confirmed" &&
					fact.structured?.section === section &&
					fact.structured.field === field &&
					typeof fact.structured.value === "string" &&
					fact.structured.value.trim(),
			)
			.flatMap((fact) => (fact.structured ? [fact.structured] : []));
	const contact = master.contact;
	const complete: Record<CompletenessPart, boolean> = {
		contact: Boolean(
			contact && [contact.name, contact.email, contact.phone, contact.location].every((value) => value.trim()),
		),
		summary: Boolean(master.summary?.trim()),
		experience: fields("experience", "description").some((description) =>
			["company", "position"].every((field) =>
				fields("experience", field).some((value) => value.entityId === description.entityId),
			),
		),
		education: fields("education", "school").some((school) =>
			fields("education", "degree").some((degree) => degree.entityId === school.entityId),
		),
		skills: fields("skills", "name").length > 0,
		languages: fields("languages", "language").length > 0,
	};
	const parts = Object.keys(CAREER_COMPLETENESS_WEIGHTS) as CompletenessPart[];
	const percentage = parts.reduce((sum, part) => sum + (complete[part] ? CAREER_COMPLETENESS_WEIGHTS[part] : 0), 0);
	const missing = parts.find((part) => !complete[part]);
	return {
		percentage,
		next: missing
			? {
					part: missing,
					gain: CAREER_COMPLETENESS_WEIGHTS[missing],
					target: percentage + CAREER_COMPLETENESS_WEIGHTS[missing],
				}
			: null,
	};
}
