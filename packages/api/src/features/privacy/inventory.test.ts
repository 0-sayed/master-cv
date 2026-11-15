import { expect, it } from "vite-plus/test";
import { pgTable, text } from "drizzle-orm/pg-core";
import * as schema from "@reactive-resume/db/schema";
import { assertPersonalDataInventory } from "./inventory";
it("classifies every checked-out table and column", () => {
	expect(() => assertPersonalDataInventory()).not.toThrow();
});
it("fails closed on an added personal table", () => {
	expect(() => assertPersonalDataInventory({ ...schema, extra: pgTable("extra", { id: text() }) })).toThrow(
		"UNMAPPED_SCHEMA_TABLE",
	);
});
it("fails closed on an added personal column", () => {
	expect(() => assertPersonalDataInventory({ ...schema, user: pgTable("user", { unclassified: text() }) })).toThrow(
		"UNMAPPED_SCHEMA_COLUMN",
	);
});
it("career worker lease credentials are excluded from the archive", async () => {
	const { personalDataInventory } = await import("./inventory");
	expect(personalDataInventory.career_job.exportColumns).not.toContain("lease");
	expect(personalDataInventory.career_job.excludedColumns).toContain("lease");
});
it("email-change approval receipts stay out of account downloads", async () => {
	const { personalDataInventory } = await import("./inventory");
	expect(personalDataInventory.account_email_change.exportColumns).not.toContain("approvedTokenHash");
	expect(personalDataInventory.account_email_change.excludedColumns).toContain("approvedTokenHash");
});
