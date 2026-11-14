import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { required } from "./required";

// Offline export only: install before any transitive app import can load credentials.
process.loadEnvFile = () => {};
globalThis.fetch = () => Promise.reject(new Error("OFFLINE_OWNER_REVIEW_NETWORK_FORBIDDEN"));
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = "postgresql://synthetic:synthetic@localhost:1/synthetic";
process.env.AUTH_SECRET = "synthetic-offline-owner-review";

const { values } = parseArgs({
	options: {
		fixtures: { type: "string", multiple: true },
		study: { type: "string" },
		"context-file": { type: "string", multiple: true },
		out: { type: "string", short: "o" },
	},
	strict: true,
});
if (!values.out) throw new Error("EXPLICIT_OUTPUT_REQUIRED");
if (values.study && values.study !== "tasks-v1") throw new Error("INVALID_REVIEW_STUDY");
if (values.study && (values.fixtures || values["context-file"])) throw new Error("REVIEW_SCOPE_CONFLICT");
if (!values.study && (!values.fixtures?.length || !values["context-file"]?.length))
	throw new Error("FIXTURES_AND_CONTEXT_REQUIRED");
const out = resolve(values.out);
if ([process.cwd(), resolve(".."), resolve(new URL("../../..", import.meta.url).pathname)].includes(out))
	throw new Error("NON_ROOT_OUTPUT_REQUIRED");

const { loadTaskFixtures, loadTaskReviewContexts, taskReviewItems } = await import("./contracts/fixtures");
const { fixtureHash, loadStudyCases, studyReviewItems } = await import("./study");
const items =
	values.study === "tasks-v1"
		? (studyReviewItems("tasks-v1", loadStudyCases("tasks-v1")) as import("./contracts/fixtures").TaskReviewItem[])
		: taskReviewItems(
				loadTaskFixtures(required(values.fixtures)),
				loadTaskReviewContexts(required(values["context-file"])),
			);
const gated = items.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)));

function fenced(value: unknown): string {
	const body = JSON.stringify(value, null, 2);
	const width = Math.max(3, ...[...body.matchAll(/`+/gu)].map((m) => m[0].length + 1));
	const fence = "`".repeat(width);
	return `${fence}json\n${body}\n${fence}`;
}
const markdown =
	[
		"# Arabic task fixture owner review",
		"Review every listed input, task, prompt, glossary and gold. The template grants no approval; fill reviewer/time and mark both review flags only after review.",
		`Script-gated items: ${gated.length} of ${items.length}. Nominal language labels do not exempt Arabic content.`,
		...gated.map((c) =>
			[
				`## ${c.id}`,
				`Category: ${c.category}; language: ${c.language}; partition: ${c.holdout ? "holdout" : "tuning"}.`,
				`Hash: ${fixtureHash(c)}`,
				"### Input",
				fenced(c.review.input),
				"### Task",
				fenced(c.review.task),
				"### System prompt and versions",
				fenced({
					systemPrompt: c.review.systemPrompt,
					promptVersion: c.review.promptVersion,
					schemaVersion: c.review.schemaVersion,
				}),
				"### Glossary",
				fenced(c.review.glossary),
				"### Gold",
				fenced(c.gold),
				"### Complete fixture (including contract-specific inputs and controls)",
				fenced(c),
			].join("\n\n"),
		),
	].join("\n\n") + "\n";
const template = {
	version: 1,
	reviewer: "",
	reviewedAt: null,
	fixtures: gated.map((c) => ({ id: c.id, hash: fixtureHash(c), sourceReviewed: false, goldReviewed: false })),
};
await mkdir(out, { recursive: true });
await writeFile(join(out, "new-arabic-cases.md"), markdown);
await writeFile(join(out, "owner-review-items.json"), JSON.stringify(items, null, 2) + "\n");
await writeFile(join(out, "owner-approval-template.json"), JSON.stringify(template, null, 2) + "\n");
