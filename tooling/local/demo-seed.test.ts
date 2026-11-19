import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { expect, it } from "vite-plus/test";
import { createDemoJobCopyAdmission, inspectDemoState } from "./demo-seed.ts";

it("accepts an empty workspace and skips only a complete marked workspace", () => {
	expect(inspectDemoState([], [0, 0, 0])).toBe("empty");
	expect(inspectDemoState([{ tags: ["Career portfolio · November 2026 · Calendar"] }], [1, 2, 3])).toBe("complete");
	expect(() => inspectDemoState([{ tags: ["Career portfolio 2026"] }], [1])).toThrow("DEMO_VERSION_REQUIRES_RESET");
	expect(() => inspectDemoState([{ tags: ["Sirawise local demo v2"] }], [1])).toThrow("DEMO_VERSION_REQUIRES_RESET");
	expect(() => inspectDemoState([{ tags: ["Sirawise local demo v1"] }], [1])).toThrow("DEMO_VERSION_REQUIRES_RESET");
});

it("refuses unexpected partial content without attempting population", () => {
	expect(() => inspectDemoState([{ tags: [] }], [1])).toThrow("DEMO_PARTIAL_CONTENT");
	expect(() => inspectDemoState([], [0, 1])).toThrow("DEMO_PARTIAL_CONTENT");
});

it.each([
	"Career portfolio · November 2026",
	"Career portfolio · November 2026 · 2",
	"Career portfolio · November 2026 · Insights",
	"Career portfolio · November 2026 · Showcase",
])("requires explicit reset for the completed older marker %s", (tag) => {
	expect(() => inspectDemoState([{ tags: [tag] }], [1])).toThrow("DEMO_VERSION_REQUIRES_RESET");
});

const environment = {
	DATABASE_URL: "postgresql://runtime:test@127.0.0.1:25532/master_cv",
	APP_URL: "http://127.0.0.1:23100",
	NODE_ENV: "test",
	STORAGE_BACKEND: "local",
};
it("refuses seed admission for another email and a remote database", async () => {
	await expect(createDemoJobCopyAdmission({ id: "other", email: "other@example.test" }, environment)).rejects.toThrow(
		"DEMO_IDENTITY_COLLISION",
	);
	await expect(
		createDemoJobCopyAdmission(
			{ id: "demo", email: "demo@sirawise.test" },
			{ ...environment, DATABASE_URL: "postgresql://runtime:test@remote.test/demo" },
		),
	).rejects.toThrow("DEMO_LOOPBACK_REQUIRED");
});
it("restricts the explicit exception to the reserved owner and job copies", async () => {
	const admission = await createDemoJobCopyAdmission({ id: "demo", email: "demo@sirawise.test" }, environment);
	const tx = {} as OwnerTransaction;
	await expect(admission(tx, "other", { variantKind: "job", baseResumeId: "base" })).rejects.toThrow(
		"DEMO_JOB_COPY_SCOPE_REQUIRED",
	);
	await expect(admission(tx, "demo", { variantKind: "base" })).rejects.toThrow("DEMO_JOB_COPY_SCOPE_REQUIRED");
	await expect(admission(tx, "demo", { variantKind: "language", baseResumeId: "base" })).rejects.toThrow(
		"DEMO_JOB_COPY_SCOPE_REQUIRED",
	);
});
it.each([12, 13])("bounds the demo job-copy exception with %i existing copies", async (copies) => {
	const admission = await createDemoJobCopyAdmission({ id: "demo", email: "demo@sirawise.test" }, environment);
	const responses: unknown[][] = [[{ value: copies }]];
	const tx = {
		select: () => ({
			from: () => ({
				where: () => {
					const rows = responses.shift();
					return Object.assign(Promise.resolve(rows), { for: async () => rows });
				},
			}),
		}),
	} as unknown as OwnerTransaction;
	if (copies === 12)
		await expect(admission(tx, "demo", { variantKind: "job", baseResumeId: "base" })).resolves.toBeUndefined();
	else
		await expect(admission(tx, "demo", { variantKind: "job", baseResumeId: "base" })).rejects.toThrow(
			"DEMO_JOB_COPY_LIMIT",
		);
});
