import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { evaluationOutputFolder } from "./output-directory";

type Seal = { studyId: string; version: number; files: Record<string, string>; [key: string]: unknown };
const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function safePath(path: string) {
	if (isAbsolute(path) || path.split(/[\\/]/).some((part) => part === ".." || part.startsWith(".env")))
		throw new Error("UNSAFE_SEAL_PATH");
}
export function buildStudySeal(
	previous: Seal,
	read: (path: string) => Uint8Array,
	reason: string,
	previousFreezeSha256: string,
) {
	if (!reason.trim()) throw new Error("SEAL_REASON_REQUIRED");
	for (const path of Object.keys(previous.files)) safePath(path);
	const files = Object.fromEntries(
		Object.keys(previous.files)
			.sort()
			.map((path) => [path, sha(read(path))]),
	);
	const changedFiles = Object.keys(files).filter((path) => files[path] !== previous.files[path]);
	const hardFactsPath = "packages/api/src/features/ai/hard-facts.ts";
	const hardFactsVersion = Object.hasOwn(files, hardFactsPath)
		? Buffer.from(read(hardFactsPath))
				.toString()
				.match(/export const HARD_FACTS_VERSION = "([^"]+)"/u)?.[1]
		: previous.hardFactsVersion;
	if (Object.hasOwn(files, hardFactsPath) && !hardFactsVersion) throw new Error("SEAL_HARD_FACTS_VERSION_MISSING");
	return {
		...previous,
		version: previous.version + 1,
		studyId: `tasks-v1-personal-career-${sha(JSON.stringify(files)).slice(0, 12)}`,
		date: new Date().toISOString().slice(0, 10),
		files,
		...(hardFactsVersion ? { hardFactsVersion } : {}),
		approvalStatus: "UNAPPROVED",
		previousFreezeSha256,
		changedFiles,
		observedChanges: changedFiles.map((path) => ({
			path,
			beforeSha256: previous.files[path],
			afterSha256: files[path],
		})),
		reason,
		amendment: { reason, qualityEvidenceReused: false, paidRunAuthorized: false },
	};
}

export async function sealStudy(input: { study: "tasks-v1"; reason: string; out: string }) {
	const folder = evaluationOutputFolder({ out: input.out });
	const root = fileURLToPath(new URL("../../../", import.meta.url));
	const path = join(root, "tooling/evaluations/review/tasks-study.json");
	const previousBytes = readFileSync(path);
	const previous = JSON.parse(previousBytes.toString()) as Seal;
	const additions = [
		"tooling/evaluations/review/majority-recovery.test.ts",
		"tooling/evaluations/review/coverage-faults.test.ts",
		"tooling/evaluations/review/fixtures/recorded-coverage-faults.json",
		"tooling/evaluations/review/verifier-protocol.ts",
		"tooling/evaluations/review/recorded-verifier-protocol.json",
		"tooling/evaluations/review/rejection-vote.ts",
		"tooling/evaluations/review/verifier-budget.ts",
		"tooling/evaluations/review/provider-rate-policy.ts",
		"tooling/evaluations/review/retry-reservation.ts",
		"tooling/evaluations/review/verifier-cost-baseline.json",
		"tooling/evaluations/review/rejudging-baseline.json",
		"tooling/evaluations/review/smoke-cohort.ts",
		"tooling/evaluations/review/instrument.ts",
		"tooling/evaluations/review/contracts/interview-prep/question-assessment.ts",
		"tooling/evaluations/review/contracts/verifier/variant-protocol.md",
		"packages/api/src/features/ai/route-policy.ts",
		"tooling/evaluations/review/measured-forecast.ts",
		"tooling/evaluations/review/measured-baseline.json",
		"tooling/evaluations/review/contracts/job-evidence/recorded-honest-outputs.json",
		"tooling/evaluations/review/owner-campaign.sh",
		"tooling/evaluations/review/seal-cli.ts",
		"packages/ai/src/prompts/letter-draft-system.md",
		"packages/ai/src/prompts.ts",
		"packages/schema/src/cover-letter/review.ts",
		"packages/api/src/features/cover-letters/review.ts",
		"packages/api/src/features/cover-letters/review-handler.ts",
	];
	const files = { ...previous.files };
	for (const addition of additions) files[addition] ??= "unsealed";
	const seal = buildStudySeal(
		{ ...previous, files },
		(name) => {
			const target = realpathSync(join(root, name));
			const suffix = relative(root, target);
			if (suffix.startsWith("..") || isAbsolute(suffix)) throw new Error("UNSAFE_SEAL_PATH");
			return readFileSync(target);
		},
		input.reason,
		sha(previousBytes),
	);
	await mkdir(join(folder, "seal-history"), { recursive: true });
	writeFileSync(join(folder, "seal-history", `${sha(previousBytes)}.json`), previousBytes, { flag: "wx" });
	writeFileSync(path, `${JSON.stringify(seal, null, "\t")}\n`);
	const result = { studyId: seal.studyId, sha256: sha(JSON.stringify(seal)), changedFiles: seal.changedFiles };
	writeFileSync(
		join(folder, "seal.json"),
		`${JSON.stringify({ ...result, approvalStatus: "UNAPPROVED", reason: input.reason }, null, 2)}\n`,
	);
	return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: { study: { type: "string" }, reason: { type: "string" }, out: { type: "string", short: "o" } },
	});
	if (values.study !== "tasks-v1" || !values.reason || !values.out)
		throw new Error("Use --study tasks-v1 --reason <reason> -o <archive-directory>");
	await sealStudy({ study: "tasks-v1", reason: values.reason, out: values.out });
}
