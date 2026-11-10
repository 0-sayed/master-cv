import { expect, it } from "vite-plus/test";
import { resumeDataSchema } from "./data";
import { createSampleResumeData, sampleResumeData } from "./sample";

it("defaults to an Arabic Saudi sample with explicitly fictional employers", () => {
	expect(sampleResumeData.basics.name).toBe("سارة العتيبي");
	expect(sampleResumeData.basics.location).toContain("الرياض");
	expect(sampleResumeData.metadata.page.locale).toBe("ar-SA");
	expect(sampleResumeData.sections.experience.items.every((item) => item.company.includes("مثال"))).toBe(true);
	expect(resumeDataSchema.safeParse(sampleResumeData).success).toBe(true);
});
it.each(["ar-SA", "en-US"])(
	"provides distinct male and female personas in %s without altering document typography",
	(locale) => {
		const female = createSampleResumeData(undefined, locale, "female");
		const male = createSampleResumeData(undefined, locale, "male");
		expect(female.basics.name).toBe(locale === "ar-SA" ? "سارة العتيبي" : "Sara Alotaibi");
		expect(male.basics.name).toBe(locale === "ar-SA" ? "عبدالله القحطاني" : "Abdullah Alqahtani");
		expect(male.picture.url).not.toBe(female.picture.url);
		expect(female.picture.url).toBe("/photos/sample-woman.jpg");
		expect(male.basics.location).toContain(locale === "ar-SA" ? "جدة" : "Jeddah");
		expect(male.metadata.typography).toEqual(female.metadata.typography);
		expect(resumeDataSchema.safeParse(male).success).toBe(true);
		expect(resumeDataSchema.safeParse(female).success).toBe(true);
	},
);
it("keeps account name overrides isolated from the canonical sample", () => {
	const sample = createSampleResumeData("  Account holder  ", "en-US");
	expect(sample.basics.name).toBe("Account holder");
	const experience = sample.sections.experience.items[0];
	if (!experience) throw new Error("Sample experience missing");
	experience.company = "Changed";
	expect(createSampleResumeData(undefined, "en-US").sections.experience.items[0]?.company).not.toBe("Changed");
});
