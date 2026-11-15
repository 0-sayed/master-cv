import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { privacyTestDatabase } from "./testing/database";

const database = privacyTestDatabase({ restrictedMigrationOwner: true });
it("upgrades existing restricted credentials while keeping replay and audit tables private", async () => {
	const role = (await database.runtime().query("SELECT current_user AS name")).rows[0].name as string;
	await database.admin().query(`REVOKE ALL ON account_data_export,support_request FROM "${role}"`);
	await database.admin().query(`REVOKE EXECUTE ON FUNCTION master_cv_privacy_queue_owners() FROM "${role}"`);
	await expect(database.queryAs("alice", "SELECT id FROM account_data_export")).rejects.toThrow("permission denied");
	const sql = await readFile(
		new URL("../../../../../migrations/20261115150000_privacy_runtime_recovery/migration.sql", import.meta.url),
		"utf8",
	);
	await database.admin().query(sql.slice(0, sql.indexOf("--> statement-breakpoint")));
	expect((await database.queryAs("alice", "SELECT id FROM account_data_export")).rows).toEqual([]);
	expect((await database.runtime().query("SELECT master_cv_privacy_queue_owners()")).rows).toEqual([]);
	for (const table of ["deletion_replay_record", "support_access_log"])
		await expect(database.runtime().query(`SELECT * FROM ${table}`)).rejects.toThrow("permission denied");
});
