import { describe, expect, it } from "vite-plus/test";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { parseResumeText } from "./plain-text";

const SAMPLE = `Ada Lovelace
Senior Software Engineer
Berlin, Germany | ada@example.com | +44 20 7946 0100 | https://ada.dev

SUMMARY
Engineer with 10 years building analytical systems.

WORK EXPERIENCE
Analytical Engines  Senior Engineer  Berlin
Jan 2020 - Present
• Led the difference engine rewrite
• Mentored four junior engineers
Babbage Ltd  Engineer  London
Mar 2016 - Dec 2019
• Built the punch card pipeline

EDUCATION
University of London  BSc Mathematics
2012 - 2016

SKILLS
TypeScript, Rust, PostgreSQL

LANGUAGES
English (Native)
German (B2)

CERTIFICATIONS
AWS Solutions Architect  Amazon  2021
`;

describe("parseResumeText", () => {
	const data = parseResumeText(SAMPLE);

	it("reads the contact block", () => {
		expect(data.basics).toMatchObject({
			name: "Ada Lovelace",
			headline: "Senior Software Engineer",
			email: "ada@example.com",
			phone: "+44 20 7946 0100",
			location: "Berlin, Germany",
		});
		expect(data.basics.website.url).toBe("https://ada.dev");
	});

	it("splits experience into one entry per role", () => {
		expect(data.sections.experience.items).toHaveLength(2);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "Analytical Engines",
			position: "Senior Engineer",
			location: "Berlin",
			period: "Jan 2020 – Present",
		});
		expect(data.sections.experience.items[1]).toMatchObject({
			company: "Babbage Ltd",
			position: "Engineer",
			period: "Mar 2016 – Dec 2019",
		});
	});

	it("keeps bullets as a list in the description", () => {
		expect(data.sections.experience.items[0]?.description).toBe(
			"<ul><li>Led the difference engine rewrite</li><li>Mentored four junior engineers</li></ul>",
		);
	});

	it("reads education", () => {
		expect(data.sections.education.items[0]).toMatchObject({
			school: "University of London",
			degree: "BSc Mathematics",
			period: "2012 – 2016",
		});
	});

	it("splits a comma separated skills line", () => {
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["TypeScript", "Rust", "PostgreSQL"]);
	});

	it("splits a language from its fluency", () => {
		expect(data.sections.languages.items).toMatchObject([
			{ language: "English", fluency: "Native" },
			{ language: "German", fluency: "B2" },
		]);
	});

	it("reads a trailing year as the certification date", () => {
		expect(data.sections.certifications.items[0]).toMatchObject({
			title: "AWS Solutions Architect",
			issuer: "Amazon",
			date: "2021",
		});
	});

	it("places every populated section on the page in document order", () => {
		expect(data.metadata.layout.pages[0]?.main).toEqual([
			"summary",
			"experience",
			"education",
			"skills",
			"languages",
			"certifications",
		]);
	});
});

describe("parseResumeText edge cases", () => {
	it("returns usable data for empty input", () => {
		const data = parseResumeText("");
		expect(() => resumeDataSchema.parse(data)).not.toThrow();
		expect(data.basics.name).toBe("");
		expect(data.metadata.layout.pages[0]?.main).toEqual([]);
	});

	it("does not mistake a date range for a phone number", () => {
		const data = parseResumeText("Ada Lovelace\nBerlin\n2016 - 2019\n");
		expect(data.basics.phone).toBe("");
	});

	it("keeps an unrecognized heading as a custom section", () => {
		const data = parseResumeText("Ada\n\nSKILLS\nRust\n\nSPEAKING\nGave a talk at a conference\n");
		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ type: "summary", title: "SPEAKING" });
		expect(data.metadata.layout.pages[0]?.main).toContain(data.customSections[0]?.id);
	});

	it("keeps unclassified header parts in the description rather than dropping them", () => {
		const data = parseResumeText("EXPERIENCE\nAcme  Engineer  Berlin  Remote  Contract\n2020 - 2022\n");
		expect(data.sections.experience.items[0]?.description).toContain("Remote");
		expect(data.sections.experience.items[0]?.description).toContain("Contract");
	});

	it("escapes markup found in the source text", () => {
		const data = parseResumeText("SUMMARY\nI write <script>alert(1)</script> safely\n");
		expect(data.summary.content).toContain("&lt;script&gt;");
		expect(data.summary.content).not.toContain("<script>");
	});

	it("treats a heading with a trailing colon as a heading", () => {
		const data = parseResumeText("Ada\n\nSkills:\nRust, Go\n");
		expect(data.sections.skills.items.map((item) => item.name)).toEqual(["Rust", "Go"]);
	});
});

