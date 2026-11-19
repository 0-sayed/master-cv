import { expect, it } from "vite-plus/test";
import { analyzePdfResume } from "./index";
import { makeRawExtraction } from "./test-fixtures";

it.each([
	{ language: "en-US", bullet: `• ${"Assisted with routine work ".repeat(12)}` },
	{ language: "ar-SA", bullet: `• ${"ساعدت في العمل ".repeat(16)}` },
])("locates every long and weak bullet in $language", ({ language, bullet }) => {
	const lines = Array.from({ length: 4 }, () => bullet);
	const report = analyzePdfResume(makeRawExtraction({ lines, metadata: { language } }), {
		now: new Date("2026-11-19T09:00:00Z"),
	});
	for (const code of ["LONG_BULLETS", "WEAK_ACTION_VERBS", "NO_QUANTIFIED_IMPACT"]) {
		const finding = report.tips.find((item) => item.code === code);
		expect(finding?.evidence?.locations).toHaveLength(4);
		expect(finding?.evidence?.locations?.every((location) => location.box && location.page === 1)).toBe(true);
	}
});

it("does not include adjacent columns when locating a date range", () => {
	const lines = ["2010 - 2012", "2013 - 2015", "2016 - 2017", "01/2019 - 02/2020", "03/2022 - 04/2023"].flatMap(
		(text, index) => [
			{ text, x: 300, y: 80 + index * 20 },
			{ text: "Unrelated column", x: 20, y: 80 + index * 20 },
		],
	);
	const report = analyzePdfResume(makeRawExtraction({ lines }), { now: new Date("2026-11-19") });
	const finding = report.tips.find((item) => item.code === "NO_CURRENT_ROLE_MARKER");
	expect(finding?.evidence?.locations?.[0]?.box?.x).toBe(300);
	expect(finding?.evidence?.locations?.[0]?.snippet).toBe("03/2022 - 04/2023");
});

it("does not include an adjacent heading when locating a weak bullet", () => {
	const lines = Array.from({ length: 4 }, (_, index) => [
		{ text: "التعليم", x: 20, y: 80 + index * 20 },
		{ text: "• ساعدت في العمل", x: 300, y: 80 + index * 20 },
	]).flat();
	const report = analyzePdfResume(makeRawExtraction({ lines, metadata: { language: "ar-SA" } }), {
		now: new Date("2026-11-19"),
	});
	const finding = report.tips.find((item) => item.code === "WEAK_ACTION_VERBS");
	expect(finding?.evidence?.locations?.[0]?.box?.x).toBe(300);
});

it.each([
	{ language: "en-US", dates: ["2010 - 2012", "2013 - 2015", "2016 - 2017", "01/2019 - 02/2020", "03/2022 - 04/2023"] },
	{ language: "ar-SA", dates: ["٢٠١٠ - ٢٠١٢", "٢٠١٣ - ٢٠١٥", "٢٠١٦ - ٢٠١٧", "٠١/٢٠١٩ - ٠٢/٢٠٢٠", "٠٣/٢٠٢٢ - ٠٤/٢٠٢٣"] },
])("locates minority dates, gap boundaries, and the latest role in $language", ({ language, dates }) => {
	const report = analyzePdfResume(
		makeRawExtraction({ lines: [language === "ar-SA" ? "الخبرة" : "Experience", ...dates], metadata: { language } }),
		{
			now: new Date("2026-11-19T09:00:00Z"),
		},
	);
	const findings = [...report.findings, ...report.tips];
	const locations = (code: string) => findings.find((item) => item.code === code)?.evidence?.locations;
	expect(locations("MIXED_DATE_FORMATS")?.map((item) => item.snippet)).toEqual(dates.slice(3));
	expect(locations("EMPLOYMENT_GAP")?.map((item) => item.snippet)).toContain(dates[3]);
	expect(locations("EMPLOYMENT_GAP")?.map((item) => item.snippet)).toContain(dates[4]);
	expect(locations("NO_CURRENT_ROLE_MARKER")?.map((item) => item.snippet)).toEqual([dates[4]]);
});

