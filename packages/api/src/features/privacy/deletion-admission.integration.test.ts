import { expect, it } from "vite-plus/test";
import { requireAccountSession } from "@reactive-resume/auth/account-access";
import { requestAccountDeletion } from "./deletion";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
it("proof alone does not delete and separate final consent is mandatory", async () => {
	const session = await syntheticAccountSession(database);
	const proof = await session.proof("delete_account");
	expect(
		(await database.admin().query("SELECT data_deletion_requested_at FROM \"user\" WHERE id='alice'")).rows[0]
			.data_deletion_requested_at,
	).toBeNull();
	await expect(
		database.run(() => requestAccountDeletion({ ...proof, headers: session.headers, confirmed: false as true })),
	).rejects.toThrow("FINAL_CONSENT_REQUIRED");
	expect((await database.admin().query("SELECT id FROM account_deletion")).rowCount).toBe(0);
	const results = await Promise.allSettled(
		[1, 2].map(() =>
			database.run(() => requestAccountDeletion({ ...proof, headers: session.headers, confirmed: true })),
		),
	);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect((await database.admin().query("SELECT id,status FROM account_deletion")).rows).toEqual([
		expect.objectContaining({ status: "requested" }),
	]);
	await expect(database.run(() => requireAccountSession(session.headers))).rejects.toThrow();
	expect((await database.admin().query("SELECT id FROM session WHERE user_id='alice'")).rowCount).toBe(0);
	expect((await database.admin().query("SELECT id FROM account_action_proof WHERE user_id='alice'")).rowCount).toBe(0);
	await expect(
		database.run(() => requestAccountDeletion({ ...proof, headers: session.headers, confirmed: true })),
	).rejects.toThrow();
});
it("failure before acceptance commit leaves the account and proof usable", async () => {
	const session = await syntheticAccountSession(database, "bob");
	const proof = await session.proof("delete_account");
	await database
		.admin()
		.query(
			"CREATE FUNCTION public.reject_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$",
		);
	await database
		.admin()
		.query(
			"CREATE TRIGGER reject_deletion BEFORE INSERT ON account_deletion FOR EACH ROW EXECUTE FUNCTION public.reject_deletion()",
		);
	await expect(
		database.run(() => requestAccountDeletion({ ...proof, headers: session.headers, confirmed: true })),
	).rejects.toThrow();
	expect((await database.run(() => requireAccountSession(session.headers))).userId).toBe("bob");
	expect(
		(
			await database
				.admin()
				.query("SELECT consumed_at FROM account_action_proof WHERE user_id='bob' AND token_hash IS NOT NULL")
		).rows[0].consumed_at,
	).toBeNull();
});
