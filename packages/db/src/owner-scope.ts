import type { Pool } from "pg";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";
export { withDatabaseOwner, withOwnerDatabase, type OwnerTransaction } from "./client";

const privateTables = Object.values(schema)
	.filter((value) => is(value, PgTable))
	.map((table) => getTableConfig(table))
	.filter((config) => config.enableRLS)
	.map((config) => config.name);

/** Runtime credentials must neither bypass RLS nor be able to assume a protected table's owner. */
export async function assertRuntimeDatabaseRole(pool: Pool): Promise<void> {
	const result = await pool.query<{ unsafe: boolean }>(
		`
		SELECT EXISTS (
			SELECT 1 FROM pg_roles r
			WHERE (r.rolsuper OR r.rolbypassrls) AND pg_has_role(current_user, r.oid, 'MEMBER')
		) OR EXISTS (
			SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY($1::text[])
			AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR pg_has_role(current_user,c.relowner,'MEMBER'))
		) OR (
			SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
			WHERE n.nspname='public' AND c.relkind='r' AND c.relname = ANY($1::text[])
		) <> cardinality($1::text[])
		OR has_table_privilege(current_user,'public.career_fact_revision','UPDATE')
		OR has_table_privilege(current_user,'public.career_fact_revision','DELETE')
		AS unsafe
	`,
		[privateTables],
	);
	if (result.rows[0]?.unsafe !== false)
		throw new Error("Unsafe runtime database role: use a restricted non-owner login with forced RLS");
}
