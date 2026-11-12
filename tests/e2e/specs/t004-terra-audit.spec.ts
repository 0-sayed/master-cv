import { openPdfReview } from "../fixtures/import-review";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("opening saved copy after conflict keeps the remote version across reload", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.reload();
	const url = page.url();
	const second = await page.context().newPage();
	await second.goto(url);
	await expect(second.getByLabel("Full name", { exact: true })).toBeVisible();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let arrived!: () => void;
	const started = new Promise<void>((resolve) => {
		arrived = resolve;
	});
	await page.route("**/api/rpc/resume/update", async (route) => {
		arrived();
		await held;
		await route.continue();
	});
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic local conflict");
	await started;
	await second.getByLabel("Full name", { exact: true }).fill("Synthetic saved conflict");
	const id = new URL(url).pathname.split("/").at(-1);
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Synthetic saved conflict");
	release();
	await page.getByRole("button", { name: "Open saved copy", exact: true }).click();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Synthetic saved conflict");
	await page.unroute("**/api/rpc/resume/update");
	await page.reload();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Synthetic saved conflict");
	await expect(page.getByText("Unsaved changes on this device", { exact: true })).not.toBeVisible();
	await second.close();
});

test("unresolved local recovery blocks editor changes until a choice", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.reload();
	await page.route("**/api/rpc/resume/update", (route) => route.abort("failed"));
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic recovery choice");
	await expect(page.getByRole("status").filter({ hasText: "Not saved" })).toBeVisible();
	await page.unroute("**/api/rpc/resume/update");
	await page.reload();
	await expect(page.getByText("Unsaved changes on this device", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Full name", { exact: true })).not.toBeVisible();
	await page.getByRole("button", { name: "Restore local changes", exact: true }).click();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Synthetic recovery choice");
});

test("an already open export sheet cannot download after a conflicting save", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.reload();
	const url = page.url();
	const id = new URL(url).pathname.split("/").at(-1);
	const second = await page.context().newPage();
	await second.goto(url);
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let arrived!: () => void;
	const started = new Promise<void>((resolve) => {
		arrived = resolve;
	});
	await page.route("**/api/rpc/resume/update", async (route) => {
		arrived();
		await held;
		await route.continue();
	});
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic local export conflict");
	await started;
	await page.getByRole("button", { name: "More download formats", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Export and history" });
	await expect(sheet).toBeVisible();
	await second.getByLabel("Full name", { exact: true }).fill("Synthetic remote export conflict");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Synthetic remote export conflict");
	release();
	await expect(page.getByRole("button", { name: "Save my edits as a new copy", exact: true })).toBeVisible();
	await expect(sheet.getByRole("button", { name: /download/i })).toBeDisabled();
	await second.close();
});

test("Word is unavailable and mobile history saves and restores a version", async ({ authPage: page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await createSampleResumeFromDashboard(page, testInfo);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	const initial = (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name;
	await page.getByRole("button", { name: "Download PDF", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Export and history" });
	await expect(sheet.getByRole("radio", { name: /Word/ })).toBeDisabled();
	await expect(sheet.getByText(/Not available yet/)).toBeVisible();
	await sheet.getByRole("tab", { name: "History", exact: true }).click();
	await sheet.getByRole("textbox", { name: "Name this version", exact: true }).fill("Mobile original");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sheet.getByRole("button", { name: /^Mobile original/ })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic mobile edit");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Synthetic mobile edit");
	await page.getByRole("button", { name: "Download PDF", exact: true }).click();
	await sheet.getByRole("tab", { name: "History", exact: true }).click();
	await sheet.getByRole("button", { name: /^Mobile original/ }).click();
	await sheet.getByRole("button", { name: "Restore this version", exact: true }).click();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe(initial);
});

test("dismissed delayed confirmation cannot close or navigate a reopened review", async ({ authPage: page }) => {
	await openPdfReview(page);
	await page.getByLabel("Full name", { exact: true }).fill("Old dismissed review");
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let arrived!: () => void;
	const started = new Promise<void>((resolve) => {
		arrived = resolve;
	});
	await page.route("**/api/rpc/resume/confirmImport", async (route) => {
		const response = await route.fetch();
		arrived();
		await held;
		await route.fulfill({ response }).catch(() => {});
	});
	await page.getByRole("button", { name: "Create CV and open editor", exact: true }).click();
	await started;
	await openPdfReview(page);
	await page.getByLabel("Full name", { exact: true }).fill("New active review");
	release();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("New active review");
	await expect(page).toHaveURL(/\/dashboard\/import\//);
	await expect(page.getByRole("button", { name: "Create CV and open editor", exact: true })).toBeVisible();
});

test("stale master reconciliation preserves local review corrections", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add skill", exact: true }).click();
	await page.locator('input[name="name"]').fill("Original confirmed skill");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	await openPdfReview(page);
	await page.getByRole("button", { name: "Use confirmed career information", exact: true }).click();
	await expect(
		page.getByRole("navigation", { name: "Review sections" }).getByRole("button", { name: "Skills", exact: true }),
	).toBeVisible();
	await page.getByLabel("Full name", { exact: true }).fill("Local correction survives");
	const second = await page.context().newPage();
	await second.goto("/dashboard/career/information");
	await second.getByRole("button", { name: "Add skill", exact: true }).click();
	await second.locator('input[name="name"]').fill("New concurrent skill");
	await second.getByRole("button", { name: "Review changes", exact: true }).click();
	await second.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(second.getByRole("dialog")).not.toBeVisible();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await page.getByRole("button", { name: "Create CV and open editor", exact: true }).click();
	const refresh = page.getByRole("button", { name: "Refresh career information for review", exact: true });
	await expect(refresh).toBeVisible();
	await expect(page.getByRole("button", { name: "Create CV and open editor", exact: true })).toBeDisabled();
	await refresh.click();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Local correction survives");
	await page.getByRole("button", { name: "Create CV and open editor", exact: true }).click();
	await expect(page).toHaveURL(/\/builder\//);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	expect((await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name).toBe(
		"Local correction survives",
	);
	expect((await (await page.request.get("/api/openapi/career/master")).json()).facts).toEqual(master.facts);
	await second.close();
});
