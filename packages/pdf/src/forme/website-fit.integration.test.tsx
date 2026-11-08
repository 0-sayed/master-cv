import type { ElementInfo } from "@formepdf/core";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { act } from "react";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { renderResume } from "./render";
import { NO_WRAP_SOURCE } from "./to-forme";

it("fits the Ditgar website into one line inside its measured box", async () => {
	const data = JSON.parse(await readFile(new URL("./__fixtures__/website-fit.json", import.meta.url), "utf8"));
	const input = { data };
	const result = await act(() => renderResume(forme, { data: parseResumeData(input.data) }));
	if (process.env.ROUND9_LAYOUT_OUTPUT)
		await writeFile(process.env.ROUND9_LAYOUT_OUTPUT, JSON.stringify(result.layout, null, 2));
	const nodes: ElementInfo[] = [];
	const walk = (node: ElementInfo) => {
		if (node.sourceLocation?.file === NO_WRAP_SOURCE && node.nodeType !== "TextLine") nodes.push(node);
		node.children.forEach(walk);
	};
	result.layout.pages.forEach((p) => p.elements.forEach(walk));
	expect(nodes.length).toBeGreaterThan(0);
	expect(
		nodes.some((node) => node.children.map((c) => c.textContent ?? "").join("") === input.data.basics.website.label),
	).toBe(true);
	for (const node of nodes) {
		const lines = node.children.filter((c) => c.nodeType === "TextLine");
		expect(lines).toHaveLength(1);
		expect(lines[0]?.width).toBeLessThanOrEqual(node.width + 0.1);
		expect(node.style.fontSize).toBeGreaterThanOrEqual(7);
	}
});

it("fails honestly when a website cannot fit at a readable size", async () => {
	const data = JSON.parse(await readFile(new URL("./__fixtures__/website-fit.json", import.meta.url), "utf8"));
	const input = { data };
	input.data.basics.website.label = "https://example.test/" + "a".repeat(200) + "/portfolio";
	await expect(act(() => renderResume(forme, { data: parseResumeData(input.data) }))).rejects.toThrow(
		/website.*shorten/iu,
	);
});
