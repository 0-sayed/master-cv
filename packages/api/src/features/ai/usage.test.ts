import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { aiUsageLedger } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { startUsageViewSchema } from "@reactive-resume/schema/ai-usage";
import { withAiRuntime } from "./route-policy";
import { syntheticRuntime } from "./testing/runtime";
import { admitResumeCreation, reserveOperation, settleOperation } from "./usage";

afterEach(() => vi.restoreAllMocks());

it.each([0, 1, 2])("keeps the normal one-base-CV admission limit with %i existing bases", async (used) => {
	const responses: unknown[][] = [[{ dataDeletionRequestedAt: null }], [], [{ used }], []];
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
	if (used === 0)
		await expect(admitResumeCreation(tx, "ordinary-user", { variantKind: "base" })).resolves.toBeUndefined();
	else
		await expect(admitResumeCreation(tx, "ordinary-user", { variantKind: "base" })).rejects.toMatchObject({
			code: "PRECONDITION_FAILED",
			data: { reason: "BASE_CV_LIMIT" },
		});
});

function allowanceTransaction(email: string, emailVerified: boolean, used = 8) {
	const entries: { kind: string; userId?: string; operationId?: string }[] = Array.from(
		{ length: used },
		(_, index) => [
			{ kind: "reserve", operationId: `old-${index}` },
			{ kind: "settle", operationId: `old-${index}` },
		],
	).flat();
	const tx = {
		select: (fields?: Record<string, unknown>) => ({
			from: () => ({
				where: () => {
					const rows = !fields
						? entries.filter((entry) => entry.operationId === "operation")
						: "kind" in fields
							? entries
							: "used" in fields
								? [{ used: 8 }]
								: "email" in fields
									? [{ email, emailVerified, role: "admin" }]
									: [{ dataDeletionRequestedAt: null }];
					return Object.assign(Promise.resolve(rows), { for: async () => rows });
				},
			}),
		}),
		insert: (table: unknown) => ({
			values: async (entry: { kind: string; userId: string; operationId: string }) => {
				expect(table).toBe(aiUsageLedger);
				entries.push(entry);
			},
		}),
	} as unknown as OwnerTransaction;
	return { tx, entries };
}

it.each(["development", "production"])(
	"admits verified admins beyond both AI allowances in %s and keeps the ledger",
	async (mode) => {
		vi.stubEnv("NODE_ENV", mode);
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		const { tx, entries } = allowanceTransaction(" Owner@Example.TEST ", true);
		try {
			await withAiRuntime({ ...syntheticRuntime, localOwnerAllowance: { ownerId: "owner", limit: 1 } }, async () => {
				await expect(admitResumeCreation(tx, "owner", { variantKind: "base" })).resolves.toBeUndefined();
				await reserveOperation(tx, "owner", "operation");
				await reserveOperation(tx, "owner", "operation");
				await settleOperation(tx, "owner", "operation");
				await settleOperation(tx, "owner", "operation");
			});
			expect(entries.filter((entry) => entry.operationId === "operation")).toEqual([
				{ userId: "owner", operationId: "operation", kind: "reserve" },
				{ userId: "owner", operationId: "operation", kind: "settle" },
			]);
		} finally {
			vi.unstubAllEnvs();
		}
	},
);

it.each([
	["other@example.test", true],
	["owner@example.test", false],
])("keeps quotas for %s with verified=%s", async (email, verified) => {
	vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
	const { tx, entries } = allowanceTransaction(email, verified);
	await expect(reserveOperation(tx, "owner", "operation")).rejects.toMatchObject({
		data: { reason: "AI_OPERATIONS_LIMIT" },
	});
	await expect(admitResumeCreation(tx, "owner", { variantKind: "base" })).rejects.toMatchObject({
		data: { reason: "BASE_CV_LIMIT" },
	});
	expect(entries).toHaveLength(16);
});

it.each([
	["development", 1, false],
	["development", 50, true],
	["production", 50, false],
] as const)("preserves the local allowance for ordinary users in %s with limit %i", async (mode, limit, allowed) => {
	vi.stubEnv("NODE_ENV", mode);
	vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue([]);
	const { tx } = allowanceTransaction("ordinary@example.test", true);
	try {
		await withAiRuntime({ ...syntheticRuntime, localOwnerAllowance: { ownerId: "owner", limit } }, async () => {
			const admission = reserveOperation(tx, "owner", "operation");
			if (allowed) await expect(admission).resolves.toBeUndefined();
			else await expect(admission).rejects.toMatchObject({ data: { reason: "AI_OPERATIONS_LIMIT" } });
		});
	} finally {
		vi.unstubAllEnvs();
	}
});

it("represents unlimited usage as JSON-safe nulls while retaining actual counts", () => {
	expect(
		startUsageViewSchema.parse(
			JSON.parse(
				JSON.stringify({
					plan: "start",
					operations: { limit: null, remaining: null, used: 8, reserved: 2 },
					baseCvs: { limit: null, used: 8 },
				}),
			),
		),
	).toMatchObject({ operations: { limit: null, remaining: null, used: 8, reserved: 2 } });
});

it("keeps historical usage readable after an admin returns to ordinary limits", () => {
	expect(
		startUsageViewSchema.parse({
			plan: "start",
			operations: { limit: 5, remaining: 0, used: 8, reserved: 0 },
			baseCvs: { limit: 1, used: 8 },
		}),
	).toMatchObject({ operations: { limit: 5, remaining: 0, used: 8 } });
});

it.each(["language", "job"] as const)(
	"admits extra admin %s copies while checking the owned base",
	async (variantKind) => {
		vi.spyOn(env, "ADMIN_EMAILS", "get").mockReturnValue(["owner@example.test"]);
		for (const owned of [true, false]) {
			const responses = [
				[{ dataDeletionRequestedAt: null }],
				[],
				[{ used: 8 }],
				[{ email: "owner@example.test", emailVerified: true }],
				owned ? [{ id: "root", baseResumeId: null }] : [],
				[{ id: "root" }],
			];
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
			const admission = admitResumeCreation(tx, "owner", { variantKind, baseResumeId: "root" });
			if (owned) await expect(admission).resolves.toBeUndefined();
			else await expect(admission).rejects.toMatchObject({ code: "NOT_FOUND" });
		}
	},
);
