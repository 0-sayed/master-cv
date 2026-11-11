import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createResumePdfFile } from "../server";

it.each(["+966 50 123 4567", "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧", "+۹۶۶ ۵۰ ۱۲۳ ۴۵۶۷"])(
	"keeps numeric contacts and date ranges logical in an Arabic document: %s",
	{ timeout: 60000 },
	async (phone) => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		data.basics.name = "أحمد العتيبي";
		data.basics.phone = phone;
		data.metadata.page.locale = "ar-SA";
		data.metadata.page.hideIcons = true;
		data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
		data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
		data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
		data.sections.experience.items = [
			{
				id: "job",
				hidden: false,
				company: "شركة الأفق",
				position: "مهندس برمجيات",
				period: "",
				dates: { start: "2020", end: "2022", present: false },
				description: "",
				location: "",
				website: { url: "", label: "", inlineLink: false },
				roles: [],
			},
		];
		const file = await act(() => createResumePdfFile({ data, filename: "arabic.pdf" }));
		const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-", "-"], {
			input: Buffer.from(await file.arrayBuffer()),
			encoding: "utf8",
		})
			.replace(/[\u202a-\u202e]/gu, "")
			.replace(/\s+/g, " ");
		expect(text).toContain("+966 50 123 4567");
		expect(text).toContain("2020-2022");
		expect(text).toContain("مهندس برمجيات");
		expect(data.basics.phone).toBe(phone);
	},
);
