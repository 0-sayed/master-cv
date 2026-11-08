import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";
import { renderHostTree } from "../../forme/reconciler";
import { toFormeDocument } from "../../forme/to-forme";

it.each(["ar-SA", "en-US"])(
	"D31 converts every exported text field with %s without editing saved content",
	(locale) => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		data.basics.name = "أَحْمَدُ ١٢٣";
		data.basics.headline = "مُهَنْدِسٌ ۴۵۶";
		data.basics.phone = "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧";
		data.metadata.template = "onyx";
		data.metadata.page.locale = locale;
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.sections.projects.items = [
			{
				id: "project",
				hidden: false,
				name: "مشروع ٢٠٢٤",
				period: "١٤٤٥ هـ",
				dates: { start: null, end: null, present: false, raw: "١٤٤٥ هـ" },
				website: { url: "https://example.test/١٢", label: "رابط ۷۸۹", inlineLink: false },
				description: "<p>حَقَّقْتُ <strong>۹۸۷</strong> نَتِيجَةً ٦٥٤ ـٰ</p><p>من 2009 إلى 2011</p>",
			},
		];
		const snapshot = structuredClone(data);
		const tree = renderHostTree(<ResumeDocument data={data} template="onyx" />);
		const serialized = JSON.stringify(toFormeDocument(tree).document.children);
		for (const text of ["123", "456", "+966 50 123 4567", "2024", "1445", "789", "987", "654"])
			expect.soft(serialized).toContain(text);
		expect(serialized).not.toMatch(/[\u064B-\u0652\u0670]/u);
		expect(serialized).toContain("من 2009 إلى 2011");
		expect(serialized).toContain("هـ");
		expect(serialized).toContain("ـ");
		for (const text of ["أحمد", "مهندس", "حققت", "نتيجة"]) expect(serialized).toContain(text);
		// URLs are destinations, not display text. Do not rewrite an Arabic-digit path.
		expect(serialized).toContain("https://example.test/١٢");
		expect(data).toEqual(snapshot);
	},
);
