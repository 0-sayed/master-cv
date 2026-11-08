// @vitest-environment happy-dom

import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { strFromU8, unzipSync } from "fflate";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { buildDocx } from "./index";

describe("buildDocx", () => {
	it("retains Arabic text, mixed contacts and role/date order in the actual ZIP XML", async () => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = "ar-SA";
		data.picture.hidden = true;
		data.basics.name = "لَيْلَى الحربي";
		data.basics.phone = "+966 50 123 4567";
		data.basics.email = "synthetic@example.test";
		data.summary.content = "<p>أطوّر خدمات Node.js آمنة.</p>";
		data.sections.experience.title = "الخبرة العملية";
		data.sections.experience.items = [
			{
				id: "job",
				hidden: false,
				company: "شركة الأفق",
				position: "مهندسة برمجيات",
				period: "",
				dates: { start: "2020", end: "2022", present: false },
				location: "الرياض",
				website: { url: "", label: "", inlineLink: false },
				description: "<p>طورت خدمات آمنة.</p>",
				roles: [],
			},
		];
		data.metadata.layout.pages = [{ fullWidth: true, main: ["summary", "experience"], sidebar: [] }];
		const files = unzipSync(new Uint8Array(await (await buildDocx(data)).arrayBuffer()));
		const entry = (path: string) => {
			const bytes = files[path];
			assert(bytes);
			return strFromU8(bytes);
		};
		const xml = entry("word/document.xml");
		const styles = entry("word/styles.xml");
		for (const value of [
			data.basics.name,
			data.basics.phone,
			data.basics.email,
			"أطوّر خدمات Node.js آمنة.",
			"شركة الأفق",
			"مهندسة برمجيات",
			"2020",
			"2022",
		])
			expect(xml).toContain(value);
		expect(styles + entry("word/settings.xml")).toContain("w:bidi");
		expect(xml.indexOf("شركة الأفق")).toBeLessThan(xml.indexOf("مهندسة برمجيات"));
		expect(xml.indexOf("2020")).toBeLessThan(xml.indexOf("2022"));
	});
	it("returns a Blob for the sample resume", async () => {
		const blob = await buildDocx(sampleResumeData);
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.size).toBeGreaterThan(0);
	});
});
