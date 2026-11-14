import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { arabicApproval, fixtureHash } from "./study";

it("owner review lists every gated item with input, task, gold and emits owner-approval-template.json", async () => {
	const dir = await mkdtemp(join(tmpdir(), "owner-review-"));
	try {
		const out = join(dir, "export");
		const fixtures = join(dir, "fixtures.json");
		const contexts = join(dir, "contexts.json");
		const task = {
			category: "translation",
			language: "en",
			holdout: false,
			exploratory: false,
			kind: "task",
			requiresQuestion: false,
			sector: "administration",
			cv: [{ id: "cv-1", section: "experience", text: "Prepared reports. ``` # untrusted heading" }],
			jobAd: { segments: [{ id: "job-1", text: "SAP preferred." }] },
			gold: { direction: "en-ar", text: "أعد التقارير" },
			mutants: [],
		};
		const ids = ["en-to-ar", "glossary-only", "prompt-only"];
		await writeFile(fixtures, JSON.stringify(ids.map((id) => ({ ...task, id }))));
		await writeFile(
			contexts,
			JSON.stringify([
				{
					category: "translation",
					task: "Translate approved facts.",
					systemPrompt: "حافظ على الحقائق",
					promptVersion: "test-v1",
					schemaVersion: "test-schema-v1",
					glossary: { reports: "التقارير" },
				},
			]),
		);
		const result = spawnSync(
			process.execPath,
			[
				"--import",
				"tsx",
				"evaluations/review/owner-review-cli.ts",
				"--fixtures",
				fixtures,
				"--context-file",
				contexts,
				"-o",
				out,
			],
			{ encoding: "utf8" },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("");
		expect((await readdir(out)).sort()).toEqual([
			"new-arabic-cases.md",
			"owner-approval-template.json",
			"owner-review-items.json",
		]);
		const markdown = await readFile(join(out, "new-arabic-cases.md"), "utf8");
		const items = JSON.parse(await readFile(join(out, "owner-review-items.json"), "utf8"));
		const template = JSON.parse(await readFile(join(out, "owner-approval-template.json"), "utf8"));
		for (const id of ids) expect(markdown).toContain(id);
		for (const text of [
			"Input",
			"Task",
			"Gold",
			"Prepared reports.",
			"SAP preferred.",
			"Translate approved facts.",
			"أعد التقارير",
			"حافظ على الحقائق",
			"التقارير",
		])
			expect(markdown).toContain(text);
		expect(items).toHaveLength(3);
		expect(template.fixtures).toEqual(
			items.map((c: { id: string }) => ({
				id: c.id,
				hash: fixtureHash(c),
				sourceReviewed: false,
				goldReviewed: false,
			})),
		);
		expect(template.reviewer).toBe("");
		expect(template.reviewedAt).toBeNull();
		expect(() => arabicApproval([template], items)).toThrow("ARABIC_REVIEW_REQUIRED");
		const approved = {
			...template,
			reviewer: "owner",
			reviewedAt: "2026-11-13T12:00:00.000Z",
			fixtures: template.fixtures.map((f: { id: string; hash: string }) => ({
				...f,
				sourceReviewed: true,
				goldReviewed: true,
			})),
		};
		expect(arabicApproval([approved], items)).toBe("owner");
		const noOutput = spawnSync(
			process.execPath,
			["--import", "tsx", "evaluations/review/owner-review-cli.ts", "--fixtures", fixtures],
			{ encoding: "utf8" },
		);
		expect(noOutput.status).not.toBe(0);
		expect(noOutput.stderr).toContain("EXPLICIT_OUTPUT_REQUIRED");
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
