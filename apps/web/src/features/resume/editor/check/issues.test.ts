import type { CheckIssue } from "./issues";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { produce } from "immer";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { acceptFix, prepareFix, fixIsValid } from "./fix-preview";
import { buildIssues } from "./issues";
import { getUiLocaleMessages } from "@/libs/locale";

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Missing fixture value");
	return value;
}

const NOW = new Date("2026-09-28T00:00:00Z");

beforeAll(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

function makeResume(mutate: (data: ResumeData) => void = () => undefined): ResumeData {
	return produce(defaultResumeData, (data) => {
		data.basics.name = "Jordan Reyes";
		data.basics.email = "jordan@reyes.design";
		data.basics.phone = "+49 151 2345 6789";
		data.basics.location = "Berlin";
		data.sections.experience.items = [
			{
				id: "kettle",
				hidden: false,
				company: "Studio Kettle",
				position: "Junior Designer",
				location: "Lisbon",
				period: "2016 - 2019",
				website: { url: "", label: "", inlineLink: false },
				description: "<p>Designed identities for small businesses.</p>",
				roles: [],
			} as ResumeData["sections"]["experience"]["items"][number],
		];
		data.metadata.template = "onyx";
		data.metadata.layout.pages = [{ fullWidth: false, main: ["experience"], sidebar: [] }];
		mutate(data);
	});
}

const issuesOf = (data: ResumeData) => buildIssues(lintResumeForAts(data, { now: NOW }), data);

const only = (data: ResumeData, code: string): CheckIssue => {
	const issue = issuesOf(data).find((entry) => entry.finding.code === code);
	if (!issue) throw new Error(`No ${code} issue`);
	return issue;
};

it.each([
	[
		"MISSING_NAME",
		(data: ResumeData) => {
			data.basics.name = "";
		},
		(data: ResumeData) => {
			data.basics.name = "Jordan Reyes";
		},
		{ kind: "header" },
	],
	[
		"MISSING_EMAIL",
		(data: ResumeData) => {
			data.basics.email = "";
		},
		(data: ResumeData) => {
			data.basics.email = "jordan@reyes.design";
		},
		{ kind: "header" },
	],
	[
		"MALFORMED_EMAIL",
		(data: ResumeData) => {
			data.basics.email = "invalid";
		},
		(data: ResumeData) => {
			data.basics.email = "jordan@reyes.design";
		},
		{ kind: "header" },
	],
	[
		"MISSING_PHONE",
		(data: ResumeData) => {
			data.basics.phone = "";
		},
		(data: ResumeData) => {
			data.basics.phone = "+49 151 2345 6789";
		},
		{ kind: "header" },
	],
	[
		"MISSING_LOCATION",
		(data: ResumeData) => {
			data.basics.location = "";
		},
		(data: ResumeData) => {
			data.basics.location = "Berlin";
		},
		{ kind: "header" },
	],
	...["EMPTY_PERIOD", "UNPARSEABLE_PERIOD", "REVERSED_PERIOD", "FUTURE_DATED_PERIOD"].map(
		(code) =>
			[
				code,
				(data: ResumeData) => {
					required(data.sections.experience.items[0]).period =
						(
							{
								EMPTY_PERIOD: "",
								UNPARSEABLE_PERIOD: "unknown",
								REVERSED_PERIOD: "2022 - 2020",
								FUTURE_DATED_PERIOD: "2030 - 2031",
							} as Record<string, string>
						)[code] ?? "";
				},
				(data: ResumeData) => {
					required(data.sections.experience.items[0]).period = "2016 - 2019";
				},
				{ kind: "item", sectionId: "experience", itemId: "kettle" },
			] as const,
	),
	[
		"MISSING_EXPERIENCE_DESCRIPTION",
		(data: ResumeData) => {
			required(data.sections.experience.items[0]).description = "";
		},
		(data: ResumeData) => {
			required(data.sections.experience.items[0]).description = "<p>Designed identities.</p>";
		},
		{ kind: "item", sectionId: "experience", itemId: "kettle" },
	],
	[
		"NO_VISIBLE_EXPERIENCE",
		(data: ResumeData) => {
			data.sections.experience.items = [];
		},
		(data: ResumeData) => {
			data.sections.experience.items = structuredClone(makeResume().sections.experience.items);
		},
		{ kind: "section", sectionId: "experience" },
	],
	[
		"UNPARSEABLE_DATE",
		(data: ResumeData) => {
			data.sections.awards.items = [
				{
					id: "award",
					hidden: false,
					title: "Award",
					awarder: "Organization",
					date: "unknown",
					website: { url: "", label: "", inlineLink: false },
					description: "",
				},
			];
			required(data.metadata.layout.pages[0]).main.push("awards");
		},
		(data: ResumeData) => {
			required(data.sections.awards.items[0]).date = "2020";
		},
		{ kind: "item", sectionId: "awards", itemId: "award" },
	],
] as const)("opens the right field and clears %s after the author corrects it", (code, setup, correct, target) => {
	const data = makeResume(setup);
	const issue = only(data, code);
	expect(issue.fix).toMatchObject({ kind: "write", target });
	expect(issue.target).toEqual(target);
	const corrected = produce(data, correct);
	expect(issuesOf(corrected).map((entry) => entry.finding.code)).not.toContain(code);
});

const automaticCases: { code: string; setup: (data: ResumeData) => void; expected: (data: ResumeData) => void }[] = [
	{
		code: "MALFORMED_URL",
		setup: (data) => {
			data.basics.website.url = "actual.example.test";
		},
		expected: (data) => {
			data.basics.website.url = "https://actual.example.test";
		},
	},
	{
		code: "PICTURE_PRESENT",
		setup: (data) => {
			data.picture.url = "https://example.test/me.png";
			data.picture.hidden = false;
		},
		expected: (data) => {
			data.picture.hidden = true;
		},
	},
	{
		code: "SECTION_MISSING_FROM_LAYOUT",
		setup: (data) => {
			data.metadata.layout.pages = [{ fullWidth: false, main: [], sidebar: [] }];
		},
		expected: (data) => {
			data.metadata.layout.pages = [{ fullWidth: false, main: ["experience"], sidebar: [] }];
		},
	},
	{
		code: "NON_STANDARD_SECTION_TITLE",
		setup: (data) => {
			data.sections.experience.title = "My actual journey";
		},
		expected: (data) => {
			data.sections.experience.title = "Experience";
		},
	},
	{
		code: "MULTI_COLUMN_PROSE_SECTION",
		setup: (data) => {
			data.sections.experience.columns = 2;
		},
		expected: (data) => {
			data.sections.experience.columns = 1;
		},
	},
	{
		code: "PROSE_SECTION_IN_SIDEBAR",
		setup: (data) => {
			data.metadata.layout.pages = [{ fullWidth: false, main: [], sidebar: ["experience"] }];
		},
		expected: (data) => {
			data.metadata.layout.pages = [{ fullWidth: false, main: ["experience"], sidebar: [] }];
		},
	},
	{
		code: "TWO_COLUMN_LAYOUT",
		setup: (data) => {
			data.metadata.template = "azurill";
			data.metadata.layout.pages = [{ fullWidth: false, main: [], sidebar: ["experience"] }];
		},
		expected: (data) => {
			data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
		},
	},
	{
		code: "SMALL_BODY_FONT",
		setup: (data) => {
			data.metadata.typography.body.fontSize = 7;
		},
		expected: (data) => {
			data.metadata.typography.body.fontSize = 9;
		},
	},
	{
		code: "TIGHT_LINE_HEIGHT",
		setup: (data) => {
			data.metadata.typography.body.lineHeight = 1;
		},
		expected: (data) => {
			data.metadata.typography.body.lineHeight = 1.15;
		},
	},
	{
		code: "TIGHT_PAGE_MARGINS",
		setup: (data) => {
			data.metadata.page.marginX = 2;
		},
		expected: (data) => {
			data.metadata.page.marginX = 8;
		},
	},
];

it.each(automaticCases)("previews real values and accepts only the exact $code change", ({ code, setup, expected }) => {
	const data = makeResume(setup);
	const issue = only(data, code);
	if (issue.fix.kind !== "apply") throw new Error("Expected a computed fix");
	const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 0 };
	const preview = prepareFix(identity, data, issue.fix.apply, issue.fix.choice ? [issue.fix.choice] : []);
	expect(preview.before).toEqual(data);
	expect(fixIsValid(preview)).toBe(true);
	expect(
		preview.changes.some((change) => change.after !== null && change.after !== undefined && change.after !== ""),
	).toBe(true);
	const target = structuredClone(data);
	expected(target);
	let accepted: ResumeData | undefined;
	expect(
		acceptFix(preview, identity, data, (after) => {
			accepted = after;
		}),
	).toBe(true);
	expect(accepted).toEqual(target);
	if (!accepted) throw new Error("Fix was not applied");
	expect(issuesOf(accepted).map((entry) => entry.finding.code)).not.toContain(code);
	expect(preview.before).toEqual(data);
});

