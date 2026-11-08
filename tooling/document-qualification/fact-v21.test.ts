import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { compareQualification } from "./compare";
import { expectedDisplayGold } from "./expected-gold";
import { validateManifest } from "./manifest";

const root = new URL("../../", import.meta.url);
const load = async () =>
	validateManifest(
		JSON.parse(
			await readFile(new URL("tooling/document-qualification/fixtures/regressions/holdout-5.json", root), "utf8"),
		),
	);
it("rejects the saved H5-EN-14 terminal project date after Skills, without changing v2/strict", async () => {
	const input = (await load()).find((x) => x.id === "H5-EN-14");
	assert(input);
	const saved = JSON.parse(
		await readFile(new URL("tooling/document-qualification/fixtures/regressions/H5-EN-14.json", root), "utf8"),
	);
	const reader = saved.readers.find((x: { reader: string }) => x.reader === "poppler");
	const before = structuredClone(input);
	for (const policy of ["strict v1", "fact-level v2"] as const)
		expect(compareQualification(input.gold, reader.text, policy).passed).toBe(true);
	const result = compareQualification(expectedDisplayGold(input), reader.text, "fact-level v2.1");
	// Keeping tatweel restores this date fact; its incorrect terminal-entry association still fails.
	expect(result.missing).toEqual([]);
	expect(result.associationFailures).toContain("span:projects:1");
	expect(result.passed).toBe(false);
	expect(input).toEqual(before);
});
it.each(["2016-2017", "2017-2015", "2015"])("rejects corrupted canonical endpoints: %s", async (value) => {
	const input = (await load()).find((x) => x.id === "H5-AR-06");
	assert(input);
	const gold = expectedDisplayGold(input);
	const date = gold.fields.find((x) => x.id === "gregorian-raw");
	assert(date);
	expect(date.value).toBe("2015-2017");
	const isolated = { ...gold, text: "2015-2017", fields: [date], associations: [], order: [], entrySpans: [] };
	expect(compareQualification(isolated, "2015-2017", "fact-level v2.1").passed).toBe(true);
	expect(compareQualification(isolated, value, "fact-level v2.1").passed).toBe(false);
});

it("keeps non-date identity facts exact even if their text equals a source date", async () => {
	const input = (await load()).find((x) => x.id === "H5-AR-06");
	assert(input);
	const date = input.data.sections.projects.items[1]?.period;
	assert(date);
	input.gold.fields.push({ id: "protected-name", value: date });
	const gold = expectedDisplayGold(input);
	expect(gold.fields.find((x) => x.id === "protected-name")?.value).toBe(date);
	expect(gold.fields.find((x) => x.id === "protected-name")?.match).toBeUndefined();
});

it("bounds leading RTL dates without lending them to the previous owner", () => {
	const gold = {
		review: { status: "draft" as const },
		text: "First 2020 Second 2021 Skills",
		fields: [
			{ id: "a", value: "First" },
			{ id: "b", value: "Second" },
			{ id: "da", value: "2020" },
			{ id: "db", value: "2021" },
		],
		associations: [],
		order: [],
		forbidden: [],
		entrySpans: [
			{ id: "first", anchor: "First", dates: ["2020"], next: ["Second", "Skills"] },
			{ id: "second", anchor: "Second", dates: ["2021"], next: ["Skills"] },
		],
	};
	expect(compareQualification(gold, "2020 First 2021 Second Skills", "fact-level v2.1").passed).toBe(true);
	expect(compareQualification(gold, "2021 First 2020 Second Skills", "fact-level v2.1").passed).toBe(false);
	expect(compareQualification(gold, "First Second Skills 2020 2021", "fact-level v2.1").passed).toBe(false);
	const shared = {
		...gold,
		fields: [
			{ id: "a", value: "First" },
			{ id: "b", value: "Second" },
			{ id: "d", value: "2020" },
		],
		text: "First 2020 Second 2020 Skills",
		entrySpans: gold.entrySpans.map((entry) => ({ ...entry, dates: ["2020"] })),
	};
	expect(compareQualification(shared, "First 2020 Second Skills", "fact-level v2.1").passed).toBe(false);
});

