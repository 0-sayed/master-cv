import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createAuthenticatedContext } from "../fixtures/auth";
import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390]) {
		test(`${locale} at ${width}: application details use a durable page and selection actions float`, async ({
			authPage: page,
		}, info) => {
			test.setTimeout(90_000);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.goto("/dashboard/applications");
			const api = variantClient(page);
			const id = await api.applications.create({
				company: "Synthetic Company",
				role: "Engineer",
				notes: "ملاحظة يدوية / Manual note",
			});
			await api.applications.addNote({ id, text: "Manual activity" });
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: new URL(page.url()).origin },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: new URL(page.url()).origin }]);
			const folder = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
			await mkdir(folder, { recursive: true });
			await page.goto("/dashboard/applications?view=board");
			await settleScreen(page);
			await expect(page.getByText("Synthetic Company", { exact: true })).toBeVisible();
			await page.screenshot({ path: join(folder, `board-${locale}-${width}.png`), fullPage: true });
			await page.getByRole("button", { name: /^Engineer.*Synthetic Company/u }).click();
			await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}$`, "u"));
			await page.reload();
			await settleScreen(page);
			await expect(page.getByRole("heading", { name: "Engineer", exact: true })).toBeVisible();
			await expect(page.getByRole("dialog")).toHaveCount(0);
			await expect(page.locator("#application-activity")).toBeVisible();
			await expect(page.locator("#application-activity").locator("..")).not.toContainText(/[٠-٩۰-۹]/u);
			const columns = page.locator('[data-slot="application-detail-columns"]');
			await expect(columns.locator(":scope > div")).toContainText("Manual activity");
			await expect(columns.locator(":scope > aside")).toContainText(
				locale === "ar-SA" ? "إدارة المستندات" : "Manage documents",
			);
			const count = await columns.evaluate(
				(element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
			);
			expect(count).toBe(width === 390 ? 1 : 2);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
			await page.screenshot({ path: join(folder, `details-${locale}-${width}.png`), fullPage: true });
			await page
				.locator(".record-header")
				.getByRole("button", { name: locale === "ar-SA" ? "المزيد من الإجراءات" : "More actions", exact: true })
				.click();
			await page.getByRole("menuitem").first().click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.keyboard.press("Escape");
			await page
				.getByRole("link", { name: locale === "ar-SA" ? "العودة إلى الطلبات" : "Back to applications" })
				.click();
			await page.getByRole("checkbox", { name: /Engineer.*Synthetic Company/u }).click();
			const toolbar = page.getByRole("toolbar", {
				name: locale === "ar-SA" ? "الطلبات المحددة" : "Selected applications",
			});
			await expect(toolbar).toHaveCSS("position", "fixed");
			await settleScreen(page);
			const bounds = await toolbar.boundingBox();
			expect(bounds).not.toBeNull();
			expect(bounds?.x).toBeGreaterThanOrEqual(0);
			expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
			expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThan(width === 390 ? 780 : 1024);
			await page.screenshot({ path: join(folder, `selection-${locale}-${width}.png`), fullPage: true });
			const clear = toolbar.getByRole("button", { name: locale === "ar-SA" ? "إلغاء التحديد" : "Clear selection" });
			await clear.focus();
			await expect(clear).toBeFocused();
			await page.keyboard.press("Enter");
			await expect(toolbar).toHaveCount(0);
			await page.getByRole("button", { name: /^Engineer.*Synthetic Company/u }).click();
			await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}$`, "u"));
			await page.goto(`/dashboard/applications?applicationId=${id}`);
			await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}$`, "u"));
		});
	}

test("another account cannot open an application by its bookmarked URL", async ({
	authPage: page,
	browser,
	playwright,
}, info) => {
	test.setTimeout(60_000);
	await page.goto("/dashboard/applications");
	const api = variantClient(page);
	const id = await api.applications.create({ company: "Private owner company", role: "Private owner role" });
	const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
	try {
		const other = await anonymous.newPage();
		await other.goto(`/dashboard/applications/${id}`);
		await expect(other).toHaveURL(/\/auth\/login/u);
		await expect(other.getByText("Private owner company")).toHaveCount(0);
	} finally {
		await anonymous.close();
	}
	const request = await playwright.request.newContext({ baseURL: new URL(page.url()).origin });
	const account = createAccount(info);
	const otherContext = await createAuthenticatedContext(browser, request, account, new URL(page.url()).origin);
	try {
		const other = await otherContext.newPage();
		await other.goto(`/dashboard/applications/${id}`);
		await expect(other.getByRole("alert")).toBeVisible();
		await expect(other.getByText("Private owner company")).toHaveCount(0);
		await expect(variantClient(other).applications.getById({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
	} finally {
		await otherContext.close();
		await request.dispose();
		await deleteE2EUser(account);
	}
	await page.goto("/dashboard/applications/missing-owner-record");
	await expect(page.getByRole("alert")).toBeVisible();
	await expect(page.getByRole("link", { name: "Back to applications" })).toHaveAttribute(
		"href",
		"/dashboard/applications",
	);
});
