import { expect, it } from "vite-plus/test";
import { buildStudySeal, sealStudy } from "./seal-cli";

it("records the hard-facts version from the bytes that the new seal pins", () => {
	const path = "packages/api/src/features/ai/hard-facts.ts";
	const previous = { studyId: "old", version: 1, files: { [path]: "old" }, hardFactsVersion: "old" };
	const seal = buildStudySeal(
		previous,
		() => Buffer.from('export const HARD_FACTS_VERSION = "new";'),
		"guard correction",
		"old",
	);
	expect(seal.hardFactsVersion).toBe("new");
});

it("rejects an output outside the approved archive before writing a seal", async () => {
	await expect(
		sealStudy({ study: "tasks-v1", reason: "synthetic output denial", out: "/unapproved-output" }),
	).rejects.toThrow("OUTPUT_MUST_BE_EVALUATION_RESULTS");
});

it("binds changed bytes to a new unapproved identity without mutating the previous seal", () => {
	const previous = {
		studyId: "previous",
		version: 31,
		files: { "tooling/source.ts": "stale" },
		approvalStatus: "APPROVED",
	};
	const seal = buildStudySeal(previous, () => new Uint8Array([1, 2, 3]), "owner combined study", "old-byte-hash");
	expect(seal.approvalStatus).toBe("UNAPPROVED");
	expect(seal.previousFreezeSha256).toBe("old-byte-hash");
	expect(seal.changedFiles).toEqual(["tooling/source.ts"]);
	expect(seal.studyId).not.toBe(previous.studyId);
	expect(previous.files["tooling/source.ts"]).toBe("stale");
});
it("rejects secrets and paths outside the repository before reading any bytes", () => {
	for (const path of [".env.local", "nested/.env.test", "../private", "/private"]) {
		let reads = 0;
		expect(() =>
			buildStudySeal(
				{ studyId: "old", version: 1, files: { [path]: "old" } },
				() => {
					reads++;
					return new Uint8Array();
				},
				"reason",
				"hash",
			),
		).toThrow("UNSAFE_SEAL_PATH");
		expect(reads).toBe(0);
	}
});
