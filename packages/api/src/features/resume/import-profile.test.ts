import { describe, expect, it } from "vite-plus/test";
import { careerProfileDataSchema } from "@reactive-resume/schema/career";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { importedProfileData } from "./import-profile";

describe("imported profile data", () => {
	it("fills only empty contact and summary fields", () => {
		const current = careerProfileDataSchema.parse({
			contact: { name: "Saved name", email: "", phone: "", location: "" },
			summary: " ",
		});
		const resume = structuredClone(defaultResumeData);
		resume.basics.name = "Imported name";
		resume.basics.email = "person@example.com";
		resume.basics.phone = "+1 555 0100";
		resume.basics.location = "Riyadh, Saudi Arabia";
		resume.summary.content = "<p>Imported summary</p>";
		expect(importedProfileData(current, resume)).toEqual({
			data: {
				...current,
				contact: {
					name: "Saved name",
					email: "person@example.com",
					phone: "+1 555 0100",
					location: "Riyadh, Saudi Arabia",
				},
				summary: "Imported summary",
			},
			changed: true,
		});
	});

	it("leaves saved profile fields unchanged", () => {
		const current = careerProfileDataSchema.parse({
			contact: { name: "Saved", email: "saved@example.com", phone: "123", location: "Jeddah" },
			summary: "Saved summary",
		});
		expect(importedProfileData(current, defaultResumeData)).toEqual({ data: current, changed: false });
	});

	it("does not create empty contact or summary data", () => {
		const current = careerProfileDataSchema.parse({});
		expect(importedProfileData(current, defaultResumeData)).toEqual({ data: current, changed: false });
	});
});