it("distinguishes repeated owner titles and rejects a second date moved into the first entry", async () => {
	const { qualificationFixtures } = await import("./fixtures");
	const input = qualificationFixtures().find((x) => x.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["projects", "skills"], sidebar: [] }];
	const base = {
		id: "p1",
		hidden: false,
		name: "Archive",
		period: "2030",
		description: "",
		website: { url: "", label: "", inlineLink: false },
	};
	input.data.sections.projects.items = [base, { ...base, id: "p2", period: "2031" }];
	input.gold = {
		review: { status: "draft" },
		text: "Projects Archive 2030 Archive 2031 Skills",
		fields: [
			{ id: "a", value: "Archive" },
			{ id: "b", value: "Archive", occurrence: 1 },
			{ id: "d1", value: "2030" },
			{ id: "d2", value: "2031" },
		],
		associations: [],
		order: [],
		forbidden: [],
	};
	const gold = expectedDisplayGold(input);
	expect(compareQualification(gold, "Projects Archive 2030 Archive 2031 Skills", "fact-level v2.1").passed).toBe(true);
	expect(compareQualification(gold, "Projects Archive 2030 2031 Archive Skills", "fact-level v2.1").passed).toBe(false);
});
it("accepts repeated date values without borrowing the previous entry's trailing date", () => {
	const gold = {
		review: { status: "draft" as const },
		text: "First 2020 Second 2020 Skills",
		fields: [
			{ id: "a", value: "First" },
			{ id: "b", value: "Second" },
			{ id: "d1", value: "2020" },
			{ id: "d2", value: "2020", occurrence: 1 },
		],
		associations: [],
		order: [],
		forbidden: [],
		entrySpans: [
			{ id: "first", anchor: "First", dates: ["2020"], next: ["Second", "Skills"] },
			{ id: "second", anchor: "Second", dates: ["2020"], next: ["Skills"] },
		],
	};
	expect(compareQualification(gold, "First 2020\nSecond 2020\nSkills", "fact-level v2.1").passed).toBe(true);
});

it("does not find a missing repeated project title beyond the next section heading", async () => {
	const { qualificationFixtures } = await import("./fixtures");
	const input = qualificationFixtures().find((x) => x.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["projects", "skills"], sidebar: [] }];
	const base = {
		id: "p1",
		hidden: false,
		name: "Archive",
		period: "2030",
		description: "",
		website: { url: "", label: "", inlineLink: false },
	};
	input.data.sections.projects.items = [base, { ...base, id: "p2", period: "2031" }];
	input.gold = {
		review: { status: "draft" },
		text: "Projects Archive 2030 Archive 2031 Skills",
		fields: [
			{ id: "a", value: "Archive" },
			{ id: "b", value: "Archive", occurrence: 1 },
			{ id: "d1", value: "2030" },
			{ id: "d2", value: "2031" },
		],
		associations: [],
		order: [],
		forbidden: [],
	};
	expect(
		compareQualification(expectedDisplayGold(input), "Projects Archive 2030 Skills Archive 2031", "fact-level v2.1")
			.passed,
	).toBe(false);
});

it("binds nested-role dates separately even when legacy gold has no role-order constraints", async () => {
	const { qualificationFixtures } = await import("./fixtures");
	const input = qualificationFixtures().find((x) => x.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["experience", "skills"], sidebar: [] }];
	const job = input.data.sections.experience.items[0];
	assert(job);
	job.company = "Employer";
	job.period = "2018-2022";
	job.roles = [
		{ id: "a", position: "RoleA", period: "2020", description: "" },
		{ id: "b", position: "RoleB", period: "2021", description: "" },
	];
	input.gold = {
		review: { status: "draft" },
		text: "Experience Employer 2018-2022 RoleA 2020 RoleB 2021 Skills",
		fields: [
			{ id: "employer", value: "Employer" },
			{ id: "a", value: "RoleA" },
			{ id: "b", value: "RoleB" },
			{ id: "d1", value: "2020" },
			{ id: "d2", value: "2021" },
		],
		associations: [],
		order: [],
		forbidden: [],
	};
	const gold = expectedDisplayGold(input);
	expect(
		compareQualification(gold, "Experience Employer 2018-2022 RoleA 2020 RoleB 2021 Skills", "fact-level v2.1").passed,
	).toBe(true);
	expect(
		compareQualification(gold, "Experience Employer 2018-2022 RoleA 2021 RoleB 2020 Skills", "fact-level v2.1").passed,
	).toBe(false);
});