/** Applies an issue's one-step fix to the data and returns the result. */
function applyFix(data: ResumeData, issue: CheckIssue) {
	if (issue.fix.kind !== "apply") throw new Error(`${issue.finding.code} has no one-step fix`);
	const { apply } = issue.fix;
	return produce(data, (draft) => {
		apply(draft);
	});
}

describe("buildIssues", () => {
	it("numbers open issues in the report's order and places each on its block", () => {
		const data = makeResume((resume) => {
			resume.basics.email = "";
			const entry = resume.sections.experience.items[0];
			if (entry) entry.period = "a while back";
		});
		const issues = issuesOf(data);

		expect(issues.map((issue) => [issue.number, issue.finding.code])).toEqual([
			[1, "MISSING_EMAIL"],
			[2, "UNPARSEABLE_PERIOD"],
		]);
		expect(issues[0]?.target).toEqual({ kind: "header" });
		expect(issues[1]?.target).toEqual({ kind: "item", sectionId: "experience", itemId: "kettle" });
		expect(issues[1]?.category).toBe("dates");
		expect(issues[1]?.fix).toMatchObject({ kind: "write", target: issues[1]?.target });
	});

	it("adds https:// to a link in one step, and sends links with another scheme to Write", () => {
		const bare = makeResume((resume) => (resume.basics.website.url = "reyes.design"));
		const fixed = applyFix(bare, only(bare, "MALFORMED_URL"));
		expect(fixed.basics.website.url).toBe("https://reyes.design");
		expect(issuesOf(fixed).map((issue) => issue.finding.code)).not.toContain("MALFORMED_URL");

		const odd = makeResume((resume) => (resume.basics.website.url = "ftp:/reyes.design"));
		expect(only(odd, "MALFORMED_URL").fix.kind).toBe("write");
	});

	it("switches a two-column page to one column without losing its sidebar sections", () => {
		const data = makeResume((resume) => {
			resume.metadata.template = "azurill";
			resume.sections.skills.items = [
				{ id: "s1", hidden: false, icon: "", iconColor: "", name: "Figma", proficiency: "", level: 0, keywords: [] },
			];
			resume.metadata.layout.pages = [{ fullWidth: false, main: ["experience"], sidebar: ["skills"] }];
		});
		const issue = only(data, "TWO_COLUMN_LAYOUT");
		expect(issue.keepLabel).toBe(true);
		expect(issue.target).toBeNull();

		const fixed = applyFix(data, issue);
		expect(fixed.metadata.layout.pages).toEqual([{ fullWidth: true, main: ["experience", "skills"], sidebar: [] }]);
		expect(issuesOf(fixed)).toEqual([]);
	});
});

