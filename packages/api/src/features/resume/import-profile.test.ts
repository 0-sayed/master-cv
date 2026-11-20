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

	it("does not treat JSON object key order as a profile change", () => {
		const current = careerProfileDataSchema.parse({
			contact: { name: "Saved", email: "saved@example.com", phone: "123", location: "Jeddah" },
			summary: "Saved summary",
		});
		const reordered = Object.fromEntries(Object.entries(current).reverse()) as typeof current;
		if (current.contact) {
			reordered.contact = Object.fromEntries(Object.entries(current.contact).reverse()) as typeof current.contact;
		}

		expect(importedProfileData(reordered, defaultResumeData)).toEqual({ data: current, changed: false });
	});

	it("does not create empty contact or summary data", () => {
		const current = careerProfileDataSchema.parse({});
		expect(importedProfileData(current, defaultResumeData)).toEqual({ data: current, changed: false });
	});

	it("skips imported profile fields that exceed career profile limits", () => {
		const current = careerProfileDataSchema.parse({});
		const resume = structuredClone(defaultResumeData);
		resume.basics.name = "Imported name";
		resume.basics.email = `${"a".repeat(245)}@example.com`;
		resume.basics.phone = "1".repeat(100);
		resume.basics.location = "L".repeat(301);
		resume.summary.content = `<p>${"S".repeat(4001)}</p>`;

		const result = importedProfileData(current, resume);

		expect(result.data.contact).toMatchObject({
			name: "Imported name",
			phone: "1".repeat(100),
			email: "",
			location: "",
		});
		expect(result.data.summary).toBeUndefined();
		expect(result.changed).toBe(true);
	});
});
