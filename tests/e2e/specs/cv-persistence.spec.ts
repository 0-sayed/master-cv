// oxlint-disable typescript/no-non-null-assertion -- Synthetic fixtures assert required IDs and rows before use.
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("reload keeps unsaved changes for explicit recovery and persists only after Restore", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.reload();
	const url = page.url();
	const id = new URL(url).pathname.split("/").at(-1)!;
	const before = await page.request.get(`/api/openapi/resumes/${id}`);
	expect(before.ok()).toBe(true);
	const saved = await before.json();
	await page.route("**/api/rpc/resume/update", (route) => route.abort("failed"));
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic recovery edits");
	await expect(page.getByRole("status").filter({ hasText: "Not saved" })).toBeVisible();
	await page.unroute("**/api/rpc/resume/update");
	await page.reload();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByText("Unsaved changes on this device", { exact: true })).toBeVisible();
	for (const name of ["Write", "Page", "Design", "Check"]) {
		await expect(
			page.getByRole("navigation", { name: "Editor views" }).getByRole("button", { name, exact: true }),
		).toBeDisabled();
	}
	await expect(page.getByLabel("Full name", { exact: true })).not.toBeVisible();
	const untouched = await page.request.get(`/api/openapi/resumes/${id}`);
	expect((await untouched.json()).data.basics.name).toBe(saved.data.basics.name);
	await page.getByRole("button", { name: "Restore local changes", exact: true }).click();
	await expect
		.poll(async () => {
			const response = await page.request.get(`/api/openapi/resumes/${id}`);
			return (await response.json()).data.basics.name;
		})
		.toBe("Synthetic recovery edits");
	await page.reload();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Synthetic recovery edits");
});

test("two tabs resolve a stale save without overwriting either draft", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await page.reload();
	const url = page.url();
	const id = new URL(url).pathname.split("/").at(-1)!;
	const second = await page.context().newPage();
	await second.goto(url);
	await expect(second.getByLabel("Full name", { exact: true })).toBeVisible();
	// Hold this tab's already-guarded request while the other tab commits a newer baseline.
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
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic local draft");
	await started;
	await second.getByLabel("Full name", { exact: true }).fill("Synthetic remote draft");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Synthetic remote draft");
	release();
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.getByRole("button", { name: "Save my edits as a new copy", exact: true })).toBeVisible();
	for (const name of ["Write", "Page", "Design", "Check"]) {
		await expect(
			page.getByRole("navigation", { name: "Editor views" }).getByRole("button", { name, exact: true }),
		).toBeDisabled();
	}
	await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeDisabled();
	expect((await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name).toBe(
		"Synthetic remote draft",
	);
	await page.getByRole("button", { name: "Save my edits as a new copy", exact: true }).click();
	await expect(page.getByRole("alert").filter({ hasText: "You have reached the limit for base CVs" })).toBeVisible();
	await expect(page).toHaveURL(url);
	// Denied copy creation keeps the local recovery draft and leaves the saved CV untouched.
	expect((await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name).toBe(
		"Synthetic remote draft",
	);
	await page.reload();
	await expect(page.getByRole("button", { name: "Restore local changes", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Restore local changes", exact: true }).click();
	await expect(page.getByRole("button", { name: "Save my edits as a new copy", exact: true })).toBeVisible();
	// Explicitly reconcile with the saved baseline, then manually recover the desired local value.
	await page.getByRole("button", { name: "Open saved copy", exact: true }).click();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Synthetic remote draft");
	await page.getByLabel("Full name", { exact: true }).fill("Synthetic local draft");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Synthetic local draft");
	await second.close();
});
