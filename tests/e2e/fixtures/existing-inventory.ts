import type { Page } from "@playwright/test";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { Pool } from "pg";
import { expect } from "./test";

/** Administer synthetic inventory delivered before Start limits; never changes runtime admission. */
export async function seedExistingResume(page: Page, name: string, data: ResumeData) {
	const session = await page.request.get("/api/auth/get-session");
	await expect(session).toBeOK();
	const { user } = await session.json();
	const id = crypto.randomUUID();
	const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL });
	try {
		await pool.query("INSERT INTO resume(id,user_id,name,slug,data) VALUES ($1,$2,$3,$1,$4)", [
			id,
			user.id,
			name,
			JSON.stringify(data),
		]);
	} finally {
		await pool.end();
	}
	return id;
}
