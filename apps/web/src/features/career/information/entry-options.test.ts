import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import {
	languageOptions,
	fluencyOptions,
	skillOptions,
	localizeEntryText,
	localizeResumeEntries,
} from "@reactive-resume/schema/resume/entry-options";

it("maps each proficiency preset to a stable numeric level in both languages", () => {
	expect(fluencyOptions.map((option) => option.level)).toEqual([1, 2, 3, 4, 5]);
	expect(skillOptions.map((option) => option.level)).toEqual([1, 2, 4, 5]);
	for (const option of [...fluencyOptions, ...skillOptions]) {
		expect(localizeEntryText(option.en, [option], "ar-SA")).toBe(option.ar);
		expect(localizeEntryText(option.ar, [option], "en-US")).toBe(option.en);
	}
});
it("localizes only exact known values and preserves custom and imported text", () => {
	expect(languageOptions.length).toBeGreaterThanOrEqual(20);
	expect(localizeEntryText("Arabic", languageOptions, "ar-SA")).toBe("العربية");
	for (const value of ["IELTS 7.5", "5 years", "Klingon", " Native ", "Fluent"]) {
		expect(localizeEntryText(value, fluencyOptions, "ar-SA")).toBe(value);
	}
});
it("renders preset text in the document language without changing stored data", () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "ar-SA";
	data.sections.languages.items = [
		{ id: "language", hidden: false, language: "English", fluency: "Full professional", level: 4 },
	];
	data.sections.skills.items = [
		{
			id: "skill",
			hidden: false,
			name: "TypeScript",
			proficiency: "Expert",
			level: 5,
			keywords: [],
			icon: "",
			iconColor: "",
		},
	];
	const display = localizeResumeEntries(data);
	expect(display.sections.languages.items[0]).toMatchObject({ language: "الإنجليزية", fluency: "مهني كامل", level: 4 });
	expect(display.sections.skills.items[0]?.proficiency).toBe("خبير");
	expect(data.sections.languages.items[0]?.language).toBe("English");
	expect(data.sections.skills.items[0]?.proficiency).toBe("Expert");
});
