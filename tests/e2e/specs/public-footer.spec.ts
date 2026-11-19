import type { RouterClient } from "@orpc/server";
import type { Page } from "@playwright/test";
import type router from "@reactive-resume/api/routers";
import { execFileSync } from "node:child_process";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { demoCredentials, demoAccountName } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { privacyDatabase } from "../fixtures/privacy";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

function api(page: Page): RouterClient<typeof router> {
	return createORPCClient(
		new RPCLink({
			url: new URL("/api/rpc", page.url()).href,
			fetch: async (request, init) => {
				const actual = new Request(request, init);
				const response = await page.request.fetch(actual.url, {
					method: actual.method,
					headers: Object.fromEntries(actual.headers),
					...(actual.method !== "GET" && actual.method !== "HEAD" ? { data: await actual.text() } : {}),
				});
				return new Response(await response.body(), { status: response.status(), headers: response.headers() });
			},
		}),
	);
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`footer destinations, landmarks and invitation scope ${locale}`, async ({ page }) => {
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		const footer = page.getByRole("contentinfo");
		for (const role of ["banner", "main", "contentinfo"] as const) await expect(page.getByRole(role)).toHaveCount(1);
		await expect(footer).not.toContainText(/Made in|صُنع|صنع في|GitHub|Reactive Resume/);
		await expect(
			footer.getByRole("navigation", { name: locale === "ar-SA" ? "المنتج" : "Product" }).getByRole("link"),
		).toHaveCount(2);
		await expect(
			footer.getByRole("navigation", { name: locale === "ar-SA" ? "الدعم" : "Support" }).getByRole("link"),
		).toHaveCount(2);
		const links = await footer
			.getByRole("link")
			.evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href));
		expect(links).toHaveLength(7);
		for (const suffix of ["#how-it-works", "#pricing", "#faq"]) {
			const destination = links.find((link) => new URL(link).hash === suffix);
			expect(destination).toBeDefined();
			await page.goto(destination ?? "");
			await settleScreen(page);
			await expect(page.locator(suffix)).toBeAttached();
		}
		for (const tab of ["privacy", "terms"]) {
			const destination = links.find((link) => new URL(link).searchParams.get("tab") === tab);
			expect(destination).toBeDefined();
			await page.goto(destination ?? "");
			await settleScreen(page);
			await expect(page.getByRole("tab", { selected: true })).toHaveText(
				locale === "ar-SA" ? (tab === "privacy" ? "الخصوصية" : "الشروط") : tab === "privacy" ? "Privacy" : "Terms",
			);
			await expect(page.locator("#cta-title")).toHaveCount(0);
		}
		await page.goto(`/help?locale=${locale}`);
		await settleScreen(page);
		await expect(page.locator("#cta-title")).toHaveCount(0);
		await page.goto(`/?locale=${locale}`);
		await settleScreen(page);
		expect(await page.locator("main").evaluate((main) => main.lastElementChild?.getAttribute("aria-labelledby"))).toBe(
			"cta-title",
		);
		await expect(page.locator('#faq [data-slot="accordion-item"]')).toHaveCount(8);
	});
}

test("keyboard language activation retains legal tab, anchor, focus and unrelated search", async ({ page }) => {
	await page.goto("/privacy-and-terms?locale=en-US&tab=terms#privacy");
	await settleScreen(page);
	const choice = page.getByRole("contentinfo").getByRole("button", { name: "العربية", exact: true });
	await choice.focus();
	await page.keyboard.press("Enter");
	await expect(choice).toHaveAttribute("aria-pressed", "true");
	await expect(choice).toBeFocused();
	expect(new URL(page.url()).searchParams.get("tab")).toBe("terms");
	expect(new URL(page.url()).hash).toBe("#privacy");
	await page.goto("/?locale=en-US&tab=design#faq");
	await settleScreen(page);
	await page.getByRole("contentinfo").getByRole("button", { name: "العربية", exact: true }).click();
	await expect(page.locator("html")).toHaveAttribute("lang", "ar-SA");
	expect(new URL(page.url()).searchParams.get("tab")).toBe("design");
	expect(new URL(page.url()).hash).toBe("#faq");
});

