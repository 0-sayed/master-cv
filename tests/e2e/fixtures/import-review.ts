import type { Page } from "@playwright/test";
import { expect } from "./test";

export async function openPdfReview(page: Page) {
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Upload an existing CV/ }).click();
	await page.locator('input[type="file"]').setInputFiles("tooling/document-qualification/native/en.pdf");
	await expect(page).toHaveURL(/\/dashboard\/import\/[\w-]+/, { timeout: 30000 });
	await expect(page.getByRole("heading", { name: "Review imported information", exact: true })).toBeVisible();
}
