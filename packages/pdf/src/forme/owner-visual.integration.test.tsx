import type { ElementInfo } from "@formepdf/core";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { act } from "react";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { templateSchema } from "@reactive-resume/schema/templates";
import { renderResume } from "./render";

const defined = <T,>(value: T | undefined): T => {
	assert(value !== undefined);
	return value;
};
const flatten = (nodes: ElementInfo[]): ElementInfo[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
const fixture = () => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = "داود كمال";
	data.basics.headline = "مهندس برمجيات";
	data.metadata.page.locale = "ar-SA";
	data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
	data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
	data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
	data.sections.experience.items = [
		{
			id: "job",
			hidden: false,
			company: "شركة الأفق",
			position: "",
			period: "",
			description: "",
			location: "",
			website: { url: "", label: "", inlineLink: false },
			roles: [{ id: "role", position: "مهندس وثائق", period: "2020 - 2024", description: "" }],
		},
	];
	return data;
};
it.each(templateSchema.options)("draws a natural RTL date range on the role line: %s", async (template) => {
	const data = fixture();
	data.metadata.template = template;
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const line = nodes.find((n) => n.nodeType === "TextLine" && n.textContent?.includes("2020"));
	expect(line?.textContent?.replace(/[\u2066-\u2069\u00a0]/gu, " ").replace(/\s+/g, " ")).toContain("2024 - 2020");
	expect(line?.textContent).toContain("قئاثو");
});
for (const [period, expected] of [
	["2020 - 2024", /2024 - 2020/u],
	["2016-01 - 2029-05", /05\/2029 - 01\/2016/u],
	// Layout text is painted left-to-right: Arabic label, hyphen, then the start at the right.
	["2015 - حتى الآن", /ىتح - 2015/u],
] as const)
	it.each(templateSchema.options)(
		`keeps natural RTL dates beside an English role (${period}): %s`,
		async (template) => {
			const data = fixture();
			data.metadata.template = template;
			const role = defined(data.sections.experience.items[0]?.roles[0]);
			role.position = "Platform Engineer";
			role.period = period;
			const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
			const lines = flatten(defined(result.layout.pages[0]).elements).filter((n) => n.nodeType === "TextLine");
			const line = defined(lines.find((n) => n.textContent?.includes(role.position)));
			expect(line.textContent?.replace(/[\u2066-\u2069\u00a0]/gu, " ").replace(/\s+/g, " ")).toMatch(expected);
		},
	);