test("preference pending, failure and retry preserve facts and saved revisions", async ({ authPage: page }) => {
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	const client = api(page);
	const master = await client.career.master.read({});
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: "Footer locale facts", tags: [], withSampleData: true },
	});
	expect(created.ok()).toBe(true);
	const id = await created.json();
	const saved = await client.resume.getById({ id });
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/auth/update-user", async (route) => {
		await gate;
		await route.fulfill({
			status: 500,
			contentType: "application/json",
			body: JSON.stringify({ message: "Unavailable" }),
		});
	});
	const footer = page.getByRole("contentinfo");
	const arabic = footer.getByRole("button", { name: "العربية", exact: true });
	await arabic.focus();
	await page.keyboard.press("Enter");
	await expect(arabic).toBeDisabled();
	await expect(footer.getByRole("button", { name: "English", exact: true })).toBeDisabled();
	await expect(footer.getByRole("status")).toHaveCount(1);
	release();
	await expect(footer.getByRole("alert")).toBeVisible();
	await expect(footer.getByRole("button", { name: "English", pressed: true })).toBeVisible();
	await expect(arabic).toBeFocused();
	await page.unroute("**/api/auth/update-user");
	await footer.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(arabic).toHaveAttribute("aria-pressed", "true");
	await expect(footer.getByRole("alert")).toHaveCount(0);
	expect(await client.career.master.read({})).toEqual(master);
	expect(await client.resume.getById({ id })).toEqual(saved);
});

test("root session delays and errors never expose guest-only closing actions", async ({ page }) => {
	await page.goto("/auth/login?locale=en-US");
	await expect(page.getByRole("textbox", { name: "Email address", exact: true })).toBeVisible();
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/api/auth/get-session**", async (route) => {
		await gate;
		await route.fulfill({
			status: 503,
			contentType: "application/json",
			body: JSON.stringify({ message: "Unavailable" }),
		});
	});
	await page.evaluate(() => {
		const router = (
			window as unknown as {
				__TSR_ROUTER__: { navigate(options: { to: string; search: { locale: string } }): Promise<unknown> };
			}
		).__TSR_ROUTER__;
		void router.navigate({ to: "/", search: { locale: "en-US" } });
	});
	// The root recovery boundary owns unresolved identity, including a delayed first lookup.
	await expect(page.locator('section[aria-labelledby="cta-title"] a')).toHaveCount(0);
	const failedResponse = page.waitForResponse(
		(response) => response.url().includes("/api/auth/get-session") && response.status() === 503,
	);
	release();
	await failedResponse;
	await expect(page.locator('section[aria-labelledby="cta-title"] a')).toHaveCount(0);
	await page.unroute("**/api/auth/get-session**");
	await page.reload();
	await settleScreen(page);
	await expect(page.locator('section[aria-labelledby="cta-title"] a')).toHaveCount(1);
});

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390])
		for (const theme of ["light", "dark"] as const) {
			test(`footer visual contract ${locale} ${width} ${theme}`, async ({ browser, baseURL }, info) => {
				const context = await browser.newContext({
					baseURL,
					viewport: { width, height: width === 390 ? 844 : 900 },
					hasTouch: width === 390,
					reducedMotion: "reduce",
				});
				try {
					await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3000" }]);
					const page = await context.newPage();
					await page.goto(`/?locale=${locale}`);
					await settleScreen(page);
					const footer = page.getByRole("contentinfo");
					await footer.scrollIntoViewIfNeeded();
					await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
					await page.screenshot({ path: info.outputPath(`footer-${locale}-${width}-${theme}.png`) });
					await page.screenshot({ path: info.outputPath(`landing-${locale}-${width}-${theme}.png`), fullPage: true });
					const geometry = await footer.evaluate((element) => {
						const main = element.firstElementChild?.firstElementChild?.firstElementChild;
						const box = (node: Element) => {
							const r = node.getBoundingClientRect();
							return { x: r.x, y: r.y, right: r.right, width: r.width, height: r.height };
						};
						return {
							overflow: document.documentElement.scrollWidth - innerWidth,
							columns: main ? getComputedStyle(main).gridTemplateColumns.split(" ").length : 0,
							controls: [...element.querySelectorAll("a, button")].map(box),
							footer: box(element.firstElementChild ?? element),
							invitation: box(document.querySelector('section[aria-labelledby="cta-title"] > div') ?? element),
						};
					});
					expect(geometry.overflow).toBe(0);
					expect(geometry.columns).toBe(width === 390 ? 2 : 3);
					expect(geometry.footer.x).toBeCloseTo(geometry.invitation.x);
					expect(geometry.footer.right).toBeCloseTo(geometry.invitation.right);
					for (const control of geometry.controls) {
						expect(control.width).toBeGreaterThanOrEqual(44);
						expect(control.height).toBeGreaterThanOrEqual(44);
					}
					const current = footer.getByRole("button", { pressed: true });
					await current.focus();
					await expect(current).toBeFocused();
					if (width === 390) {
						await footer.getByRole("button", { name: locale === "ar-SA" ? "English" : "العربية", exact: true }).tap();
						await expect(page.locator("html")).toHaveAttribute("lang", locale === "ar-SA" ? "en-US" : "ar-SA");
					}
				} finally {
					await context.close();
				}
			});
		}