it("recognizes template uppercase section headings while keeping owner identity case exact", () => {
	const gold = {
		review: { status: "draft" as const },
		text: "Projects Archive 2030 Skills",
		fields: [
			{ id: "project", value: "Archive" },
			{ id: "date", value: "2030" },
		],
		associations: [],
		order: [],
		forbidden: [],
		entrySpans: [
			{
				id: "project",
				anchor: "Archive",
				dates: ["2030"],
				next: ["Skills"],
				section: "Projects",
				headings: ["Projects", "Skills"],
			},
		],
	};
	expect(compareQualification(gold, "PROJECTS Archive 2030 SKILLS", "fact-level v2.1").passed).toBe(true);
	expect(compareQualification(gold, "P R O J E C T S Archive 2030 S K I L L S", "fact-level v2.1").passed).toBe(true);
	expect(compareQualification(gold, "P R O J E C T S Archive S K I L L S 2030", "fact-level v2.1").passed).toBe(false);
	expect(compareQualification(gold, "PROJECTS ARCHIVE 2030 SKILLS", "fact-level v2.1").passed).toBe(false);
	expect(compareQualification(gold, "PROJECTS Archive SKILLS 2030", "fact-level v2.1").passed).toBe(false);
});

it("D33 derives mark-free names and Western digits without mutating source gold", async () => {
	const input = (await load())[0];
	assert(input);
	input.gold.fields.push({ id: "d33-name", value: "أَحْمَدُ ١٢ ۳۴ ـٰ" });
	const before = structuredClone(input);
	const gold = expectedDisplayGold(input);
	expect(gold.fields.find((field) => field.id === "d33-name")?.value).toBe("أحمد 12 34 ـ");
	expect(input).toEqual(before);
});

it("retains an undated employer as the anchor of its dated nested role", async () => {
	const { qualificationFixtures } = await import("./fixtures");
	const input = qualificationFixtures().find((x) => x.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
	const job = input.data.sections.experience.items[0];
	assert(job);
	input.data.sections.experience.items = [job];
	job.company = "Employer";
	job.period = "";
	job.roles = [{ id: "role", position: "Engineer", period: "2020", description: "" }];
	input.gold = {
		review: { status: "draft" },
		text: "Experience Employer Engineer 2020",
		fields: [{ id: "date", value: "2020" }],
		associations: [],
		order: [],
		forbidden: [],
	};
	const gold = expectedDisplayGold(input);
	expect(gold.entrySpans?.map((entry) => entry.id)).toEqual(["span:experience:0", "span:experience:0:role:0"]);
	expect(compareQualification(gold, input.gold.text, "fact-level v2.1").passed).toBe(true);
});
it("cannot borrow a missing nested role and date from the next employer", () => {
	const gold = {
		review: { status: "draft" as const },
		text: "Experience Alpha Engineer 2020 Beta Engineer 2020 Skills",
		fields: [
			{ id: "a", value: "Alpha" },
			{ id: "b", value: "Beta" },
			{ id: "role", value: "Engineer" },
			{ id: "date", value: "2020" },
		],
		associations: [],
		order: [] as [string, string][],
		forbidden: [],
		entrySpans: [
			{ id: "a", anchor: "Alpha", dates: [], next: ["Beta", "Skills"] },
			{ id: "ar", anchor: "Engineer", dates: ["2020"], after: "a", next: ["Beta", "Skills"] },
			{ id: "b", anchor: "Beta", dates: [], next: ["Skills"] },
			{ id: "br", anchor: "Engineer", dates: ["2020"], after: "b", next: ["Skills"] },
		],
	};
	const result = compareQualification(gold, "Experience Alpha Beta Engineer 2020 Skills", "fact-level v2.1");
	expect(result.associationFailures).toContain("ar");
	expect(compareQualification(gold, gold.text, "fact-level v2.1").passed).toBe(true);
});

it("retains a following undated employer as a nested-role boundary", async () => {
	const { qualificationFixtures } = await import("./fixtures");
	const input = qualificationFixtures().find((item) => item.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
	const job = input.data.sections.experience.items[0];
	assert(job);
	input.data.sections.experience.items = [
		{
			...job,
			company: "Alpha",
			period: "",
			roles: [{ id: "role", position: "Engineer", period: "2020", description: "" }],
		},
		{ ...job, id: "beta", company: "Beta", period: "", roles: [] },
	];
	input.gold = {
		review: { status: "draft" },
		text: "Experience Alpha Engineer 2020 Beta",
		fields: [{ id: "date", value: "2020" }],
		associations: [],
		order: [],
		forbidden: [],
	};
	const gold = expectedDisplayGold(input);
	expect(compareQualification(gold, input.gold.text, "fact-level v2.1").passed).toBe(true);
	expect(
		compareQualification(gold, "Experience Alpha Beta Engineer 2020", "fact-level v2.1").associationFailures,
	).toContain("span:experience:0:role:0");
});
