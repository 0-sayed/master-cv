import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";

export function ownerPolicy(userId: AnyPgColumn) {
	const owns = sql`${userId} = NULLIF(current_setting('app.user_id', true), '')`;
	return pgPolicy("owner_access", { for: "all", using: owns, withCheck: owns });
}

/** Resolve CURRENT_USER at migration time: only the schema owner can discover worker metadata. */
export function discoveryPolicy() {
	return pgPolicy("discovery_owner_read", { for: "select", to: "current_user", using: sql`true` });
}

export function resumeOwnerPolicy(resumeId: AnyPgColumn) {
	const owns = sql`EXISTS (SELECT 1 FROM resume WHERE resume.id = ${resumeId} AND resume.user_id = NULLIF(current_setting('app.user_id', true), ''))`;
	return pgPolicy("owner_access", { for: "all", using: owns, withCheck: owns });
}
