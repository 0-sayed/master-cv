import { expect, it } from "vite-plus/test";
import { requestAccountDeletion } from "./deletion";
import { readDeletionRecords } from "./deletion-records";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
it("recovery projection is restricted, ordered, replayable and survives a new identity with the same email", async () => {
	const session = await syntheticAccountSession(database);
	const request = await database.run(async () =>
		requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
	);
	await expect(database.run(() => readDeletionRecords({ afterSequence: 0, limit: 100 }))).rejects.toThrow();
	const recovery = await database.actor(["master_cv_read_deletion_records(bigint,integer)"]);
	const rows = await recovery.run(() => readDeletionRecords({ afterSequence: 0, limit: 100 }));
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({
		version: 1,
		requestId: request.requestId,
		subjectUserIds: ["alice"],
		stages: { databaseRemoved: false },
	});
	expect(await recovery.run(() => readDeletionRecords({ afterSequence: 0, limit: 100 }))).toEqual(rows);
	expect(await recovery.run(() => readDeletionRecords({ afterSequence: rows[0]?.sequence ?? -1, limit: 100 }))).toEqual(
		[],
	);
	await expect(recovery.pool.query('SELECT * FROM "user"')).rejects.toThrow(/permission denied/);
	await expect(recovery.pool.query("SELECT * FROM deletion_replay_record")).rejects.toThrow(/permission denied/);
	await database.admin().query("UPDATE \"user\" SET email='retired@example.test' WHERE id='alice'");
	await database
		.admin()
		.query(
			"INSERT INTO \"user\"(id,name,email,username,display_username) VALUES ('replacement','Replacement','alice@example.test','replacement','replacement')",
		);
	expect((await recovery.run(() => readDeletionRecords({ afterSequence: 0, limit: 100 })))[0]?.subjectUserIds).toEqual([
		"alice",
	]);
	expect(JSON.stringify(rows)).not.toMatch(/alice@example.test|password|token|recipient/);
});