describe("parseResumeText multi-line entry preambles", () => {
	it("keeps an uppercase company followed by a separate role line as one entry", () => {
		const data = parseResumeText(
			"EXPERIENCE\nACME CORPORATION\nSenior Engineer\nJan 2020 - Present\n• Led the rewrite\n",
		);

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "ACME CORPORATION",
			position: "Senior Engineer",
			period: "Jan 2020 – Present",
		});
	});

	it("still recognizes a real heading whose section starts with bullets", () => {
		const data = parseResumeText("Ada\nada@example.com\n\nCAREER HIGHLIGHTS\n• Shipped in 2019\n• Grew the team\n");

		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ title: "CAREER HIGHLIGHTS" });
	});
});

describe("parseResumeText four-line entry preambles", () => {
	it("keeps company, role, location and dates as one entry", () => {
		const data = parseResumeText(
			"EXPERIENCE\nACME CORPORATION\nSenior Engineer\nBerlin, Germany\nJan 2020 - Present\n• Led the rewrite\n",
		);

		expect(data.customSections).toHaveLength(0);
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "ACME CORPORATION",
			position: "Senior Engineer",
			location: "Berlin, Germany",
			period: "Jan 2020 – Present",
		});
	});
});

describe("parseResumeText keeps content the layout hides", () => {
	it("recognizes isolated title-case custom section headings", () => {
		const initial = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nConferences\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);
		const subsequent = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nEXPERIENCE\nAcme  Engineer\n2020 - 2022\nBuilt products.\n\nConferences\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);

		expect(initial.customSections[0]).toMatchObject({ title: "Conferences" });
		expect(subsequent.customSections[0]).toMatchObject({ title: "Conferences" });
		expect(subsequent.sections.experience.items).toHaveLength(1);
	});

	it("keeps a dated custom section that opens the body", () => {
		const data = parseResumeText(
			"Ada Lovelace\nada@example.com\n\nCONFERENCES\nReactConf\nBerlin\n2021\nSpoke about parsers\n",
		);

		expect(data.basics.headline).not.toBe("CONFERENCES");
		expect(data.customSections).toHaveLength(1);
		expect(data.customSections[0]).toMatchObject({ title: "CONFERENCES" });

		const content = data.customSections[0]?.items[0]?.content ?? "";
		for (const line of ["ReactConf", "Berlin", "2021", "Spoke about parsers"]) {
			expect(content).toContain(line);
		}
	});

	it("keeps unbulleted descriptions with their own role", () => {
		const data = parseResumeText(
			"EXPERIENCE\nAcme  Engineer  Berlin\nJan 2020 - Present\nBuilt the thing end to end.\nWorked with a team of five.\nBabbage Ltd  Engineer  London\nMar 2016 - Dec 2019\nDid other work.\n",
		);

		expect(data.sections.experience.items).toHaveLength(2);
		expect(data.sections.experience.items[0]?.description).toContain("Built the thing end to end.");
		expect(data.sections.experience.items[0]?.description).toContain("Worked with a team of five.");
		expect(data.sections.experience.items[1]).toMatchObject({ company: "Babbage Ltd", location: "London" });
	});

	it("does not split an entry on a bare year in a section that ignores single dates", () => {
		const data = parseResumeText(
			"EXPERIENCE\nAcme  Engineer\nJan 2020 - Present\nGrew the team.\nMore work here.\n2022\n",
		);

		expect(data.sections.experience.items).toHaveLength(1);

		const description = data.sections.experience.items[0]?.description ?? "";
		for (const line of ["Grew the team.", "More work here.", "2022"]) {
			expect(description).toContain(line);
		}
	});

	it("stays schema-valid when a section starts with its dates", () => {
		const data = parseResumeText(
			"EXPERIENCE\nJan 2020 - Present\nAcme Corp\nSenior Engineer\n\nEDUCATION\n2012 - 2016\nUniversity of London\n\nCERTIFICATIONS\n2021\n",
		);

		expect(() => resumeDataSchema.parse(data)).not.toThrow();
		expect(data.sections.experience.items[0]).toMatchObject({ company: "Acme Corp", period: "Jan 2020 – Present" });
		expect(data.sections.education.items[0]).toMatchObject({ school: "University of London" });
		expect(data.sections.certifications.items).toHaveLength(0);
	});
});

