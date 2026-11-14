import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures/test";
import {
	launchTailoringReview,
	seedTailoringReview,
	seedVariantReview,
	startVariantReview,
	variantClient,
} from "../fixtures/variants";

async function noticeFor(page: Page, text: string | RegExp) {
	const notice = page.locator('[data-slot="alert"]').filter({ hasText: text }).first();
	await expect(notice).toBeVisible();
	await expect(notice).toHaveAttribute("data-variant", /warn|error/);
	await expect(notice.locator('[data-slot="icon"]')).toBeVisible();
	await expect(notice.locator('[data-slot="alert-title"]')).not.toBeEmpty();
	await expect(notice.locator('[data-slot="alert-description"]')).toContainText(text);
	await expect(notice.getByRole("button", { name: /^(Retry|إعادة المحاولة)$/u })).toBeEnabled();
	return notice;
}

test("copy allowance denial keeps the CV, family and operation balance unchanged", async ({ authPage: page }, info) => {
	const { sourceId, original } = await seedTailoringReview(page, info);
	const api = variantClient(page);
	const before = await api.ai.usage.get();
	const family = await api.resume.variants.list({ resumeId: sourceId });
	await page.goto(`/dashboard/resumes/${sourceId}/job`);
	// Select the exact same ad on the original without creating another copy.
	const job = await api.career.jobTargets.save({ role: "Engineer", employer: "", text: "TypeScript required." });
	await api.career.jobTargets.select({
		resumeId: sourceId,
		expectedUpdatedAt: original.updatedAt.toISOString(),
		jobId: job.jobId,
		jobRevision: job.revision,
		expectedSelectionRevision: null,
	});
	await page.reload();
	await page.getByRole("button", { name: "Create tailored copy", exact: true }).click();
	const notice = await noticeFor(
		page,
		"Could not create a copy. Check the included copy allowance and current source. Your CV is unchanged.",
	);
	await notice.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(notice).toHaveCount(0);
	expect(await api.ai.usage.get()).toEqual(before);
	expect(await api.resume.variants.list({ resumeId: sourceId })).toEqual(family);
	expect((await api.resume.getById({ id: sourceId })).data).toEqual(original.data);
});

test("exhausted operation allowance denies a new review without reserving or deducting another operation", async ({
	authPage: page,
}, info) => {
	test.setTimeout(90000);
	const { copyId, original } = await seedTailoringReview(page, info);
	const api = variantClient(page);
	const cv = await api.resume.getById({ id: copyId });
	const selection = (await api.career.jobTargets.evidence({ resumeId: copyId })).selection;
	if (!selection) throw new Error("Expected selected job");
	const prepared = await api.ai.variantReview.prepare({
		kind: "review.tailoring",
		resumeId: copyId,
		expectedUpdatedAt: cv.updatedAt.toISOString(),
		jobId: selection.jobId,
		jobRevision: selection.jobRevision,
		expectedSelectionRevision: selection.revision,
	});
	for (let i = 0; i < 5; i++) await startVariantReview(page, prepared);
	const before = await api.ai.usage.get();
	expect(before.operations).toMatchObject({ used: 5, reserved: 0, remaining: 0 });
	const notice = (await (await page.request.get("/api/openapi/ai/processing-notices")).json())[0];
	const denied = await page.request.post("/api/openapi/ai/operations", {
		data: {
			kind: prepared.kind,
			sources: prepared.sources,
			parameters: prepared.parameters,
			requestKey: crypto.randomUUID(),
			route: notice.route,
			consentVersion: notice.noticeVersion,
		},
	});
	expect(denied.status()).toBe(412);
	await page.goto(`/dashboard/resumes/${copyId}/job`);
	const recovery = await noticeFor(
		page,
		"You have used all your free assistant operations. They do not renew. You can continue editing manually and download a PDF.",
	);
	await recovery.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(recovery).toBeVisible();
	expect(await api.ai.usage.get()).toEqual(before);
	expect((await api.resume.getById({ id: copyId })).data).toEqual(original.data);
});

