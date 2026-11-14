import type { Page } from "@playwright/test";
import { expect } from "./test";

export async function openPdfReview(page: Page, locale: "en-US" | "ar-SA" = "en-US") {
	const ar = locale === "ar-SA";
	await page.goto("/dashboard");
	await page.getByRole("button", { name: ar ? /^(جديد|سيرة ذاتية جديدة)$/u : /^(New CV|New)$/, exact: true }).click();
	await page.getByRole("button", { name: ar ? /^رفع سيرة ذاتية موجودة/ : /^Upload an existing CV/ }).click();
	await page.locator('input[type="file"]').setInputFiles("tooling/document-qualification/native/en.pdf");
	await expect(page).toHaveURL(/\/dashboard\/import\/[\w-]+/, { timeout: 30000 });
	await expect(
		page.getByRole("heading", { name: ar ? "راجع المعلومات المستوردة" : "Review imported information", exact: true }),
	).toBeVisible();
}