test("synthetic demo workspace actions agree without changing saved facts", async ({ page }, info) => {
	// Seed only the disposable database created by the isolated runner, never an owner's runtime.
	await privacyDatabase(async () => {});
	execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
		env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		stdio: "pipe",
		timeout: 60_000,
	});
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const client = api(page);
	const before = await client.career.master.read({});
	const ids = [...new Set(before.links.map((link) => link.resumeId))];
	const saved = await Promise.all(ids.map((id) => client.resume.getById({ id })));
	for (const locale of ["ar-SA", "en-US"] as const)
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
			await page.goto(`/?locale=${locale}`);
			await settleScreen(page);
			const name = locale === "ar-SA" ? "افتح مساحة عملي" : "Open my workspace";
			const closing = page
				.getByRole("region", { name: locale === "ar-SA" ? "يلا، نرتّب سيرتك الحين؟" : "Ready to put your CV in order?" })
				.getByRole("link", { name });
			const header = page.getByRole("banner").getByRole("link", { name }).filter({ visible: true });
			expect(await closing.getAttribute("href")).toBe(await header.getAttribute("href"));
			await closing.scrollIntoViewIfNeeded();
			await page.screenshot({ path: info.outputPath(`footer-workspace-${locale}-${width}.png`) });
			await page
				.getByRole("contentinfo")
				.getByRole("button", { name: locale === "ar-SA" ? "English" : "العربية", exact: true })
				.click();
			await expect(page.locator("html")).toHaveAttribute("lang", locale === "ar-SA" ? "en-US" : "ar-SA");
			expect(await client.career.master.read({})).toEqual(before);
			expect(await Promise.all(ids.map((id) => client.resume.getById({ id })))).toEqual(saved);
			await page.locator('section[aria-labelledby="cta-title"] a').click();
			await expect(page).toHaveURL(/\/dashboard/);
			await settleScreen(page);
			const destinations = await page
				.locator("nav")
				.filter({ has: page.locator('a[href^="/dashboard/career/information"]') })
				.filter({ visible: true })
				.first()
				.getByRole("link")
				.evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname));
			const relevant = destinations.filter((path) =>
				["/dashboard/career/information", "/dashboard", "/dashboard/applications", "/dashboard/trash"].includes(path),
			);
			expect(relevant).toEqual([
				"/dashboard/career/information",
				"/dashboard",
				"/dashboard/applications",
				"/dashboard/trash",
			]);
		}
});

test("an authenticated empty workspace still receives workspace actions", async ({ authPage: page }) => {
	await page.goto("/?locale=en-US");
	await settleScreen(page);
	await expect(
		page.getByRole("banner").getByRole("link", { name: "Open my workspace" }).filter({ visible: true }),
	).toHaveCount(1);
	await expect(page.locator('section[aria-labelledby="cta-title"] a')).toHaveText("Open my workspace");
});
