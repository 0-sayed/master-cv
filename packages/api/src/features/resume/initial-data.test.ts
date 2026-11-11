import { expect, it } from "vite-plus/test";
import { createResumeData } from "./initial-data";
it.each(["ar-SA", "en-US"] as const)("explicit empty creation keeps %s content blank", (locale) => {
	const data = createResumeData({ name: "Account holder", locale, empty: true });
	expect(data.basics.name).toBe("");
	expect(data.metadata.page.locale).toBe(locale);
	expect(data.sections.experience.items).toEqual([]);
});

it.each(["ar-SA", "en-US"] as const)("seeds a new %s document in its requested language", (locale) => {
	const data = createResumeData({ withSampleData: true, locale });
	expect(data.basics.name).toBe(locale === "ar-SA" ? "سارة العتيبي" : "Sara Alotaibi");
	expect(data.basics.location).toContain(locale === "ar-SA" ? "الرياض" : "Riyadh");
	expect(data.metadata.page.locale).toBe(locale);
	expect(data.sections.experience.items[0]?.company).toContain(locale === "ar-SA" ? "مثال" : "example");
});
it("keeps account holder names and blank documents intact", () => {
	expect(createResumeData({ withSampleData: true, name: "Account holder", locale: "ar-SA" }).basics.name).toBe(
		"Account holder",
	);
	expect(createResumeData({ withSampleData: false, name: "Account holder" }).sections.experience.items).toEqual([]);
});

it.each([false, true])(
	"uses Carlito for new English CVs and IBM Plex Sans Arabic for new Arabic CVs (sample %s)",
	(withSampleData) => {
		for (const [locale, family] of [
			["en-US", "Carlito"],
			["ar-SA", "IBM Plex Sans Arabic"],
		] as const) {
			const data = createResumeData({ locale, withSampleData });
			expect(data.metadata.typography.body.fontFamily).toBe(family);
			expect(data.metadata.typography.heading.fontFamily).toBe(family);
			expect(data.metadata.typography.body.fontWeights).toEqual(["400", "700"]);
			expect(data.metadata.typography.heading.fontWeights).toEqual(["700"]);
		}
	},
);
