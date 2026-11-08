import type { QualificationCase } from "./types";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { qualificationFixtures } from "./fixtures";
import { sourceGoldText } from "./source-gold";

const numbers = (text: string): string[] =>
	text.replace(/[٠-٩۰-۹]/gu, (c) => String(c.charCodeAt(0) - (c <= "٩" ? 0x660 : 0x6f0))).match(/\d+/gu) ?? [];

it("inventories websites and nested descriptions omitted from the original holdout-2 gold", async () => {
	const cases: QualificationCase[] = JSON.parse(
		await readFile(new URL("./fixtures/holdout-2.json", import.meta.url), "utf8"),
	);
	for (const item of cases) {
		const text = sourceGoldText(item.data);
		expect(text).toContain(item.data.basics.website.label);
		expect(text).toContain("17");
		const inventory = numbers(text);
		for (const number of numbers(item.gold.text)) {
			const i = inventory.indexOf(number);
			expect(i, `${item.id}: ${number}`).toBeGreaterThanOrEqual(0);
			inventory.splice(i, 1);
		}
		expect(inventory.sort(), item.id).toEqual(["2", ...numbers(item.id), "17"].sort());
	}
});

it("counts visible source text exactly, excluding hidden facts, numeric IDs, HTML attributes and link destinations", () => {
	const item = qualificationFixtures().find((x) => x.id === "EN01");
	assert(item);
	const data = item.data;
	data.basics.website = { url: "https://example.test/9898", label: "Portfolio 42" };
	const job = data.sections.experience.items[0];
	assert(job);
	job.id = "metadata-7777";
	job.website = { url: "https://example.test/8888", label: "Company 53", inlineLink: false };
	job.description = '<p data-count="9999">Delivered 24 &amp; &#51; services.</p>';
	job.roles = [
		{ id: "role-6666", position: "Lead 65", period: "2018 – 2019", description: "<p>Checked 75 items.</p>" },
	];
	data.sections.projects.items.push({
		id: "hide",
		hidden: true,
		name: "Hidden 5555",
		period: "",
		description: "",
		website: { url: "", label: "", inlineLink: false },
	});
	const snapshot = structuredClone(data);
	const text = sourceGoldText(data);
	for (const value of ["Portfolio 42", "Company 53", "Delivered 24 & 3 services.", "Lead 65", "Checked 75 items."])
		expect(text).toContain(value);
	for (const value of ["9898", "7777", "8888", "9999", "6666", "5555"]) expect(text).not.toContain(value);
	expect(data).toEqual(snapshot);
	data.sections.experience.hidden = true;
	expect(sourceGoldText(data)).not.toContain("Company 53");
	data.sections.experience.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["skills"], sidebar: [] }];
	expect(sourceGoldText(data)).not.toContain("Company 53");
});

it("preserves inline number joins, separates blocks, and ignores quoted tag attributes", () => {
	const item = qualificationFixtures().find((x) => x.id === "EN01");
	assert(item);
	item.data.summary.content =
		'<p>2<strong>4</strong> services</p><p>3</p><p>5</p><p><a href="https://example.test/?q=>9898">Link 42</a><span style="display:none">Hidden 9898</span><span> 42</span></p>';
	const text = sourceGoldText(item.data);
	expect(text).toContain("24 services 3 5 Link 42 42");
	expect(text).not.toContain("9898");
});

it("inventories certification facts, omitting hidden credentials and URL targets", () => {
	const input = qualificationFixtures().find((x) => x.id === "EN01");
	assert(input);
	input.data.metadata.layout.pages = [{ fullWidth: true, main: ["certifications"], sidebar: [] }];
	const item = {
		id: "certificate",
		hidden: false,
		title: "Source Credential",
		issuer: "Source Institute",
		date: "2032",
		description: "<p>Verified 42 records.</p>",
		website: { url: "https://example.test/9898", label: "Credential 57", inlineLink: false },
	};
	input.data.sections.certifications.items = [item, { ...item, id: "hidden", hidden: true, title: "Hidden 7777" }];
	const text = sourceGoldText(input.data);
	for (const value of ["Source Credential", "Source Institute", "2032", "Verified 42 records.", "Credential 57"])
		expect(text).toContain(value);
	for (const value of ["9898", "7777"]) expect(text).not.toContain(value);
});
