import type { Gold } from "./types";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { compareQualification } from "./compare";

const source = (value: string, match?: "date" | "mixed-free-text"): Gold => ({
	review: { status: "draft" },
	text: value,
	fields: [{ id: "fact", value, ...(match ? { match } : {}) }],
	associations: [],
	order: [],
	forbidden: [],
});
const compare = (gold: Gold, text: string) => compareQualification(gold, text, "fact-level v2");

describe("D32 fact-level v2", () => {
	it.each(["هـ", "م", "من", "إلى", "حتى", "حالياً", "حتى الآن", "Present"])(
		"ignores only number-adjacent spacing for date label %s",
		(label) => {
			for (const [a, b] of [
				[`1445 ${label}`, `1445${label}`],
				[`${label} 1445`, `${label}1445`],
			] as const) {
				const gold = source(a, "date");
				expect(compare(gold, b).passed).toBe(true);
				expect(compare(source(b, "date"), a).passed).toBe(true);
				expect(compareQualification(gold, b, "strict v1").passed).toBe(false);
			}
		},
	);
	it("requires explicit date fields, preserving other whitespace, labels and digits", () => {
		expect(compare(source("1445 هـ"), "1445هـ").passed).toBe(false);
		for (const observed of ["1446هـ", "1445م", "1445 حتىالآن", "1445 هـجري"])
			expect(compare(source("1445 حتى الآن", "date"), observed).passed).toBe(false);
		expect(compare(source("1445 هـ", "date"), "11445هـ").passed).toBe(false);
		expect(compare(source("2020-2021", "date"), "2021-2020").passed).toBe(false);
	});
	it("matches all mixed free-text words in a contiguous window, preserving multiplicity", () => {
		const gold = source("تحليل البيانات / Python", "mixed-free-text");
		expect(compare(gold, "Python / البيانات تحليل").passed).toBe(true);
		expect(compareQualification(gold, "Python / البيانات تحليل").passed).toBe(false);
		for (const value of ["Python / تحليل", "Python / البيانات تحليلية", "Python / unrelated البيانات تحليل"])
			expect(compare(gold, value).passed).toBe(false);
		expect(compare(source("SQL SQL تحليل", "mixed-free-text"), "SQL تحليل").passed).toBe(false);
		expect(compare(source("تحليل البيانات", "mixed-free-text"), "البيانات تحليل").passed).toBe(false);
	});
	it.each(["name", "company", "role", "school", "phone", "email", "website"])(
		"keeps %s exact and detects a missing fact",
		(id) => {
			const value =
				id === "phone"
					? "+966 55 123 4567"
					: id === "email"
						? "one@example.test"
						: id === "website"
							? "example.test/cv-42"
							: "تحليل Python";
			const gold = source(value);
			const field = gold.fields[0];
			assert(field);
			field.id = id;
			expect(compare(gold, value).passed).toBe(true);
			expect(compare(gold, "").passed).toBe(false);
			expect(
				compare(
					gold,
					value.replace("Python", "Java").replace("4567", "4568").replace("one@", "two@").replace("42", "43"),
				).passed,
			).toBe(false);
			if (value === "تحليل Python") expect(compare(gold, "Python تحليل").passed).toBe(false);
		},
	);
	it("rejects wrong associations with every fact still present", () => {
		const gold: Gold = {
			...source("شركة ألف مهندس 2020-2021 شركة باء مدير 2022-2023"),
			fields: [
				{ id: "a", value: "شركة ألف" },
				{ id: "ra", value: "مهندس" },
				{ id: "da", value: "2020-2021", match: "date" },
				{ id: "b", value: "شركة باء" },
				{ id: "rb", value: "مدير" },
				{ id: "db", value: "2022-2023", match: "date" },
			],
			associations: [
				{ id: "job-a", fields: ["a", "ra", "da"] },
				{ id: "job-b", fields: ["b", "rb", "db"] },
			],
		};
		const result = compare(gold, "شركة ألف مهندس 2022-2023 شركة باء مدير 2020-2021");
		expect(result.missing).toEqual([]);
		expect(result.associationFailures).toEqual(["job-a", "job-b"]);
		expect(result.passed).toBe(false);
	});
	it("allows touching exclusive entry spans while rejecting real overlap", () => {
		const gold: Gold = {
			...source("ألف 2020 Beta 2021"),
			fields: [
				{ id: "a", value: "ألف" },
				{ id: "ad", value: "2020" },
				{ id: "b", value: "Beta" },
				{ id: "bd", value: "2021" },
			],
			associations: [
				{ id: "a", fields: ["a", "ad"] },
				{ id: "b", fields: ["b", "bd"] },
			],
		};
		expect(compare(gold, "ألف 2020Beta 2021").passed).toBe(true);
		expect(compare(gold, "ألف Beta 2020 2021").associationFailures).toEqual(["a", "b"]);
	});
	it("records explicit policy versions and rejects invalid versions", () => {
		expect(compare(source("أحمد"), "أحمد").policy).toBe("fact-level v2");
		expect(compareQualification(source("أحمد"), "أحمد").policy).toBe("strict v1");
	});
	it("allows reader-joined neighbouring script runs without changing field contents", () => {
		expect(compare(source("one@example.test"), "4567one@example.testالرياض").passed).toBe(false); // extra numeric claim still fails
		const gold = source("+966 55 123 4567 one@example.test الرياض");
		gold.fields = [
			{ id: "phone", value: "+966 55 123 4567" },
			{ id: "email", value: "one@example.test" },
		];
		expect(compare(gold, "+966 55 123 4567one@example.testالرياض").passed).toBe(true);
		expect(compare(source("Atlas Analytics الرياض"), "Atlas Analyticsالرياض").passed).toBe(false); // internal whitespace is exact
	});
	it("allows an email followed immediately by the independently asserted international phone", () => {
		const gold = source("one@example.test +966 55 123 4567");
		gold.fields = [
			{ id: "email", value: "one@example.test" },
			{ id: "phone", value: "+966 55 123 4567" },
		];
		expect(compare(gold, "one@example.test+966 55 123 4567").passed).toBe(true);
		expect(compare(gold, "one@example.test+evil +966 55 123 4567").passed).toBe(false);
		expect(compare(source("one@example.test"), "one@example.test+evil").passed).toBe(false);
	});
	it("uses separately asserted neighbouring facts to distinguish reader joins from changed contacts", () => {
		const gold = source("Riyadh one@example.test example.test/cv +966 55 123 4567");
		gold.fields = [
			{ id: "location", value: "Riyadh" },
			{ id: "email", value: "one@example.test" },
			{ id: "website", value: "example.test/cv" },
			{ id: "phone", value: "+966 55 123 4567" },
		];
		expect(compare(gold, "Riyadhone@example.test example.test/cv+966 55 123 4567").passed).toBe(true);
		expect(compare(gold, "Riyadh other+one@example.test example.test/cv+966 55 123 4567").passed).toBe(false);
		expect(compare(gold, "Otherone@example.test Riyadh example.test/cv+966 55 123 4567").passed).toBe(false);
	});
	it("rejects prefixes that change an email local part or website domain", () => {
		for (const [expected, observed] of [
			["one@example.test", "other+one@example.test"],
			["example.test/cv", "evil-example.test/cv"],
			["one@example.test", "other.one@example.test"],
		] as const)
			expect(compare(source(expected), observed).passed).toBe(false);
	});
	it("does not accept a changed name, URL suffix or email domain as an exact fact", () => {
		for (const [expected, observed] of [
			["Ada", "Adam"],
			["أحمد", "أحمدان"],
			["one@example.test", "one@example.test.evil"],
			["example.test/cv", "example.test/cv/other"],
		] as const)
			expect(compare(source(expected), observed).passed).toBe(false);
	});
});

it.each(["2020s", "s2020", "2020هـجري", "عام2020"])("rejects an unasserted alphanumeric join: %s", (text) => {
	expect(compare(source("2020", "date"), text).passed).toBe(false);
});
