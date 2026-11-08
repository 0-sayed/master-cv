import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { qualificationFixtures } from "./fixtures";
import { validateManifest } from "./manifest";

// Historical evidence only (development set since Round 7): this test never imports a renderer, extractor or qualification runner.
it("preserves the original holdout-2 development evidence and its original sealed bytes", async () => {
	const bytes = await readFile(new URL("./fixtures/holdout-2.json", import.meta.url));
	const cases = validateManifest(JSON.parse(bytes.toString("utf8")));
	const seal = JSON.parse(await readFile(new URL("./fixtures/holdout-2.manifest.json", import.meta.url), "utf8"));
	expect(createHash("sha256").update(bytes).digest("hex")).toBe(seal.sha256);
	expect(cases).toHaveLength(20);
	expect(new Set(cases.map((item) => item.id)).size).toBe(20);
	expect(new Set(cases.map((item) => item.data.basics.name)).size).toBe(20);
	const prior = qualificationFixtures();
	for (const [language, count] of [
		["ar", 8],
		["en", 6],
		["mixed", 6],
	] as const)
		expect(cases.filter((item) => item.language === language)).toHaveLength(count);
	for (const item of cases) {
		expect(item.split).toBe("held-out");
		expect(item.gold.review.status).toBe("draft");
		expect(prior.some((old) => old.id === item.id || old.data.basics.name === item.data.basics.name)).toBe(false);
		expect(item.data.sections.experience.items.length).toBeGreaterThanOrEqual(2);
		expect(item.data.sections.experience.items[0]?.roles.length).toBeGreaterThanOrEqual(2);
		expect(item.gold.fields.some((field) => field.id === "hijri-raw")).toBe(true);
		expect(item.gold.fields.some((field) => field.id === "job-start")).toBe(true);
		const employer = item.gold.associations.find((association) => association.id === "current-employer");
		expect(employer?.fields).toEqual(
			expect.arrayContaining([
				"company",
				"role",
				"promotion",
				"senior-end",
				"junior-role",
				"junior-start",
				"junior-end",
			]),
		);
		expect(item.gold.fields.find((field) => field.id === "role")?.occurrence).toBe(1);
		for (const [before, after] of [
			["company", "role"],
			["role", "promotion"],
			["promotion", "senior-end"],
			["senior-end", "junior-role"],
			["junior-role", "junior-start"],
			["junior-start", "junior-end"],
			["junior-end", "old-company"],
		])
			expect(item.gold.order).toContainEqual([before, after]);
	}
});
