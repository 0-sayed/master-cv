import { Pool } from "pg";
import { openWriting, seedReview, startReview } from "../fixtures/reviewable-ai";
import { expect, test } from "../fixtures/test";

test("durable review accepts, reloads and undoes without an extra charge", async ({ authPage: page }, testInfo) => {
	test.setTimeout(90_000);
	const resumeId = await seedReview(page, testInfo);
	await openWriting(page);
	await page.getByRole("button", { name: "Review wording", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await (await page.request.get("/api/openapi/ai/usage")).json()).operations.used).toBe(0);
	await startReview(page);
	const review = page.getByTestId("durable-review");
	await review.getByText("Evidence", { exact: true }).click();
	await expect(review.getByRole("blockquote")).toContainText("Built services.");
	await page.reload();
	await openWriting(page);
	await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
	await review.getByRole("button", { name: "Accept", exact: true }).click();
	await expect(page.locator('.review-wording[data-review-action="accept"]')).toBeVisible();
	await expect(page.locator('[data-slot="preview-edit-highlight"][data-review-action="accept"]')).toBeVisible();
	await expect(review.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
	const saved = async () => await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json();
	await expect.poll(async () => (await saved()).data.summary.content).toBe("<p>Developed services.</p>");
	await page.reload();
	await openWriting(page);
	await review.getByRole("button", { name: "Undo", exact: true }).click();
	await expect.poll(async () => (await saved()).data.summary.content).toBe("<p>Built services.</p>");
	await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
	await review.getByRole("button", { name: "Keep original", exact: true }).click();
	await expect(review.getByText("Rejected", { exact: true })).toBeVisible();
	expect((await (await page.request.get("/api/openapi/ai/usage")).json()).operations).toMatchObject({
		used: 1,
		reserved: 0,
	});
	const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL });
	try {
		expect(
			(await pool.query("SELECT count(*)::int n FROM resume_version WHERE resume_id=$1 AND kind='ai'", [resumeId]))
				.rows[0].n,
		).toBe(2);
		expect(
			(
				await pool.query("SELECT event FROM ai_review_decision WHERE resume_id=$1 ORDER BY created_at", [resumeId])
			).rows.map((row) => row.event),
		).toEqual(["accept", "undo", "reject"]);
	} finally {
		await pool.end();
	}
});

