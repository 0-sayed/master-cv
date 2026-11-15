import type { ResumeData } from "./data";

export type EntryOption = { en: string; ar: string; level?: number };

export const languageOptions: EntryOption[] = [
	{ en: "Arabic", ar: "العربية" },
	{ en: "English", ar: "الإنجليزية" },
	{ en: "French", ar: "الفرنسية" },
	{ en: "Urdu", ar: "الأردية" },
	{ en: "Hindi", ar: "الهندية" },
	{ en: "Spanish", ar: "الإسبانية" },
	{ en: "German", ar: "الألمانية" },
	{ en: "Turkish", ar: "التركية" },
	{ en: "Persian", ar: "الفارسية" },
	{ en: "Chinese", ar: "الصينية" },
	{ en: "Japanese", ar: "اليابانية" },
	{ en: "Korean", ar: "الكورية" },
	{ en: "Italian", ar: "الإيطالية" },
	{ en: "Portuguese", ar: "البرتغالية" },
	{ en: "Russian", ar: "الروسية" },
	{ en: "Bengali", ar: "البنغالية" },
	{ en: "Indonesian", ar: "الإندونيسية" },
	{ en: "Malay", ar: "الملايوية" },
	{ en: "Tagalog", ar: "التاغالوغية" },
	{ en: "Swahili", ar: "السواحيلية" },
];

export const fluencyOptions: EntryOption[] = [
	{ en: "Elementary", ar: "مبتدئ", level: 1 },
	{ en: "Limited working", ar: "عملي محدود", level: 2 },
	{ en: "Professional working", ar: "عملي مهني", level: 3 },
	{ en: "Full professional", ar: "مهني كامل", level: 4 },
	{ en: "Native or bilingual", ar: "لغة أم أو ثنائي اللغة", level: 5 },
];

export const skillOptions: EntryOption[] = [
	{ en: "Beginner", ar: "مبتدئ", level: 1 },
	{ en: "Intermediate", ar: "متوسط", level: 2 },
	{ en: "Advanced", ar: "متقدم", level: 4 },
	{ en: "Expert", ar: "خبير", level: 5 },
];

/** Exact preset matches only: custom prose and legacy labels remain untouched. */
export function findEntryOption(value: string, options: EntryOption[]): EntryOption | undefined {
	return options.find((option) => value === option.en || value === option.ar);
}
export function localizeEntryText(value: string, options: EntryOption[], locale: string): string {
	const option = findEntryOption(value, options);
	return option ? (locale.startsWith("ar") ? option.ar : option.en) : value;
}
/** Display-only projection, shared by renderers; never mutate saved facts or revisions. */
export function localizeResumeEntries(data: ResumeData): ResumeData {
	const locale = data.metadata.page.locale;
	const languages = (items: ResumeData["sections"]["languages"]["items"]) =>
		items.map((item) => ({
			...item,
			language: localizeEntryText(item.language, languageOptions, locale),
			fluency: localizeEntryText(item.fluency, fluencyOptions, locale),
		}));
	const skills = (items: ResumeData["sections"]["skills"]["items"]) =>
		items.map((item) => ({
			...item,
			proficiency: localizeEntryText(item.proficiency, skillOptions, locale),
		}));
	return {
		...data,
		sections: {
			...data.sections,
			languages: { ...data.sections.languages, items: languages(data.sections.languages.items) },
			skills: { ...data.sections.skills, items: skills(data.sections.skills.items) },
		},
		customSections: data.customSections.map((section) => {
			if (section.type === "languages")
				return { ...section, items: languages(section.items as ResumeData["sections"]["languages"]["items"]) };
			if (section.type === "skills")
				return { ...section, items: skills(section.items as ResumeData["sections"]["skills"]["items"]) };
			return section;
		}),
	};
}