it("truly centers both Azurill identity lines", async () => {
	const data = fixture();
	data.metadata.template = "azurill";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	for (const text of ["لامك دواد", "تايجمرب سدنهم"]) {
		const line = nodes.find((n) => n.nodeType === "TextLine" && n.textContent === text);
		expect(line, text).toBeDefined();
		expect(defined(line).x + defined(line).width / 2).toBeCloseTo(defined(result.layout.pages[0]).width / 2, 0);
	}
});
it("mirrors Azurill timeline markers beside the text", async () => {
	const data = fixture();
	data.metadata.template = "azurill";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const dot = nodes.find((n) => n.width === 9 && n.height === 9);
	const title = nodes.find((n) => n.nodeType === "TextLine" && n.textContent?.includes("قفلأا"));
	expect(dot).toBeDefined();
	expect(title).toBeDefined();
	expect(defined(dot).x).toBeGreaterThan(defined(title).x + defined(title).width);
	const line = defined(nodes.find((n) => n.style.borderWidth.right === 1 && n.height > 9));
	expect(line.style.borderWidth.left).toBe(0);
	expect(line.x + line.width).toBeCloseTo(defined(dot).x + defined(dot).width / 2, 0);
});
it("mirrors Ditgar entry accent on the right", async () => {
	const data = fixture();
	data.metadata.template = "ditgar";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const headers = nodes.filter((n) => n.style.borderWidth.left > 0 || n.style.borderWidth.right > 0);
	expect(headers.length).toBeGreaterThan(0);
	expect(headers.some((n) => n.style.borderWidth.right > 0 && n.style.borderWidth.left === 0)).toBe(true);
});
it("uses the Ditto banner edge when the picture is hidden", async () => {
	const data = fixture();
	data.metadata.template = "ditto";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const line = defined(nodes.find((n) => n.nodeType === "TextLine" && n.textContent === "لامك دواد"));
	expect(line.x + line.width).toBeGreaterThan(defined(result.layout.pages[0]).width - 50);
});
it("keeps the phone value in LTR order inside the RTL contact row", async () => {
	const data = fixture();
	data.metadata.template = "azurill";
	data.basics.phone = "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	expect(nodes.filter((n) => n.nodeType === "TextLine").map((n) => n.textContent)).toContain("+966 50 123 4567");
});
it("mirrors Glalie contact icons to the right of their values", async () => {
	const data = fixture();
	data.metadata.template = "glalie";
	data.metadata.page.hideIcons = false;
	data.basics.phone = "+966 50 123 4567";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const row = defined(
		nodes.find(
			(n) =>
				n.children.some((c) => c.nodeType === "Svg") &&
				flatten(n.children).some((c) => c.textContent === data.basics.phone),
		),
	);
	const icon = defined(row.children.find((c) => c.nodeType === "Svg"));
	const text = defined(
		flatten(row.children).find((c) => c.nodeType === "TextLine" && c.textContent === data.basics.phone),
	);
	expect(icon.x).toBeGreaterThanOrEqual(text.x + text.width);
});
it("preserves upstream Persian English contact text sizes", async () => {
	const data = structuredClone(sampleResumeData);
	data.picture.hidden = true;
	data.metadata.template = "persian";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const lines = flatten(defined(result.layout.pages[0]).elements).filter((n) => n.nodeType === "TextLine");
	const website = defined(lines.find((n) => n.textContent === data.basics.website.label));
	expect(website.style.fontSize).toBe(data.metadata.typography.body.fontSize * 0.875);
});
it("keeps Lapras RTL contacts inside the header beside its photo", async () => {
	const data = structuredClone(sampleResumeData);
	data.picture.url = `data:image/jpeg;base64,${readFileSync(new URL("../../../../apps/web/public/photos/sample-picture.jpg", import.meta.url)).toString("base64")}`;
	data.metadata.template = "lapras";
	data.metadata.page.locale = "ar-SA";
	data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
	data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
	data.basics.name = "داود كمال";
	data.basics.headline = "مطور ألعاب ومتخصص في محركات الألعاب";
	data.basics.location = "الرياض، السعودية";
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const header = defined(nodes.find((n) => n.sourceLocation?.file.endsWith("/header")));
	const lines = flatten(header.children).filter((n) => n.nodeType === "TextLine");
	expect(lines.length).toBeGreaterThan(0);
	for (const line of lines) {
		expect(line.x).toBeGreaterThanOrEqual(data.metadata.page.marginX);
		expect(line.x + line.width).toBeLessThanOrEqual(header.x + header.width + 0.1);
	}
});
it.each(templateSchema.options)("mirrors skill rating decorations beside RTL text: %s", async (template) => {
	const data = fixture();
	data.metadata.template = template;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["skills"], sidebar: [] }];
	data.metadata.design.level = { type: "rectangle", icon: "star" };
	data.sections.skills.items = [
		{ id: "skill", hidden: false, name: "مهارة", proficiency: "", level: 3, keywords: [], icon: "", iconColor: "" },
	];
	const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	const nodes = flatten(defined(result.layout.pages[0]).elements);
	const rating = defined(
		nodes.find((n) => n.children.length === 5 && n.children.every((c) => c.style.borderWidth.top > 0)),
	);
	const active = rating.children.filter((c) => c.style.backgroundColor && c.style.backgroundColor.r < 0.9);
	const inactive = rating.children.filter((c) => !active.includes(c));
	expect(active).toHaveLength(3);
	expect(Math.min(...active.map((c) => c.x))).toBeGreaterThan(Math.max(...inactive.map((c) => c.x)));
	expect(Math.max(...rating.children.map((c) => c.x + c.width))).toBeCloseTo(rating.x + rating.width, 0);
});
