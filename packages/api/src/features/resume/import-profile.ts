import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { careerProfileDataSchema, type CareerProfileData } from "@reactive-resume/schema/career";
import { careerPlainText } from "../career/plain-text";

export function importedProfileData(current: CareerProfileData, resume: ResumeData) {
	let contact = current.contact ? { ...current.contact } : undefined;
	for (const field of ["name", "email", "phone", "location"] as const) {
		const imported = resume.basics[field].trim();
		if (!contact?.[field]?.trim() && imported) {
			contact ??= { name: "", email: "", phone: "", location: "" };
			contact[field] = imported;
		}
	}
	const summary = current.summary?.trim()
		? current.summary
		: careerPlainText(resume.summary.content).trim() || current.summary;
	const data = careerProfileDataSchema.parse({
		...current,
		...(contact ? { contact } : {}),
		...(summary !== undefined ? { summary } : {}),
	});
	return { data, changed: JSON.stringify(data) !== JSON.stringify(current) };
}
