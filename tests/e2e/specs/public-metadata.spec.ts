import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
for (const locale of ["ar-SA", "en-US"] as const) {
	for (const path of ["/", "/privacy-and-terms?tab=terms", "/help"]) {
		test(`public HTML contains localized content before JavaScript ${locale} ${path}`, async ({
			browser,
			baseURL,
		}, testInfo) => {
			const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
			try {
				const page = await context.newPage();
				const query = path === "/" && locale === "ar-SA" ? "utm_source=fixture" : `locale=${locale}&utm_source=fixture`;
				const response = await page.goto(`${path}${path.includes("?") ? "&" : "?"}${query}`);
				expect(response?.status()).toBe(200);
				if (!response) throw new Error("Missing production HTML response");
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
				if (path === "/") {
					await expect(page.getByRole("heading", { level: 1 })).toHaveText(
						locale === "ar-SA" ? "خلّ سيرتك واضحة مثل خبرتك." : "Your CV, as clear as your experience.",
					);
					await expect(page).toHaveTitle(
						locale === "ar-SA"
							? "Master CV — اكتب سيرتك وراجعها، ثم نزّلها بصيغة PDF."
							: "Master CV — Write and review your CV, then download a PDF.",
					);
					await expect(page.locator('meta[name="description"]')).toHaveAttribute(
						"content",
						locale === "ar-SA"
							? "اكتب سيرتك وراجعها في حساب خاص. احتفظ بنسختين مستقلتين بالعربية والإنجليزية. تنزيل PDF المؤهّل مجاني ضمن حدود الحساب."
							: "Create and review your CV in a private account. Keep Arabic and English versions separate. Qualified PDF downloads are free within account limits.",
					);
					await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
						"href",
						`${baseURL}/${locale === "en-US" ? "?locale=en-US" : ""}`,
					);
					for (const [language, suffix] of [
						["ar-SA", "/"],
						["en-US", "/?locale=en-US"],
						["x-default", "/"],
					])
						await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute(
							"href",
							`${baseURL}${suffix}`,
						);
					await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", locale.replace("-", "_"));
					await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
					await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Master CV");
					await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
						"content",
						`${baseURL}/${locale === "en-US" ? "?locale=en-US" : ""}`,
					);
					await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
						"content",
						`${baseURL}/opengraph/banner.jpg`,
					);
					await testInfo.attach(`production-home-${locale}.html`, {
						body: await response.body(),
						contentType: "text/html",
					});
				}
				if (path.includes("terms"))
					await expect(
						page.getByRole("tab", { name: locale === "ar-SA" ? "الشروط" : "Terms", exact: true }),
					).toHaveAttribute("aria-selected", "true");
				if (path === "/help")
					await expect(
						page.getByRole("textbox", { name: locale === "ar-SA" ? "رسالتك" : "Your message", exact: true }),
					).toBeVisible();
				await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
				expect(await page.locator('link[rel="canonical"]').getAttribute("href")).not.toMatch(/utm_|tab=/);
				await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3);
				expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBe(await page.title());
				expect(await page.locator('meta[property="og:description"]').getAttribute("content")).toBe(
					await page.locator('meta[name="description"]').getAttribute("content"),
				);
				if (path !== "/") {
					expect(response?.headers()["x-robots-tag"]).toBe("noindex, follow");
					await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
				}
			} finally {
				await context.close();
			}
		});
	}
}
test("public metadata follows interface navigation and clears on account entry", async ({ page }) => {
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await settleScreen(page);
	await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "ar_SA");
	expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBe(await page.title());
	await page.getByRole("contentinfo").getByRole("link", { name: "الخصوصية والشروط" }).click();
	await settleScreen(page);
	await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
	await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
	await page.getByRole("banner").getByRole("link", { name: "تسجيل الدخول" }).click();
	await settleScreen(page);
	await expect(page.locator("[data-public-seo]")).toHaveCount(0);
	await page.goBack();
	await settleScreen(page);
	await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
});
test("public metadata belongs to the retained checker after same-document navigation", async ({ page, baseURL }) => {
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	await page.evaluate(async () => {
		const router = (
			globalThis as typeof globalThis & { __TSR_ROUTER__: { navigate: (options: { href: string }) => Promise<void> } }
		).__TSR_ROUTER__;
		await router.navigate({ href: "/ats-checker?locale=en-US" });
	});
	await settleScreen(page);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}/ats-checker?locale=en-US`);
	await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /account/);
});
