import type { TaskCase } from "./contracts/types";
import { expect, it } from "vite-plus/test";
import { parseOptions } from "./config";
import { taskReviewItems } from "./contracts/fixtures";
import { cases } from "./corpus";
import { arabicApproval, arabicApprovalProvenance, fixtureHash } from "./study";

const entry = (c: { id: string }) => ({
	id: c.id,
	hash: fixtureHash(c),
	sourceReviewed: true,
	goldReviewed: true,
});
const approval = (fixtures: ReturnType<typeof entry>[], reviewer = "owner") => ({
	version: 1,
	reviewer,
	reviewedAt: "2026-11-13T12:00:00.000Z",
	fixtures,
});
const task: TaskCase = {
	id: "task-en",
	category: "translation",
	language: "en",
	holdout: false,
	exploratory: false,
	kind: "task",
	requiresQuestion: false,
	sector: "administration",
	cv: [{ id: "cv-1", section: "experience", text: "Prepared reports." }],
	jobAd: null,
	gold: { text: "Prepared reports." },
	mutants: [],
};
const context = {
	category: "translation" as const,
	task: "Translate approved wording.",
	systemPrompt: "Preserve supplied facts.",
	promptVersion: "translation-test-v1",
	schemaVersion: "translation-schema-test-v1",
};

it("old owner approval still valid for core", () => {
	const scoped = cases.filter((c) => !c.exploratory);
	// Recorded results.json from the completed core run, before this task changed approvals.
	const historical = scoped.find((c) => c.id === "r2-t01-wording");
	if (!historical) throw new Error("MISSING_HISTORICAL_FIXTURE");
	expect(fixtureHash(historical)).toBe("de320d642e8a70bb45fd3657475652b5b16e494b95ac284092c4b6a2d0454031");
	const old = approval(scoped.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c))).map(entry));
	expect(arabicApproval(old, scoped)).toBe("owner");
	expect(arabicApproval([old], scoped)).toBe("owner");
	expect(arabicApprovalProvenance([old], scoped)).toEqual([
		{ reviewer: "owner", reviewedAt: old.reviewedAt, fixtures: old.fixtures.map(({ id, hash }) => ({ id, hash })) },
	]);
});

it("any case matching the Arabic script gate requires approval", () => {
	const gated = [
		...taskReviewItems([{ ...task, id: "en-to-ar", gold: { direction: "en-ar", text: "أعد التقارير" } }], [context]),
		...taskReviewItems([{ ...task, id: "glossary-ar" }], [{ ...context, glossary: { reports: "التقارير" } }]),
		...taskReviewItems([{ ...task, id: "prompt-ar" }], [{ ...context, systemPrompt: "حافظ على الحقائق" }]),
		...taskReviewItems([{ ...task, id: "task-ar" }], [{ ...context, task: "ترجم النص" }]),
	];
	for (const item of gated) {
		expect(item.language).toBe("en");
		expect(() => arabicApproval([approval([])], [item])).toThrow("ARABIC_REVIEW_INCOMPLETE");
		expect(arabicApproval([approval([entry(item)])], [item])).toBe("owner");
	}
	const [item] = gated;
	if (!item) throw new Error("MISSING_ITEM");
	expect(() => arabicApproval([approval([entry(task)])], [item])).toThrow("ARABIC_REVIEW_INCOMPLETE");
});

it("merges approval files with reviewer provenance and study-scoped coverage", () => {
	const scoped = cases.filter((c) => !c.exploratory && /\p{Script=Arabic}/u.test(JSON.stringify(c)));
	const entries = scoped.map(entry);
	const first = approval(entries.slice(0, 2), "reviewer-one");
	const second = approval(entries.slice(2), "reviewer-two");
	expect(arabicApproval([first, second], scoped)).toBe("reviewer-one; reviewer-two");
	expect(arabicApprovalProvenance([first, second], scoped)).toEqual([
		{
			reviewer: first.reviewer,
			reviewedAt: first.reviewedAt,
			fixtures: first.fixtures.map(({ id, hash }) => ({ id, hash })),
		},
		{
			reviewer: second.reviewer,
			reviewedAt: second.reviewedAt,
			fixtures: second.fixtures.map(({ id, hash }) => ({ id, hash })),
		},
	]);
	expect(arabicApproval([approval(entries)], scoped.slice(0, 1))).toBe("owner");
	expect(() => arabicApproval([approval(entries.slice(0, 1))], scoped)).toThrow("ARABIC_REVIEW_INCOMPLETE");
	expect(arabicApproval([], [task])).toBe("");
	expect(() => arabicApproval([], scoped)).toThrow("ARABIC_REVIEW_REQUIRED");
	expect(() => arabicApproval([null], scoped)).toThrow("ARABIC_REVIEW_REQUIRED");
});

it("conflicting hashes rejected", () => {
	const fixture = cases[0];
	if (!fixture) throw new Error("MISSING_FIXTURE");
	const original = entry(fixture);
	expect(() => arabicApproval([approval([original]), approval([{ ...original, hash: "changed" }])], [])).toThrow(
		"ARABIC_REVIEW_CONFLICT",
	);
	expect(() => arabicApproval([approval([original, original])], [fixture])).toThrow("ARABIC_REVIEW_INCOMPLETE");
});

it("parses repeated --approval-file without silently choosing a single live approval", () => {
	expect(parseOptions(["--approval-file", "old.json"]).approvalFile).toBe("old.json");
	const parsed = parseOptions(["--approval-file", "old.json", "--approval-file", "tasks.json"]);
	expect(parsed.approvalFiles).toEqual(["old.json", "tasks.json"]);
	// The old live CLI consumes only approvalFile until Task 10 wires up approvalFiles.
	expect(parsed.approvalFile).toBeUndefined();
});