test("editing the CV after preparing tailoring makes proposals stale and preserves the manual edit", async ({
	authPage: page,
}, info) => {
	const { copyId, sourceId, original } = await seedTailoringReview(page, info);
	const api = variantClient(page);
	await launchTailoringReview(page, copyId);
	await expect(page.locator("[data-proposal-index]")).toHaveCount(3, { timeout: 30000 });
	// A second browser tab performs a genuine editor autosave after preparation.
	const editor = await page.context().newPage();
	await editor.goto(`/builder/${copyId}`);
	await editor.getByLabel("Full name", { exact: true }).fill("Synthetic manual correction");
	await expect
		.poll(async () => (await api.resume.getById({ id: copyId })).data.basics.name)
		.toBe("Synthetic manual correction");
	await editor.close();
	await page.reload();
	const stale = await noticeFor(page, "The source or this copy changed. Keep your work and request a new review.");
	await expect(
		page.locator("[data-proposal-index]").filter({ hasText: "Out of date: the text has changed since." }),
	).toHaveCount(3);
	await expect(page.getByRole("button", { name: "Suggest again", exact: true })).toHaveCount(3);
	await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
	await stale.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(stale).toBeVisible();
	await launchTailoringReview(page, copyId);
	await expect(page.locator("[data-proposal-index]").getByRole("button", { name: "Accept", exact: true })).toHaveCount(
		3,
		{ timeout: 30000 },
	);
	expect((await api.resume.getById({ id: copyId })).data.basics.name).toBe("Synthetic manual correction");
	expect((await api.resume.getById({ id: sourceId })).data).toEqual(original.data);
});

test("partial job evidence has a complete recovery notice and retains the literal result and CV", async ({
	authPage: page,
}, info) => {
	const id = await seedVariantReview(page, info);
	const api = variantClient(page);
	const original = await api.resume.getById({ id });
	await page.goto(`/dashboard/resumes/${id}/job`);
	await page.getByLabel("Job title", { exact: true }).fill("Engineer");
	await page.getByLabel("Job ad", { exact: true }).fill("TypeScript and SAP required");
	await page.getByRole("button", { name: "Compare", exact: true }).click();
	await expect.poll(async () => (await api.career.jobTargets.evidence({ resumeId: id })).literal).not.toBeNull();
	const literal = await api.career.jobTargets.evidence({ resumeId: id });
	await page.getByRole("button", { name: "Review job evidence", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Start review", exact: true }).click();
	const recovery = await noticeFor(
		page,
		"Only part of the job requirement is supported by this CV. Add confirmed information or request a new review.",
	);
	await recovery.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByRole("button", { name: "Add information", exact: true })).toBeEnabled();
	expect((await api.career.jobTargets.evidence({ resumeId: id })).literal).toEqual(literal.literal);
	expect((await api.resume.getById({ id })).data).toEqual(original.data);
});

test("failed tailoring releases its reservation and offers recovery without changing the CV", async ({
	authPage: page,
}, info) => {
	const { copyId, original } = await seedTailoringReview(page, info, "Synthetic provider failure");
	const api = variantClient(page);
	await launchTailoringReview(page, copyId);
	const recovery = await noticeFor(
		page,
		"No review was delivered. No operation was deducted. You can request a new review or keep editing manually.",
	);
	await recovery.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByRole("button", { name: "Review tailored wording", exact: true })).toBeEnabled();
	expect((await api.ai.usage.get()).operations).toMatchObject({ used: 0, reserved: 0 });
	expect((await api.resume.getById({ id: copyId })).data).toEqual(original.data);
});

test("unavailable processing can recover in the browser without a deduction or document mutation", async ({
	authPage: page,
}, info) => {
	const { copyId, original } = await seedTailoringReview(page, info);
	const api = variantClient(page);
	const endpoint = /\/api\/rpc\/ai\/availability(?:\/__batch__)?(?:\?|$)/u;
	await page.route(endpoint, async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		const ready = '"json":{"state":"ready","reason":null}';
		expect(body.split(ready)).toHaveLength(2);
		await route.fulfill({
			response,
			body: body.replace(ready, '"json":{"state":"unavailable","reason":"SYNTHETIC_UNAVAILABLE"}'),
		});
	});
	await page.goto(`/dashboard/resumes/${copyId}/job`);
	const recovery = await noticeFor(
		page,
		"Nothing in your CV changed. No operation was deducted from your allowance. Keep writing yourself and try again later.",
	);
	await page.unroute(endpoint);
	await recovery.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByRole("button", { name: "Review tailored wording", exact: true })).toBeEnabled();
	expect((await api.ai.usage.get()).operations).toMatchObject({ used: 0, reserved: 0 });
	expect((await api.resume.getById({ id: copyId })).data).toEqual(original.data);
});
