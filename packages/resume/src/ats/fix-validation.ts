import type { ResumeData } from "@reactive-resume/schema/resume/data";

/** Legacy empty titles use renderer defaults. An existing explicit heading cannot be erased. */
export function hasBlankHeadingChange(before: ResumeData, after: ResumeData): boolean {
	const headings = (data: ResumeData) =>
		new Map([
			["summary", data.summary.title],
			...Object.entries(data.sections).map(([key, section]) => [key, section.title] as const),
			...data.customSections.map((section) => [section.id, section.title] as const),
		]);
	const previous = headings(before);
	return [...headings(after)].some(([key, title]) => Boolean(previous.get(key)?.trim()) && !title.trim());
}
