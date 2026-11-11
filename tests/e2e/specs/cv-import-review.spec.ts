import { openPdfReview } from "../fixtures/import-review";
import { expect, test } from "../fixtures/test";

test("manual creates an empty CV in the chosen document language directly in Write", async ({ authPage: page }) => {
	await page.goto("/dashboard");
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("radio", { name: "Arabic", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/ }).click();
	await expect(page).toHaveURL(/\/builder\/[^/?]+/);
	expect(new URL(page.url()).searchParams.get("mode")).toBe("write");
	await expect(page.getByRole("dialog")).not.toBeVisible();
	await expect(page.getByRole("heading", { name: "Review imported information", exact: true })).toHaveCount(0);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	const cv = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	expect(cv.data.metadata.page.locale).toBe("ar-SA");
	expect(cv.data.basics.name).toBe("");
	expect(cv.data.sections.experience.items).toEqual([]);
	expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
	await expect(page.getByRole("button", { name: "Use confirmed career information", exact: true })).toBeVisible();
});

test("section review survives refresh; Cancel removes the local draft without creating a CV", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard");
	const before = await (await page.request.get("/api/openapi/resumes")).json();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await openPdfReview(page);
	const url = page.url();
	await page.getByLabel("Full name", { exact: true }).fill("Local unsaved review");
	await page.getByRole("button", { name: "Confirm section", exact: true }).click();
	await expect
		.poll(() =>
			page.evaluate(async () => {
				const db = await new Promise<IDBDatabase>((resolve, reject) => {
					const req = indexedDB.open("master-cv-import-review", 1);
					req.onsuccess = () => resolve(req.result);
					req.onerror = () => reject(req.error);
				});
				try {
					return await new Promise<boolean>((resolve, reject) => {
						const req = db.transaction("drafts").objectStore("drafts").getAll();
						req.onsuccess = () =>
							resolve(
								req.result.some(
									(row) => row.state.data.basics.name === "Local unsaved review" && row.state.reviewed.basics,
								),
							);
						req.onerror = () => reject(req.error);
					});
				} finally {
					db.close();
				}
			}),
		)
		.toBe(true);
	await page.reload();
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Local unsaved review");
	await expect(page.getByRole("status", { name: "Review progress" })).toContainText(/^1 of /);
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
	expect(await (await page.request.get("/api/openapi/resumes")).json()).toEqual(before);
	expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
	await page.goto(url);
	await expect(
		page
			.locator('[data-slot="alert"]')
			.filter({ hasText: "This import review has expired or is unavailable on this device. Choose your file again." }),
	).toBeVisible();
});

test("mobile review switches between one section and its original PDF", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await openPdfReview(page);
	await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
	await page.getByRole("tab", { name: "Original PDF", exact: true }).click();
	await expect(page.getByRole("region", { name: "Original PDF", exact: true })).toBeVisible();
	await expect(page.locator("canvas")).toBeVisible();
	await expect(page.getByLabel("Full name", { exact: true })).not.toBeVisible();
	await page.getByRole("tab", { name: "Extracted information", exact: true }).click();
	await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