it.each(["٢٠٢٠ - ٢٠٢٢", "۲۰۲۰ - ۲۰۲۲", "2020 - حتى الآن"])(
	"imports Arabic facts and period %s with Western-digit import normalization",
	(period) => {
		const data = parseResumeText(
			`أحمد العتيبي\n+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧\n\nالخِبْـرَة العَمَلِيَّة\nشركة الأفق | مهندس برمجيات | الرياض\n${period}\n• طورت نظام المدفوعات\nالتعليم\nجامعة الملك سعود | علوم الحاسب\n2016 - 2020\nالمهارات\nTypeScript`,
			{ locale: "ar-SA" },
		);
		expect(data.basics.name).toBe("أحمد العتيبي");
		expect(data.basics.phone).toBe("+966 50 123 4567");
		expect(data.basics.headline).not.toContain("٩٦٦");
		expect(data.sections.experience.items).toHaveLength(1);
		expect(data.sections.experience.items[0]).toMatchObject({
			company: "شركة الأفق",
			position: "مهندس برمجيات",
			dates: { start: "2020", end: period.includes("الآن") ? null : "2022", present: period.includes("الآن") },
		});
		expect(data.sections.education.items[0]?.school).toBe("جامعة الملك سعود");
		expect(data.sections.skills.items[0]?.name).toBe("TypeScript");
	},
);
it("recognizes Arabic aliases with omitted source locale and Persian contact digits", () => {
	const data = parseResumeText("ليلى\n+۹۶۶ ۵۰ ۱۲۳ ۴۵۶۷\nالخبرة العملية\nشركة ألف | مديرة\n2020 - 2022");
	expect(data.basics.phone).toBe("+966 50 123 4567");
	expect(data.sections.experience.items[0]?.company).toBe("شركة ألف");
});
it("decodes Arabic presentation forms without folding hamza", () => {
	const data = parseResumeText(
		"أﺣﻤﺪ اﻟﻌﺘﻴﺒﻲ\nsynthetic@example.test\nاﻟﺨﺒﺮة اﻟﻌﻤﻠﻴﺔ\nﺷﺮﻛﺔ اﻷﻓﻖ | ﻣﻬﻨﺪس ﺑﺮﻣﺠﻴﺎت\n2020 - 2022",
		{ locale: "ar-SA" },
	);
	expect(data.basics.name).toBe("أحمد العتيبي");
	expect(data.sections.experience.items[0]).toMatchObject({ company: "شركة الأفق", position: "مهندس برمجيات" });
});
it.each([
	["١٤٤٥ هـ - ١٤٤٦ هـ", "1445 هـ - 1446 هـ"],
	["٠١/٠٢/٢٠٢٤", "01/02/2024"],
])("keeps explicitly uncertain date evidence in editable raw dates: %s", (period, normalized) => {
	const data = parseResumeText(`أحمد\na@example.test\nالخبرة العملية\nشركة ألف | مهندس\n${period}`, {
		locale: "ar-SA",
	});
	expect(data.sections.experience.items[0]?.dates?.raw).toBe(normalized);
	expect(resumeDataSchema.parse(data).basics.name).toBe("أحمد");
});

it("D33 normalizes extracted PDF/plain text digits and marks before recognizing fields", () => {
	const source = "أَحْمَدُ\na@example.test\n+٩٦٦ ۵۰ ١٢٣ ۴۵۶۷\n\nالمُلَخَّص\nحَقَّقْتُ ١٢ و۳۴ ـٰ\n\nالخبرة\nشَرِكَةٌ | مُهَنْدِسٌ\n٢٠١٥ - ۲۰۱۷";
	const data = parseResumeText(source, { locale: "ar-SA" });
	expect(data.basics.name).toBe("أحمد");
	expect(data.basics.phone).toBe("+966 50 123 4567");
	expect(data.summary.content).toContain("حققت 12 و34 ـ");
	expect(data.sections.experience.items[0]).toMatchObject({
		company: "شركة",
		position: "مهندس",
		period: "2015 – 2017",
	});
	expect(JSON.stringify(data)).not.toMatch(/[٠-٩۰-۹\u064B-\u0652\u0670]/u);
});
