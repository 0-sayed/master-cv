import { capturedAuthLink } from "../fixtures/mail";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("public skip navigation reaches the page heading", async ({ page }) => {
	await page.goto("/help?locale=en-US");
	await settleScreen(page);
	await page.keyboard.press("Tab");
	await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.locator("#main-content")).toBeFocused();
	await expect(page.locator("main")).toHaveCount(1);
});

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`how it works moves keyboard focus to the steps ${locale}`, async ({ page }) => {
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		const link = page
			.locator("main")
			.getByRole("link", { name: locale === "ar-SA" ? "كيف يعمل" : "How it works", exact: true });
		await link.focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("#how-it-works")).toBeFocused();
		await expect(page.locator("#steps-title")).toBeInViewport();
	});
	for (const width of [1440, 390]) {
		test(`keeps free entry visible and sign-in one tap away at both public widths ${locale} ${width}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(`/?locale=${locale}`);
			await settleScreen(page);
			await expect(
				page.getByRole("banner").getByRole("link", { name: locale === "ar-SA" ? "ابدأ مجانًا" : "Start free" }),
			).toBeInViewport();
			const signIn = { name: locale === "ar-SA" ? "تسجيل الدخول" : "Sign in" };
			if (width < 1024) {
				// Phones keep one primary action in the bar; sign in, sections and language live in the menu sheet.
				await page
					.getByRole("banner")
					.getByRole("button", { name: locale === "ar-SA" ? "القائمة" : "Menu" })
					.click();
				await expect(page.getByRole("dialog").getByRole("link", signIn)).toBeInViewport();
			} else await expect(page.getByRole("banner").getByRole("link", signIn)).toBeInViewport();
			await expect(page.locator("main")).toHaveCount(1);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
		});
	}
}
test("example language is independent from interface language and saved CV facts", async ({ authPage: page }) => {
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Independent language example", tags: [], withSampleData: true },
	});
	expect(created.ok()).toBe(true);
	const id = await created.json();
	const saved = async () => {
		const response = await page.request.get(`/api/openapi/resumes/${id}`);
		expect(response.ok()).toBe(true);
		const { data, updatedAt } = await response.json();
		expect(data).toBeDefined();
		return { data, updatedAt };
	};
	const before = await saved();
	const mutations: string[] = [];
	page.on("request", (request) => {
		// ORPC sends these read-only bootstrap queries via POST. Every other non-GET request remains a failure.
		const readOnlyQueries = ["/api/rpc/flags/get", "/api/rpc/resume/getRoot"];
		if (request.method() !== "GET" && !readOnlyQueries.includes(new URL(request.url()).pathname))
			mutations.push(request.url());
	});
	await page.goto("/?locale=ar-SA");
	await settleScreen(page);
	// The bilingual example always opens on Arabic; flipping it changes only the example.
	await expect(page.locator('[data-example-language="ar"] [lang="ar-SA"][dir="rtl"]')).toHaveCount(1);
	await page.getByRole("radio", { name: "النسخة الإنجليزية", exact: true }).click();
	const english = page.locator('[data-example-language="en"]');
	await english.scrollIntoViewIfNeeded();
	await expect(english).toContainText("Abdullah Alqahtani");
	await expect(english).toContainText("Prepare monthly financial reports.");
	await expect(english.locator('[lang="en-US"][dir="ltr"]')).toHaveCount(1);
	await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
	expect(mutations).toEqual([]);
	expect(await saved()).toEqual(before);
});
test("landing logo runs once and stays static with reduced motion", async ({ page }) => {
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	const logo = page.getByRole("banner").locator('[data-slot="brand-mark"]:visible');
	const before = await logo.getAttribute("class");
	await page.getByRole("banner").getByRole("link", { name: "Sirawise", exact: true }).hover();
	await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
	await settleScreen(page);
	expect(await logo.getAttribute("class")).toBe(before);
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.reload();
	await settleScreen(page);
	expect(
		await page.evaluate(
			() =>
				document
					.getAnimations()
					.filter(
						(a) =>
							a.playState === "running" && (a.effect as KeyframeEffect)?.target?.closest?.('[data-slot="brand-mark"]'),
					).length,
		),
	).toBe(0);
});

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`free entry completes email verification through the existing account flow ${locale}`, async ({
		page,
		account,
	}) => {
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		await page
			.locator("main")
			.getByRole("link", { name: locale === "ar-SA" ? "يلا، ابدأ مجانًا" : "Start free", exact: true })
			.first()
			.click();
		await expect(page).toHaveURL(/auth\/register/);
		expect(new URL(page.url()).searchParams.get("callbackURL")).toBe("/dashboard");
		expect(new URL(page.url()).searchParams.get("locale")).toBe(locale);
		for (const field of ["name", "username", "email", "password"] as const)
			await page.locator(`#register-${field}`).fill(account[field]);
		await page.getByRole("checkbox").check();
		await page.locator('button[type="submit"]').click();
		await expect(page).toHaveURL(/auth\/verify-email/);
		expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
		await page.goto(await capturedAuthLink(account.email, "verification"));
		await expect(page).toHaveURL(/auth\/login/);
		await page.locator('input[name="identifier"]').fill(account.email);
		await page.locator('input[name="password"]').fill(account.password);
		await page.locator('button[type="submit"]').click();
		await expect(page).toHaveURL(/dashboard/);
		await settleScreen(page);
		await expect(page.locator("html")).toHaveAttribute("lang", locale);
		const session = await (await page.request.get("/api/auth/get-session")).json();
		expect(session.user.emailVerified).toBe(true);
		expect(session.user.uiLocale).toBe(locale);
		await expect(page.locator("main")).toHaveCount(1);
	});
	test(`returning account reaches the workspace without overlapping shells ${locale}`, async ({ authPage: page }) => {
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		await page
			.getByRole("banner")
			.getByRole("link", { name: locale === "ar-SA" ? "افتح مساحة عملي" : "Open my workspace", exact: true })
			.click();
		await expect(page).toHaveURL(/dashboard/);
		await settleScreen(page);
		await expect(page.locator("main")).toHaveCount(1);
	});
}
test("unsafe callback stays on an internal destination", async ({ authPage: page, baseURL }) => {
	await page.goto("/auth/login?callbackURL=https%3A%2F%2Fhostile.example%2Faccount");
	await expect(page).toHaveURL(`${baseURL}/dashboard`);
});
test("expired account session returns through existing recovery", async ({ authPage: page, account, baseURL }) => {
	await page.goto("/dashboard/career/information?locale=en-US");
	await page.getByRole("button", { name: "Add skill", exact: true }).click();
	await page.locator('input[name="name"]').fill("Synthetic recovery skill");
	const response = await page.request.post("/api/auth/sign-out", {
		headers: { origin: baseURL ?? "http://localhost:3000" },
		data: {},
	});
	expect(response.status()).toBe(200);
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await expect(page).toHaveURL(/auth\/login.*reason=sessionExpired/);
	await settleScreen(page);
	await expect(page.getByRole("status").getByRole("heading", { name: "Session expired", exact: true })).toBeVisible();
	await page.locator('input[name="identifier"]').fill(account.email);
	await page.locator('input[name="password"]').fill(account.password);
	await page.locator('button[type="submit"]').click();
	await expect(page).toHaveURL(/dashboard\/career\/information/);
	await expect(page.locator('input[name="name"]')).toHaveValue("Synthetic recovery skill");
});