test("reduced motion accepts instantly and shows a temporary static preview acknowledgement", async ({
	authPage: page,
}, info) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	const id = await seedReview(page, info);
	await openWriting(page);
	await startReview(page);
	const review = page.getByTestId("durable-review");
	await review.getByRole("button", { name: "Accept", exact: true }).click();
	const card = page.locator('.review-wording[data-review-action="accept"]');
	await expect(card).toBeVisible();
	expect(await card.locator("del").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
	const highlight = page.locator('[data-slot="preview-edit-highlight"][data-review-action="accept"]');
	await expect(highlight).toBeVisible();
	await expect(highlight).toHaveAttribute("data-motion", "static");
	await expect(highlight).toHaveCSS("animation-name", "none");
	expect((await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.summary.content).toBe(
		"<p>Developed services.</p>",
	);
	await page.screenshot({ path: info.outputPath("reduced-motion-highlight.png") });
	await expect(highlight).toHaveCount(0);
	await review.getByRole("button", { name: "Undo", exact: true }).click();
	const undo = page.locator('[data-slot="preview-edit-highlight"][data-review-action="undo"]');
	await expect(undo).toBeVisible();
	await expect(undo).toHaveCSS("animation-name", "none");
});

test("edited wording and supplied answers preserve cancelled drafts", async ({ authPage: page }, testInfo) => {
	const resumeId = await seedReview(page, testInfo);
	await openWriting(page);
	await startReview(page);
	const review = page.getByTestId("durable-review");
	await review.getByRole("button", { name: "Edit", exact: true }).click();
	let dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox").fill("My exact wording.");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await review.getByRole("button", { name: "Edit", exact: true }).click();
	dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("textbox")).toHaveValue("My exact wording.");
	await dialog.getByRole("button", { name: "Save my wording", exact: true }).click();
	await expect(page.locator('[data-slot="preview-edit-highlight"][data-review-action="accept"]')).toBeVisible();
	await expect(review.getByText("Your wording was saved to this CV.")).toBeVisible();
	await review.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(review.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
	// Answers remain tied to the original CV revision, so use a new review after accepting/undoing.
	await startReview(page);
	await review.getByRole("button", { name: "Add information", exact: true }).click();
	dialog = page.getByRole("dialog");
	await dialog.getByRole("textbox").fill("Reduced build time by 10%.");
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	await review.getByRole("button", { name: "Add information", exact: true }).click();
	await expect(dialog.getByRole("textbox")).toHaveValue("Reduced build time by 10%.");
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	await expect(review.getByRole("button", { name: "Add information", exact: true })).toHaveCount(0);
	expect((await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json()).data.summary.content).toBe(
		"<p>Built services.</p>",
	);
});

test("manual changes make old proposals dismissible without replacing the newer text", async ({
	authPage: page,
}, testInfo) => {
	const resumeId = await seedReview(page, testInfo);
	await openWriting(page);
	await startReview(page);
	const current = await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json();
	current.data.summary.content = "<p>New manual correction.</p>";
	await expect(
		await page.request.put(`/api/openapi/resumes/${resumeId}`, {
			data: { data: current.data, expectedUpdatedAt: current.updatedAt },
		}),
	).toBeOK();
	await page.reload();
	await openWriting(page);
	const review = page.getByTestId("durable-review");
	await expect(review.getByText("Out of date: the text has changed since.")).toBeVisible();
	await expect(review.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
	await review.getByRole("button", { name: "Keep original", exact: true }).click();
	await expect(review.getByText("Rejected", { exact: true })).toBeVisible();
	expect((await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json()).data.summary.content).toBe(
		"<p>New manual correction.</p>",
	);
});

test("semantic failure releases usage and keeps manual editing available", async ({ authPage: page }, testInfo) => {
	const resumeId = await seedReview(page, testInfo);
	const current = await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json();
	const prepared = await (
		await page.request.post("/api/openapi/ai/reviews/prepare", {
			data: { resumeId, expectedUpdatedAt: current.updatedAt, targets: [{ sectionId: "summary", field: "content" }] },
		})
	).json();
	const notice = (await (await page.request.get("/api/openapi/ai/processing-notices")).json())[0];
	await expect(
		await page.request.post("/api/openapi/ai/processing-consent", {
			data: { route: notice.route, noticeVersion: notice.noticeVersion, purpose: "review.wording" },
		}),
	).toBeOK();
	const started = await page.request.post("/api/openapi/ai/operations", {
		data: {
			kind: "review.wording",
			requestKey: crypto.randomUUID(),
			route: notice.route,
			consentVersion: notice.noticeVersion,
			sources: prepared.sources,
			parameters: {
				resumeId,
				targets: [{ sectionId: "summary", field: "content" }],
				action: "custom",
				request: "INVALID_METRIC",
			},
		},
	});
	await expect(started).toBeOK();
	const operation = await started.json();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/ai/operations/${operation.id}`)).json()).state)
		.toBe("failed");
	await page.reload();
	await openWriting(page);
	await expect(
		page.getByText(
			"No review was delivered. No operation was deducted. You can request a new review or keep editing manually.",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Review wording", exact: true })).toBeEnabled();
	expect((await (await page.request.get("/api/openapi/ai/usage")).json()).operations).toMatchObject({
		used: 0,
		reserved: 0,
	});
	expect((await (await page.request.get(`/api/openapi/resumes/${resumeId}`)).json()).data).toEqual(current.data);
});
