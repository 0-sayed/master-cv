import { expect, it } from "vite-plus/test";
import { createResumeData } from "./initial-data";

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
