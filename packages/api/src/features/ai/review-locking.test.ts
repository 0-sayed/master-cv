import type { OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { expect, it } from "vite-plus/test";
import { getTableName } from "drizzle-orm";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { prepareResumeReviewInTransaction } from "./review-sources";

it("finishes review preparation concurrently with profile-first career linking without a lock cycle", async () => {
	// Model the incompatible row locks at the database boundary; execute real review preparation.
	const holders = new Map<string, string>();
	const waiting = new Map<string, string>();
	const wake = new Map<string, () => void>();
	let firstReviewLock: () => void = () => {};
	const reviewStarted = new Promise<void>((resolve) => {
		firstReviewLock = resolve;
	});
	async function lock(owner: string, row: string): Promise<void> {
		if (owner === "review") firstReviewLock();
		const blocker = holders.get(row);
		if (!blocker || blocker === owner) {
			holders.set(row, owner);
			return;
		}
		waiting.set(owner, blocker);
		if (waiting.get(blocker) === owner) throw new Error("LOCK_ORDER_DEADLOCK");
		await new Promise<void>((resolve) => {
			wake.set(owner, resolve);
		});
		waiting.delete(owner);
		await lock(owner, row);
	}
	function release(owner: string) {
		for (const [row, holder] of holders) if (holder === owner) holders.delete(row);
		for (const [waiter, blocker] of waiting)
			if (blocker === owner) {
				wake.get(waiter)?.();
				wake.delete(waiter);
			}
	}
	const data = structuredClone(defaultResumeData);
	data.summary.content = "<p>Built services.</p>";
	const updatedAt = new Date("2026-11-14T00:00:00Z");
	const rows: Record<string, unknown[]> = {
		resume: [{ id: "cv", userId: "alice", data, updatedAt, isLocked: false, trashedAt: null }],
		career_profile: [{ userId: "alice", profileRevision: 1 }],
		resume_fact_link: [
			{
				accepted: 1,
				fact: {
					id: "fact",
					status: "active",
					confirmation: "confirmed",
					revision: 1,
					structured: { section: "summary", field: "content", value: "Built services." },
				},
			},
		],
	};
	const tx = {
		select: () => {
			let table = "";
			const query = {
				from: (value: Parameters<typeof getTableName>[0]) => {
					table = getTableName(value);
					return query;
				},

				where: () =>
					Object.assign(Promise.resolve(rows[table] ?? []), {
						for: async () => {
							await lock("review", table);
							return rows[table] ?? [];
						},
					}),
				innerJoin: () => query,
			};
			return query;
		},
	} as unknown as OwnerTransaction;
	await lock("link", "career_profile");
	const linking = (async () => {
		try {
			await reviewStarted;
			await lock("link", "resume");
			return "linked";
		} finally {
			release("link");
		}
	})();
	const reviewing = prepareResumeReviewInTransaction(tx, "alice", {
		resumeId: "cv",
		expectedUpdatedAt: updatedAt.toISOString(),
		targets: [{ sectionId: "summary", field: "content" }],
	}).finally(() => release("review"));
	const result = await Promise.allSettled([reviewing, linking]);
	expect(result.map((entry) => entry.status)).toEqual(["fulfilled", "fulfilled"]);
	if (result[0]?.status === "fulfilled")
		expect(result[0].value.evidence.map((entry) => entry.id)).toContain("fact-fact");
});
