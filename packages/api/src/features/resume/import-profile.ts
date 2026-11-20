import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { careerProfileDataSchema, type CareerProfileData } from "@reactive-resume/schema/career";
import { careerPlainText } from "../career/plain-text";

const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
			.join(",")}}`;
	return JSON.stringify(value);
};

export function importedProfileData(current: CareerProfileData, resume: ResumeData) {
	let contact = current.contact ? { ...current.contact } : undefined;
	const contactLimits = { name: 200, email: 254, phone: 100, location: 300 };
	for (const field of ["name", "email", "phone", "location"] as const) {
		const imported = resume.basics[field].trim();
		if (!contact?.[field]?.trim() && imported && imported.length <= contactLimits[field]) {
			contact ??= { name: "", email: "", phone: "", location: "" };
			contact[field] = imported;
		}
	}
	const importedSummary = careerPlainText(resume.summary.content).trim();
	const summary = current.summary?.trim()
		? current.summary
		: importedSummary.length <= 4000
			? importedSummary || current.summary
			: current.summary;
	const data = careerProfileDataSchema.parse({
		...current,
		...(contact ? { contact } : {}),
		...(summary !== undefined ? { summary } : {}),
	});
	return { data, changed: canonical(data) !== canonical(current) };
}
