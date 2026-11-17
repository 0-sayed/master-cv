import { randomBytes } from "node:crypto";
import { Pool } from "pg";

/** Provision only an explicitly selected local synthetic database. Never grants ownership or migration membership. */
export async function provisionRuntimeRole(migrationUrl, role = "master_cv_runtime") {
	const url = new URL(migrationUrl);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
		throw new Error("Local database required");
	if (!/^[a-z][a-z0-9_]{0,62}$/.test(role)) throw new Error("Invalid runtime role name");
	const pool = new Pool({ connectionString: url.toString(), max: 1 });
	const password = randomBytes(32).toString("hex");
	try {
		if ((await pool.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role])).rowCount) {
			throw new Error("Runtime role already exists; preserving its credentials");
		}
		await pool.query("BEGIN");
		await pool.query(
			`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`,
		);
		await pool.query(`GRANT CONNECT ON DATABASE "${url.pathname.slice(1).replaceAll('"', '""')}" TO "${role}"`);
		await pool.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
		await pool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${role}"`);
		await pool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}"`);
		await pool.query(`REVOKE UPDATE,DELETE ON career_fact_revision FROM "${role}"`);
		await pool.query(`REVOKE UPDATE,DELETE,TRUNCATE ON ai_usage_ledger FROM "${role}"`);
		await pool.query(`REVOKE UPDATE,DELETE,TRUNCATE ON ai_review_decision FROM "${role}"`);
		await pool.query(`REVOKE UPDATE,DELETE,TRUNCATE ON cover_letter_proposal_decision FROM "${role}"`);
		await pool.query(`REVOKE UPDATE,TRUNCATE ON ai_import_review_source FROM "${role}"`);
		await pool.query(`REVOKE ALL ON ai_platform_budget FROM "${role}"`);
		await pool.query(`REVOKE DELETE ON ai_operation,ai_operation_attempt FROM "${role}"`);
		await pool.query(`REVOKE ALL ON deletion_replay_record,support_access_log FROM "${role}"`);
		await pool.query(
			`GRANT EXECUTE ON FUNCTION master_cv_submit_support(text,text,text,text,text,text,text),master_cv_support_delivery(text,text) TO "${role}"`,
		);
		await pool.query(
			`GRANT EXECUTE ON FUNCTION master_cv_privacy_trash_owners(timestamptz,integer),master_cv_privacy_work_owner(text) TO "${role}"`,
		);
		await pool.query(`GRANT EXECUTE ON FUNCTION master_cv_append_deletion_record(text,jsonb) TO "${role}"`);
		await pool.query(
			`GRANT EXECUTE ON FUNCTION master_cv_quiesce_deleted_account(text),master_cv_erase_deleted_account(text) TO "${role}"`,
		);
		await pool.query(
			`GRANT EXECUTE ON FUNCTION master_cv_ai_queue_owners(),master_cv_ai_admit_budget(text,bigint,bigint),master_cv_ai_reconcile_budget(text) TO "${role}"`,
		);
		await pool.query(
			`GRANT EXECUTE ON FUNCTION master_cv_queue_owners(),master_cv_privacy_queue_owners() TO "${role}"`,
		);
		await pool.query(`GRANT EXECUTE ON FUNCTION master_cv_stale_agent_owners() TO "${role}"`);
		await pool.query("COMMIT");
		url.username = role;
		url.password = password;
		return url.toString();
	} catch (error) {
		await pool.query("ROLLBACK");
		throw error;
	} finally {
		await pool.end();
	}
}
