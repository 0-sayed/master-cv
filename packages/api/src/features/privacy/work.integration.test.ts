import { expect, it } from "vite-plus/test";
import { privacyTestDatabase } from "./testing/database";
import { claimPrivacyWork, completePrivacyWork, retryPrivacyWork } from "./work";
const database = privacyTestDatabase();
it("parallel claims grant one lease and stale lease cannot publish", async () => {
	const id = (
		await database
			.admin()
			.query(
				"INSERT INTO privacy_work(id,user_id,kind,request_id,key) VALUES ('work-one','alice','send_notice','one','one') RETURNING id",
			)
	).rows[0].id;
	const claims = await Promise.all(
		[1, 2].map(() => database.run(() => claimPrivacyWork({ workId: id, kind: "send_notice" }))),
	);
	const claim = claims.find(Boolean);
	if (!claim) throw new Error("Expected a live claim");
	expect(claims.filter(Boolean)).toHaveLength(1);
	await database.admin().query("UPDATE privacy_work SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
	const next = await database.run(() => claimPrivacyWork({ workId: id, kind: "send_notice" }));
	expect(next).not.toBeNull();
	if (!next) throw new Error("Expected replacement lease");
	expect(await database.run(() => completePrivacyWork(claim))).toBe(false);
	expect(await database.run(() => completePrivacyWork(next))).toBe(true);
	expect(
		(await database.admin().query("SELECT payload,lease_token,status FROM privacy_work WHERE id=$1", [id])).rows[0],
	).toEqual({ payload: null, lease_token: null, status: "complete" });
});
it("failure persists safe retry and only current lease may update it", async () => {
	const id = (
		await database
			.admin()
			.query(
				"INSERT INTO privacy_work(id,user_id,kind,request_id,key,payload) VALUES ('work-two','alice','send_notice','two','two','{\"recipient\":\"synthetic@example.test\"}') RETURNING id",
			)
	).rows[0].id;
	const claim = await database.run(() => claimPrivacyWork({ workId: id, kind: "send_notice" }));
	if (!claim) throw new Error("Expected retry claim");
	expect(await database.run(() => retryPrivacyWork(claim, "NOTICE_RETRY_REQUIRED"))).toBe(true);
	const row = (
		await database.admin().query("SELECT status,attempts,failure_code,payload FROM privacy_work WHERE id=$1", [id])
	).rows[0];
	expect(row).toMatchObject({
		status: "retry",
		attempts: 1,
		failure_code: "NOTICE_RETRY_REQUIRED",
		payload: { recipient: "synthetic@example.test" },
	});
	expect(await database.run(() => completePrivacyWork(claim))).toBe(false);
});
