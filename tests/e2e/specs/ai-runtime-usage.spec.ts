import { Pool } from "pg";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("Start blocks another base while exhausted accounts retain editing and PDF access", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	const session = await (await page.request.get("/api/auth/get-session")).json();
	const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL });
	try {
		// Fixture administration creates an already delivered inventory. Runtime execution is proven by the restricted-PG suite.
		for (let index = 0; index < 5; index++) {
			const operation = `${session.user.id}-delivered-${index}`;
			await pool.query(
				"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,state,result,delivered_at) VALUES ($1,$2,$1,'synthetic','review','[]','{}','synthetic','1','1','succeeded','{\"text\":\"Synthetic result\"}',now())",
				[operation, session.user.id],
			);
			await pool.query(
				"INSERT INTO ai_usage_ledger(id,user_id,operation_id,kind,created_at) VALUES ($1,$3,$4,'reserve',now()-interval '2 years'),($2,$3,$4,'settle',now()-interval '2 years')",
				[`${operation}-reserve`, `${operation}-settle`, session.user.id, operation],
			);
		}
	} finally {
		await pool.end();
	}
	const usage = await page.request.get("/api/openapi/ai/usage");
	await expect(usage).toBeOK();
	expect((await usage.json()).operations).toEqual({ limit: 5, used: 5, reserved: 0, remaining: 0 });
	const second = await page.request.post("/api/openapi/resumes", { data: { name: "Blocked base", tags: [] } });
	expect(second.status()).toBe(412);
	expect(await second.json()).toMatchObject({ data: { reason: "BASE_CV_LIMIT" } });
	expect(await (await page.request.get("/api/openapi/ai/availability")).json()).toEqual({
		state: "not_enabled",
		reason: "NO_APPROVED_ROUTE",
	});
	const denied = await page.request.post("/api/openapi/ai/operations", {
		data: {
			requestKey: "sixth",
			kind: "review",
			sources: [{ kind: "resume", id, revision: "synthetic" }],
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "synthetic",
			parameters: {},
		},
	});
	expect(denied.status()).toBe(412);
	await page.getByLabel("Full name", { exact: true }).fill("Still editable after exhaustion");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Still editable after exhaustion");
	await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeEnabled();
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download PDF", exact: true }).click();
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/ }).click();
	await expect(page.getByRole("dialog")).toContainText("You have reached the limit for base CVs");
	await expect(page.getByRole("radio", { name: "English", exact: true })).toBeVisible();
});
