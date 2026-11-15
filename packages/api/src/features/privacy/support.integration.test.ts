import { expect, it, vi } from "vite-plus/test";
import { submitSupportRequest, runSupportWork } from "./support";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
const input = {
	email: "alice@example.test",
	subject: "privacy" as const,
	message: "Synthetic rights question",
	locale: "ar-SA" as const,
	requestNonce: "support-nonce",
};
it("unverified contact is not identity proof and duplicate intake persists one case", async () => {
	const first = await database.run(() => submitSupportRequest(input));
	expect(await database.run(() => submitSupportRequest(input))).toEqual(first);
	expect(
		(await database.admin().query("SELECT user_id,status FROM support_request WHERE id=$1", [first.id])).rows,
	).toEqual([{ user_id: null, status: "received" }]);
	expect(
		(await database.admin().query("SELECT count(*)::int AS count FROM privacy_work WHERE request_id=$1", [first.id]))
			.rows[0].count,
	).toBe(1);
	await expect(database.run(() => submitSupportRequest({ ...input, message: "Different claim" }))).rejects.toThrow(
		"SUPPORT_NONCE_REUSED",
	);
});
it("mail failure retains received case and retries a persisted delivery", async () => {
	const result = await database.run(() => submitSupportRequest({ ...input, requestNonce: "delivery-nonce" }));
	const work = (await database.admin().query("SELECT id FROM privacy_work WHERE request_id=$1", [result.id])).rows[0];
	await database.run(() =>
		runSupportWork({
			workId: work.id,
			deliver: async () => {
				throw new Error("offline");
			},
		}),
	);
	expect(
		(await database.admin().query("SELECT status FROM support_request WHERE id=$1", [result.id])).rows[0].status,
	).toBe("received");
	expect(
		(await database.admin().query("SELECT status,failure_code FROM privacy_work WHERE id=$1", [work.id])).rows[0],
	).toEqual({ status: "retry", failure_code: "SUPPORT_DELIVERY_REQUIRED" });
	await database.admin().query("UPDATE privacy_work SET due_at=now() WHERE id=$1", [work.id]);
	const deliver = vi.fn(async (_item: unknown) => {});
	await database.run(() => runSupportWork({ workId: work.id, deliver }));
	expect(deliver).toHaveBeenCalledOnce();
	expect(deliver.mock.calls[0]?.[0]).toMatchObject({ id: result.id, message: input.message });
});
it("size and header injection are rejected before persistence", async () => {
	for (const change of [
		{ email: "a@example.test\r\nBcc:evil@example.test" },
		{ message: "x".repeat(10001) },
		{ subject: "reset_password" },
		{ message: "   " },
	])
		await expect(database.run(() => submitSupportRequest({ ...input, ...change } as typeof input))).rejects.toThrow();
});
it("runtime cannot browse anonymous cases or call operator audit services", async () => {
	expect((await database.queryAs("bob", "SELECT id FROM support_request")).rows).toEqual([]);
	await expect(
		database.runtime().query("SELECT master_cv_read_support_request('operator','case','investigation')"),
	).rejects.toThrow(/permission denied/);
	expect((await database.admin().query("SELECT count(*)::int AS count FROM support_access_log")).rows[0].count).toBe(0);
});
it("operator reads and dispositions are audited without granting table access", async () => {
	const received = await database.run(() =>
		submitSupportRequest({ ...input, requestNonce: "operator-case", authentication: { userId: "alice" } }),
	);
	const operator = await database.actor([
		"master_cv_read_support_request(text,text,text)",
		"master_cv_support_disposition(text,text,text)",
	]);
	const { readSupportRequest, recordSupportDisposition } = await import("./support");
	const item = await operator.run(() =>
		readSupportRequest({ operatorId: operator.role, requestId: received.id, purpose: "rights request" }),
	);
	expect(item).toMatchObject({ id: received.id, userId: "alice", requestNonce: "operator-case" });
	await operator.run(() =>
		recordSupportDisposition({ operatorId: operator.role, requestId: received.id, disposition: "resolved" }),
	);
	expect(
		(
			await database
				.admin()
				.query("SELECT count(*)::int AS count FROM support_access_log WHERE request_id=$1", [received.id])
		).rows[0].count,
	).toBe(2);
	await expect(operator.pool.query("SELECT * FROM support_request")).rejects.toThrow(/permission denied/);
});
