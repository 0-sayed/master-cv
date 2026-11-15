import { expect, it } from "vite-plus/test";
import { privacyTestDatabase } from "./testing/database";

const database = privacyTestDatabase();
it("migrates_empty_database_without_local_config", async () => {
	const result = await database.admin().query("SELECT to_regclass('stored_file') AS name");
	expect(result.rows[0].name).toBe("stored_file");
});
it("rejects_cross_owner_privacy_records", async () => {
	await database
		.admin()
		.query(
			"INSERT INTO stored_file(id,user_id,key,purpose,content_type,size,digest) VALUES ('picture','alice','uploads/alice/picture','picture','image/png',3,'digest')",
		);
	expect((await database.queryAs("bob", "SELECT id FROM stored_file")).rows).toEqual([]);
	await expect(
		database.queryAs(
			"bob",
			"INSERT INTO stored_file(id,user_id,key,purpose,content_type,size,digest) VALUES ('forged','alice','uploads/alice/forged','picture','image/png',3,'digest')",
		),
	).rejects.toThrow();
});
it("keeps_replay_after_user_erasure", async () => {
	await database
		.admin()
		.query("INSERT INTO account_deletion(id,subject_user_id,policy_version) VALUES ('request','alice','synthetic-v1')");
	await database
		.admin()
		.query(
			"INSERT INTO deletion_replay_record(request_id,subject_user_ids,storage_scopes,policy_version) VALUES ('request',ARRAY['alice'],ARRAY['uploads/alice/'],'synthetic-v1')",
		);
	await database.admin().query("DELETE FROM \"user\" WHERE id='alice'");
	const result = await database.admin().query("SELECT * FROM deletion_replay_record WHERE request_id='request'");
	expect(result.rowCount).toBe(1);
	expect(JSON.stringify(result.rows)).not.toContain("alice@example.test");
});
it("runtime_cannot_edit_replay_or_audit", async () => {
	for (const table of ["deletion_replay_record", "support_access_log"]) {
		for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
			const result = await database
				.runtime()
				.query("SELECT has_table_privilege(current_user,$1,$2) AS allowed", [table, operation]);
			expect(result.rows[0].allowed, `${operation} ${table}`).toBe(false);
		}
	}
});
it("preserves_append_only_protection", async () => {
	for (const table of ["career_fact_revision", "ai_usage_ledger", "ai_review_decision"]) {
		const result = await database
			.runtime()
			.query("SELECT has_table_privilege(current_user,$1,'UPDATE,DELETE,TRUNCATE') AS allowed", [table]);
		expect(result.rows[0].allowed, table).toBe(false);
	}
	const result = await database
		.runtime()
		.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user");
	expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
});
it("forces_rls_for_every_private_privacy_table", async () => {
	const result = await database
		.admin()
		.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)", [
			["stored_file", "account_action_proof", "privacy_work", "account_data_export", "support_request"],
		]);
	expect(result.rowCount).toBe(5);
	expect(result.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
});
it("replay_history_is_immutable_even_for_schema_owner", async () => {
	await expect(
		database.admin().query("UPDATE deletion_replay_record SET policy_version='changed' WHERE request_id='request'"),
	).rejects.toThrow("IMMUTABLE_PRIVACY_AUDIT");
	await expect(database.admin().query("DELETE FROM deletion_replay_record WHERE request_id='request'")).rejects.toThrow(
		"IMMUTABLE_PRIVACY_AUDIT",
	);
});
it("discovery_has_no_public_execute_and_fixed_search_path", async () => {
	const result = await database
		.admin()
		.query("SELECT prosecdef,proconfig,proacl::text FROM pg_proc WHERE proname='master_cv_privacy_queue_owners'");
	expect(result.rowCount).toBe(1);
	expect(result.rows[0].prosecdef).toBe(true);
	expect(result.rows[0].proconfig).toContain("search_path=pg_catalog, public");
	expect(result.rows[0].proacl).not.toMatch(/[,{]=X\//);
});
