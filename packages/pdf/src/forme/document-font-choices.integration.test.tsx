import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { act } from "react";
import { getWebFontSource } from "@reactive-resume/fonts";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { configureFontReader } from "./fonts";
import { readServerFont } from "./fonts.node";
import { lostCharacters, renderResume } from "./render";

configureFontReader(readServerFont);
it.each(["IBM Plex Sans Arabic", "Cairo"])(
	"embeds %s Regular/Bold in an Arabic mixed CV without lost characters",
	{ timeout: 60000 },
	async (family) => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		data.basics.name = "أحمد العتيبي";
		data.basics.headline = "مهندس برمجيات Software Engineer";
		data.basics.email = "synthetic@example.test";
		data.metadata.page.locale = "ar-SA";
		data.metadata.page.hideIcons = true;
		data.summary.content = "<p>شركة الأفق <strong>جامعة الملك سعود</strong> Latin 0123456789</p>";
		data.metadata.layout.pages = [{ fullWidth: true, main: ["summary"], sidebar: [] }];
		data.metadata.typography.body = {
			...data.metadata.typography.body,
			fontFamily: family,
			fontWeights: ["400", "700"],
		};
		data.metadata.typography.heading = {
			...data.metadata.typography.heading,
			fontFamily: family,
			fontWeights: ["700"],
		};
		expect(getWebFontSource(family, "400")).toBeTruthy();
		expect(getWebFontSource(family, "700")).toBeTruthy();
		const result = await act(() => renderResume(forme, { data }));
		expect(result.missingFonts).toEqual([]);
		expect(lostCharacters(result.warnings)).toBeNull();
		const text = execFileSync("pdftotext", ["-enc", "UTF-8", "-", "-"], { input: result.pdf, encoding: "utf8" });
		for (const word of [
			"أحمد",
			"العتيبي",
			"مهندس",
			"برمجيات",
			"شركة",
			"الأفق",
			"جامعة",
			"الملك",
			"سعود",
			"Software",
			"Engineer",
			"Latin",
			"0123456789",
		])
			expect(text).toContain(word);
		expect(text).not.toContain("?");
	},
);
