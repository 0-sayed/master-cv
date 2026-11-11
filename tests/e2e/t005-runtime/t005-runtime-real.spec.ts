import { request as playwrightRequest } from "@playwright/test";
import { Pool } from "pg";
import { createAuthenticatedContext } from "../fixtures/auth";
import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("browser HTTP delivers five retried tasks once each and blocks the sixth", async ({
	authPage: page,
	browser,
}, testInfo) => {
	test.setTimeout(120_000);
	await createSampleResumeFromDashboard(page, testInfo);
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	const user = (await (await page.request.get("/api/auth/get-session")).json()).user;
	const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL });
	try {
		const revision = (
			await pool.query("SELECT updated_at FROM resume WHERE id=$1 AND user_id=$2", [resumeId, user.id])
		).rows[0].updated_at.toISOString();
		await pool.query(
			"INSERT INTO ai_platform_budget(id,route_id,route_revision,window_date,cap_micros,request_cap_micros,concurrency) VALUES ('browser-budget','synthetic','1',(now() AT TIME ZONE 'UTC')::date,100000,10000,2)",
		);
		const route = { routeId: "synthetic", routeRevision: "1", configRevision: "1" };
		// Requests originate in the actual browser with its authenticated cookies.
		const request = async (url: string, data?: unknown) =>
			page.evaluate(
				async ({ url, data }) => {
					const response = await fetch(
						url,
						data === undefined
							? {}
							: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) },
					);
					const text = await response.text();
					return { status: response.status, body: text ? JSON.parse(text) : null };
				},
				{ url, data },
			);
		expect(await request("/api/openapi/ai/availability")).toEqual({
			status: 200,
			body: { state: "ready", reason: null },
		});
		const operation = (requestKey: string) => ({
			requestKey,
			kind: "review",
			sources: [{ kind: "resume", id: resumeId, revision }],
			route,
			consentVersion: "1",
			parameters: {},
		});
		expect(await request("/api/openapi/ai/operations", operation("without-consent"))).toMatchObject({
			status: 412,
			body: { data: { reason: "AI_CONSENT_REQUIRED" } },
		});
		expect(
			(await request("/api/openapi/ai/processing-consent", { route, purpose: "review", noticeVersion: "1" })).status,
		).toBe(200);
		expect(
			(await request("/api/openapi/ai/processing-consent", { route, purpose: "hold", noticeVersion: "1" })).status,
		).toBe(200);
		const cancelled = await request("/api/openapi/ai/operations", { ...operation("cancelled"), kind: "hold" });
		expect(cancelled.status).toBe(200);
		await expect
			.poll(async () => (await request(`/api/openapi/ai/operations/${cancelled.body.id}`)).body.state, {
				intervals: [100],
			})
			.toBe("running");
		expect(["cancel_requested"]).toContain(
			(await request(`/api/openapi/ai/operations/${cancelled.body.id}/cancel`, {})).body.state,
		);
		await expect
			.poll(async () => (await request(`/api/openapi/ai/operations/${cancelled.body.id}`)).body.state)
			.toBe("cancelled");
		expect((await request("/api/openapi/ai/usage")).body.operations.used).toBe(0);
		expect(
			(await request("/api/openapi/ai/processing-consent", { route, purpose: "failure", noticeVersion: "1" })).status,
		).toBe(200);
		const failure = await request("/api/openapi/ai/operations", { ...operation("failure"), kind: "failure" });
		expect(failure.status).toBe(200);
		await expect
			.poll(async () => (await request(`/api/openapi/ai/operations/${failure.body.id}`)).body.state)
			.toBe("failed");
		expect((await request("/api/openapi/ai/usage")).body.operations).toMatchObject({
			used: 0,
			reserved: 0,
			remaining: 5,
		});
		let firstId = "";
		for (let index = 0; index < 5; index++) {
			const input = operation(`browser-${index}`);
			const starts = await Promise.all([
				request("/api/openapi/ai/operations", input),
				request("/api/openapi/ai/operations", input),
			]);
			const started = starts[0];
			expect(starts[1].body.id).toBe(started.body.id);
			expect(started.status).toBe(200);
			const id = started.body.id;
			if (index === 0) firstId = id;
			await expect
				.poll(async () => (await request(`/api/openapi/ai/operations/${id}`)).body.state, { timeout: 25_000 })
				.toBe("waiting_review");
			expect(await request(`/api/openapi/ai/operations/${id}/result`)).toEqual({
				status: 200,
				body: { text: "Synthetic review" },
			});
			expect((await request("/api/openapi/ai/operations", input)).body.id).toBe(id);
			await page.reload();
			expect((await request(`/api/openapi/ai/operations/${id}/result`)).body).toEqual({ text: "Synthetic review" });
		}
		const other = createAccount(testInfo);
		const otherRequest = await playwrightRequest.newContext({ baseURL: String(testInfo.project.use.baseURL) });
		try {
			const otherContext = await createAuthenticatedContext(
				browser,
				otherRequest,
				other,
				String(testInfo.project.use.baseURL),
			);
			try {
				expect((await otherContext.request.get(`/api/openapi/ai/operations/${firstId}/result`)).status()).toBe(404);
			} finally {
				await otherContext.close();
			}
		} finally {
			await otherRequest.dispose();
			await deleteE2EUser(other);
		}
		expect((await request("/api/openapi/ai/usage")).body.operations).toEqual({
			limit: 5,
			used: 5,
			reserved: 0,
			remaining: 0,
		});
		expect(await request("/api/openapi/ai/operations", operation("browser-sixth"))).toMatchObject({
			status: 412,
			body: { data: { reason: "AI_OPERATIONS_LIMIT" } },
		});
		const attempts = await pool.query(
			"SELECT count(*)::int AS count FROM ai_operation_attempt a JOIN ai_operation o ON o.id=a.operation_id WHERE a.user_id=$1 AND o.request_key LIKE 'browser-%'",
			[user.id],
		);
		expect(attempts.rows[0].count).toBe(10);
		await page.getByLabel("Full name", { exact: true }).fill("Editing remains available");
		await expect
			.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json()).data.basics.name)
			.toBe("Editing remains available");
		await page.getByRole("tab", { name: /^Check/ }).click();
		await expect(
			page.getByText(
				"You have used all your free assistant operations. They do not renew. You can continue editing manually and download a PDF.",
				{ exact: true },
			),
		).toBeVisible();
		const download = page.waitForEvent("download");
		await page.getByRole("button", { name: "Download PDF", exact: true }).click();
		expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
		expect((await request("/api/openapi/ai/processing-consent/revoke", { routeId: "synthetic" })).status).toBe(200);
		expect(await request("/api/openapi/ai/operations", operation("revoked"))).toMatchObject({
			status: 412,
			body: { data: { reason: "AI_CONSENT_REQUIRED" } },
		});
	} finally {
		await pool.end();
	}
});