it.each([
	["ar-SA", "أضفه إلى الصفحة الأولى", "تمت إضافة"],
	["en-US", "Add it to page 1", "added to page 1"],
] as const)("formats the missing-section page action and confirmation in %s", async (locale, label, confirmation) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const data = makeResume((resume) => {
		resume.metadata.layout.pages = [];
	});
	const issue = only(data, "SECTION_MISSING_FROM_LAYOUT");
	expect(issue.fix.label).toBe(label);
	if (issue.fix.kind !== "apply") throw new Error("Missing apply action");
	expect(issue.fix.done).toContain(confirmation);
	if (locale === "ar-SA") expect(issue.fix.done).toContain("إلى الصفحة الأولى");
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

describe("extracted presentation preserves fixes", () => {
	it("proposes a real non-empty Arabic heading without changing section content", () => {
		const data = makeResume((draft) => {
			draft.metadata.page.locale = "ar-SA";
			draft.sections.experience.title = "قسم إضافي 1";
		});
		const issue = buildIssues(lintResumeForAts(data, { now: NOW }), data).find(
			(item) => item.finding.code === "NON_STANDARD_SECTION_TITLE",
		);
		expect(issue).toBeDefined();
		if (!issue) throw new Error("Expected a heading finding");
		const updated = applyFix(data, issue);
		expect(updated.sections.experience.title).toBe("الخبرة");
		expect(updated.sections.experience.items).toEqual(data.sections.experience.items);
		expect(data.sections.experience.title).toBe("قسم إضافي 1");
	});
	it("hides the photo and fixes every typography finding without replacing author facts", () => {
		const data = makeResume((draft) => {
			draft.picture.url = "https://example.test/photo.png";
			draft.picture.hidden = false;
			draft.metadata.typography.body.fontSize = 1;
			draft.metadata.typography.body.lineHeight = 1;
			draft.metadata.page.marginX = 1;
			draft.metadata.page.marginY = 1;
		});
		const issues = buildIssues(lintResumeForAts(data, { now: NOW }), data);
		let updated = data;
		for (const code of ["PICTURE_PRESENT", "SMALL_BODY_FONT", "TIGHT_LINE_HEIGHT", "TIGHT_PAGE_MARGINS"] as const) {
			const matches = issues.filter((issue) => issue.finding.code === code);
			expect(matches.length).toBeGreaterThan(0);
			for (const issue of matches) updated = applyFix(updated, issue);
		}
		expect(updated.picture.hidden).toBe(true);
		expect(updated.metadata.typography.body.fontSize).toBe(9);
		expect(updated.metadata.typography.body.lineHeight).toBe(1.15);
		expect(updated.metadata.page.marginX).toBe(8);
		expect(updated.metadata.page.marginY).toBe(8);
		expect(updated.basics).toEqual(data.basics);
		expect(updated.sections).toEqual(data.sections);
	});
});

it.each(["ar-SA", "en-US"])("keeps a built-in experience heading aligned with its section in %s", (locale) => {
	const data = makeResume((draft) => {
		draft.metadata.page.locale = locale;
		draft.sections.experience.title = locale === "ar-SA" ? "رحلتي" : "My journey";
		required(draft.sections.experience.items[0]).description = "<p>Training and projects تدريب ومشاريع</p>";
	});
	const issue = only(data, "NON_STANDARD_SECTION_TITLE");
	const updated = applyFix(data, issue);
	expect(updated.sections.experience.title).toBe(locale === "ar-SA" ? "الخبرة" : "Experience");
	expect(issuesOf(updated).some((item) => item.finding.code === "NON_STANDARD_SECTION_TITLE")).toBe(false);
});