it.each(["en-US", "ar-SA"])("locates small text spans in %s", (language) => {
	const report = analyzePdfResume(
		makeRawExtraction({
			lines: [{ text: language === "ar-SA" ? "نص صغير" : "Small text", size: 7 }],
			metadata: { language },
		}),
		{
			now: new Date("2026-11-19T09:00:00Z"),
		},
	);
	const finding = [...report.findings, ...report.tips].find((item) => item.code === "SMALL_BODY_TEXT");
	expect(finding?.evidence?.locations).toHaveLength(1);
	expect(finding?.evidence?.locations?.[0]?.box.height).toBeGreaterThan(0);
});

it.each([
	{ language: "en-US", line: "I helped my team with my work." },
	{ language: "ar-SA", line: "أنا عملت في عملي وكانت خبرتي مفيدة." },
])("locates each first-person line in $language", ({ language, line }) => {
	const report = analyzePdfResume(makeRawExtraction({ lines: [line, line], metadata: { language } }), {
		now: new Date("2026-11-19T09:00:00Z"),
	});
	const finding = report.tips.find((item) => item.code === "FIRST_PERSON_PRONOUNS");
	expect(finding?.evidence?.locations).toHaveLength(2);
});

it.each([
	{ language: "en-US", dates: ["2024 - 2021", "2023 - 2020", "2030 - 2032", "2033 - 2035"] },
	{ language: "ar-SA", dates: ["٢٠٢٤ - ٢٠٢١", "٢٠٢٣ - ٢٠٢٠", "٢٠٣٠ - ٢٠٣٢", "٢٠٣٣ - ٢٠٣٥"] },
])("locates all reversed and future dates in $language", ({ language, dates }) => {
	const report = analyzePdfResume(makeRawExtraction({ lines: dates, metadata: { language } }), {
		now: new Date("2026-11-19T09:00:00Z"),
	});
	const findings = [...report.findings, ...report.tips];
	expect(findings.find((item) => item.code === "REVERSED_DATE_RANGE")?.evidence?.locations).toHaveLength(2);
	expect(findings.find((item) => item.code === "FUTURE_DATED_ENTRY")?.evidence?.locations).toHaveLength(2);
});

it.each([
	{
		language: "en-US",
		experience: "Experience",
		education: "Education",
		courses: "Courses",
		volunteer: "Volunteering",
	},
	{ language: "ar-SA", experience: "الخبرة", education: "التعليم", courses: "الدورات", volunteer: "التطوع" },
])(
	"uses only experience dates across columns in $language",
	({ language, experience, education, courses, volunteer }) => {
		const makeLines = (older: string) => [
			{ text: education, x: 20, y: 60 },
			{ text: experience, x: 320, y: 60 },
			{ text: "2022 - 2024", x: 20, y: 80 },
			{ text: "2022 - 2024", x: 320, y: 80 },
			{ text: "2008 - 2010", x: 20, y: 100 },
			{ text: older, x: 320, y: 100 },
			{ text: courses, x: 20, y: 120 },
			{ text: "Work details", x: 320, y: 120 },
			{ text: "2014 - 2016", x: 20, y: 140 },
			{ text: "Work details", x: 320, y: 140 },
			{ text: volunteer, x: 320, y: 160 },
			{ text: "2010 - 2012", x: 320, y: 180 },
		];
		const finding = (older: string) =>
			analyzePdfResume(makeRawExtraction({ lines: makeLines(older), metadata: { language } }), {
				now: new Date("2026-11-19"),
			}).tips.find((item) => item.code === "EMPLOYMENT_GAP");
		expect(finding("2020 - 2022")).toBeUndefined();
		const gap = finding("2018 - 2020");
		expect(gap?.evidence?.locations?.map((location) => location.snippet)).toEqual(["2022 - 2024", "2018 - 2020"]);
		expect(gap?.evidence?.locations?.every((location) => location.box.x === 320)).toBe(true);
	},
);

it("does not infer an employment gap without an experience heading", () => {
	const report = analyzePdfResume(makeRawExtraction({ lines: ["Education", "2004 - 2006", "2018 - 2020"] }));
	expect(report.tips.find((item) => item.code === "EMPLOYMENT_GAP")).toBeUndefined();
});
