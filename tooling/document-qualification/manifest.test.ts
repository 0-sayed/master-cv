import assert from "node:assert/strict";
import { expect, it } from "vite-plus/test";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { compareQualification } from "./compare";
import { qualificationFixtures } from "./fixtures";
import { validateManifest } from "./manifest";

const item = () => ({
	id: "AR01",
	language: "ar",
	split: "smoke",
	paths: ["export"],
	data: structuredClone(defaultResumeData),
	gold: {
		review: { status: "draft" },
		text: "أحمد",
		fields: [{ id: "name", value: "أحمد" }],
		associations: [],
		order: [],
		forbidden: [],
	},
});

it("asserts the education degree and its repeated end year as critical associated facts", () => {
	for (const input of qualificationFixtures()) {
		const school = input.data.sections.education.items[0];
		assert(school);
		expect(input.gold.fields).toContainEqual({ id: "education-degree", value: school.degree });
		expect(input.gold.fields).toContainEqual({ id: "education-end", value: "2020", occurrence: 1 });
		expect(input.gold.associations.find((group) => group.id === "education")?.fields).toEqual([
			"school",
			"education-start",
			"education-degree",
			"education-end",
		]);
	}
});

it("authors canonical dates and legacy period views before browser persistence comparisons", () => {
	for (const fixture of qualificationFixtures()) expect(fixture.data).toEqual(parseResumeData(fixture.data));
});

it("validates real resume data and rejects duplicate case IDs", () => {
	expect(validateManifest([item()])).toHaveLength(1);
	expect(() => validateManifest([item(), item()])).toThrow(/duplicate/i);
	expect(() => validateManifest([{ ...item(), data: {} }])).toThrow();
});

it("requires gold fields and resolvable associations", () => {
	expect(() => validateManifest([{ ...item(), gold: { ...item().gold, fields: [] } }])).toThrow();
	expect(() =>
		validateManifest([
			{ ...item(), gold: { ...item().gold, associations: [{ id: "job", fields: ["name", "unknown"] }] } },
		]),
	).toThrow(/unknown/i);
});

it("requires a native source when an import path is declared", () => {
	expect(() => validateManifest([{ ...item(), paths: ["import"] }])).toThrow(/native/i);
});

it("requires reviewer identity and date before human review can be claimed", () => {
	expect(() => validateManifest([{ ...item(), gold: { ...item().gold, review: { status: "reviewed" } } }])).toThrow();
});

it("keeps the 50 draft cases, 12 smoke cases and 10 held-out cases explicit", () => {
	const cases = validateManifest(qualificationFixtures());
	expect(cases).toHaveLength(50);
	for (const [language, total, heldOut] of [
		["ar", 20, 4],
		["en", 15, 3],
		["mixed", 15, 3],
	] as const) {
		expect(cases.filter((item) => item.language === language)).toHaveLength(total);
		expect(cases.filter((item) => item.language === language && item.split === "held-out")).toHaveLength(heldOut);
	}
	expect(cases.filter((item) => item.split === "smoke")).toHaveLength(12);
	expect(cases.every((item) => item.gold.review.status === "draft")).toBe(true);
	expect(cases.find((item) => item.id === "AR01")?.data.sections.experience.items).toHaveLength(2);
	expect(
		cases
			.find((item) => item.id === "AR03")
			?.data.sections.projects.items.some((item) => item.dates?.raw?.includes("هـ")),
	).toBe(true);
	expect(cases.find((item) => item.id === "MX04")?.data.sections.experience.items).toHaveLength(2);
});

it("rejects reversed date values within an entry and missing project titles", () => {
	const english = qualificationFixtures().find((input) => input.id === "EN01");
	assert(english);
	for (const [start, end] of [
		["2020", "2022"],
		["2016", "2020"],
	]) {
		const pattern = new RegExp(`${start}([^0-9]+)${end}`);
		const altered = english.gold.text.replace(pattern, (_, separator) => end + separator + start);
		expect(altered).not.toBe(english.gold.text);
		expect(compareQualification(english.gold, altered, "fact-level v2").passed).toBe(false);
	}
	const arabic = qualificationFixtures().find((input) => input.id === "AR03");
	assert(arabic);
	const altered = arabic.gold.text.replace("مشروع التقويم", "").replace("مشروع التاريخ", "");
	expect(compareQualification(arabic.gold, altered, "fact-level v2").passed).toBe(false);
});
