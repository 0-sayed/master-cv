import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
for (const locale of ["ar-SA", "en-US"]) {
	test(`footer language navigation preserves the selected legal terms ${locale}`, async ({ page }) => {
		await page.goto(`/privacy-and-terms?tab=terms&locale=${locale}`);
		const target = locale === "ar-SA" ? "en-US" : "ar-SA";
		await page
			.getByRole("contentinfo")
			.getByRole("link", { name: target === "ar-SA" ? "العربية" : "English", exact: true })
			.click();
		await expect(page.locator("html")).toHaveAttribute("lang", target);
		expect(new URL(page.url()).searchParams.get("tab")).toBe("terms");
		await expect(page.getByRole("tab", { selected: true })).toHaveText(target === "ar-SA" ? "الشروط" : "Terms");
	});
}
test("draft legal tabs survive deep links locale switching and history", async ({ page }) => {
	await page.goto("/privacy-and-terms?tab=terms&locale=en-US");
	await settleScreen(page);
	await expect(page.getByRole("tab", { name: "Terms", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByText("Review draft — not an approved final policy.")).toBeVisible();
	await page.reload();
	await settleScreen(page);
	await page.getByRole("tab", { name: "Privacy", exact: true }).click();
	await settleScreen(page);
	await expect(page).toHaveURL(/tab=privacy/);
	await page.goBack();
	await settleScreen(page);
	await expect(page.getByRole("tab", { name: "Terms", exact: true })).toHaveAttribute("aria-selected", "true");
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await settleScreen(page);
	await expect(page).toHaveURL(/tab=terms/);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	await expect(page.getByRole("tab", { name: "الشروط", exact: true })).toHaveAttribute("aria-selected", "true");
	await page.goto("/privacy-and-terms?tab=refunds&locale=en-US");
	await settleScreen(page);
	const privacy = page.getByRole("tab", { name: "Privacy", exact: true });
	await expect(privacy).toHaveAttribute("aria-selected", "true");
	await privacy.focus();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("tab", { name: "Terms", exact: true })).toHaveAttribute("aria-selected", "true");
});
test("public data rights require account proof", async ({ page, request }) => {
	await page.goto("/privacy-and-terms?locale=en-US");
	await settleScreen(page);
	await page.getByRole("link", { name: "Manage your data" }).click();
	await settleScreen(page);
	await expect(page).toHaveURL(/\/auth\/login/);
	expect(new URL(page.url()).searchParams.get("callbackURL")).toBe("/dashboard/settings/privacy?locale=en-US");
	const response = await request.post("/api/rpc/privacy/requestExport", { data: { json: {} } });
	expect(response.status()).toBe(401);
});
test("English data rights return to privacy controls after real sign-in", async ({
	page,
	authPage,
	account,
	baseURL,
}) => {
	// The separate authenticated fixture creates a verified synthetic account, not cookies in this browser.
	expect((await (await authPage.request.get("/api/auth/get-session")).json()).user.emailVerified).toBe(true);
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3000" }]);
	await page.goto("/privacy-and-terms?tab=terms&locale=en-US");
	await settleScreen(page);
	await page.getByRole("link", { name: "Manage your data" }).click();
	await expect(page).toHaveURL(/auth\/login/);
	await settleScreen(page);
	await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
	await page.locator('input[name="identifier"]').fill(account.email);
	await page.locator('input[name="password"]').fill(account.password);
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(`${baseURL}/dashboard/settings/privacy?locale=en-US`);
	await settleScreen(page);
	await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
	await expect(page.getByRole("heading", { name: "Privacy & data", exact: true })).toBeVisible();
});
