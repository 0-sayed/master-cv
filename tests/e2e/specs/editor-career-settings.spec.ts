import type { RouterClient } from "@orpc/server";
import type router from "@reactive-resume/api/routers";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { demoCredentials, demoAccountName } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { detectAuthenticatedPage } from "../fixtures/design-detector";
import { settleScreen } from "../fixtures/screen";
import { test, expect } from "../fixtures/test";

function seedDemo(reset = false) {
	execFileSync(process.execPath, ["tooling/local/demo-seed.mjs", ...(reset ? ["--reset"] : [])], {
		env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		stdio: "pipe",
	});
}

test("dense career, design, and device controls remain usable in both directions and widths", async ({
	page,
	authPage: devicePage,
	account,
	baseURL,
	browser,
}, info) => {
	test.setTimeout(300_000);
	if (!baseURL) throw new Error("BROWSER_BASE_URL_REQUIRED");
	seedDemo();
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	for (let index = 0; index < 9; index++) {
		const device = await browser.newContext({ baseURL });
		const login = await device.request.post("/api/auth/sign-in/email", {
			headers: { origin: baseURL },
			data: { email: account.email, password: account.password },
		});
		expect(login.ok()).toBe(true);
		await device.close();
	}
	const api: RouterClient<typeof router> = createORPCClient(
		new RPCLink({
			url: new URL("/api/rpc", baseURL).href,
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
	const resumes = await api.resume.list({});
	expect(resumes).toHaveLength(15);
	const resumeId = resumes[0].id;
	const master = await api.career.master.read({});
	if (!master.contact) throw new Error("DEMO_CONTACT_REQUIRED");
	const before = await api.resume.getById({ id: resumeId });
	const metrics: unknown[] = [];
	for (const locale of ["ar-SA", "en-US"])
		for (const width of [1440, 390]) {
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.setViewportSize({ width, height: 950 });
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			await page.locator("#career-heading-experience").waitFor();
			await settleScreen(page);
			await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "85");
			await expect(page.getByRole("link", { name: /100%/ })).toBeVisible();
			await page.screenshot({ path: info.outputPath(`career-${locale}-${width}.png`) });
			await page.goto(`/builder/${resumeId}?mode=design&locale=${locale}`);
			await settleScreen(page);
			await expect(page.locator('canvas[aria-label^="Resume page"]')).toHaveCount(12, { timeout: 90_000 });
			await expect
				.poll(() =>
					page
						.locator('canvas[aria-label^="Resume page"]')
						.first()
						.evaluate((canvas) => (canvas as HTMLCanvasElement).width),
				)
				.toBeGreaterThan(0);
			const tabs = page.getByRole("tablist", { name: /Design groups|مجموعات التصميم/ });
			if (width === 1440) {
				await expect(tabs).toBeVisible();
				const pageTab = tabs.getByRole("tab", { name: locale === "ar-SA" ? "صفحة" : "Page", exact: true });
				await pageTab.click();
				await expect
					.poll(() => page.locator("#design-page").evaluate((section) => section.getBoundingClientRect().top))
					.toBeLessThan(150);
				await expect(pageTab).toHaveAttribute("aria-selected", "true");
				await pageTab.focus();
				await page.keyboard.press(locale === "ar-SA" ? "ArrowLeft" : "ArrowRight");
				await expect(
					tabs.getByRole("tab", { name: locale === "ar-SA" ? "متقدم" : "Advanced", exact: true }),
				).toBeFocused();
				await pageTab.click();
				await expect
					.poll(() => page.locator("#design-page").evaluate((section) => section.getBoundingClientRect().top))
					.toBeLessThan(150);
				await expect(pageTab).toHaveAttribute("aria-selected", "true");
			} else {
				const pageTab = page.getByRole("tab", { name: locale === "ar-SA" ? "صفحة" : "Page", exact: true });
				await pageTab.click();
			}
			const paper = page.getByRole("radiogroup", { name: locale === "ar-SA" ? "ورق" : "Paper", exact: true });
			await expect(paper).toBeVisible();
			const labels = await paper.getByRole("radio").allTextContents();
			expect(labels.map((label) => label.trim())).toEqual(["A4", "Letter", locale === "ar-SA" ? "حر" : "Free"]);
			const widths = await paper
				.getByRole("radio")
				.evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().width));
			expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
			await expect(page.getByRole("button", { name: /Dismiss page fit hint|إخفاء اقتراح ملاءمة الصفحة/ })).toHaveCount(
				0,
			);
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath(`editor-${locale}-${width}.png`) });
			for (const name of locale === "ar-SA" ? ["النوع", "اللون", "متقدم"] : ["Type", "Color", "Advanced"]) {
				await page.getByRole("tab", { name, exact: true }).click();
				await settleScreen(page);
				const unsafe = await page.locator('[data-slot="segmented-control-label"]').evaluateAll((labels) =>
					labels
						.filter((label) => {
							if (!label.getBoundingClientRect().width) return false;
							const range = document.createRange();
							range.selectNodeContents(label);
							const text = range.getBoundingClientRect();
							const control = label.closest('[role="radio"]')?.getBoundingClientRect();
							return (
								!control ||
								text.left < control.left - 1 ||
								text.right > control.right + 1 ||
								text.top < control.top - 1 ||
								text.bottom > control.bottom + 1
							);
						})
						.map((label) => {
							const range = document.createRange();
							range.selectNodeContents(label);
							return {
								text: label.textContent,
								content: range.getBoundingClientRect().toJSON(),
								control: label.closest('[role="radio"]')?.getBoundingClientRect().toJSON(),
							};
						}),
				);
				expect(unsafe).toEqual([]);
			}
			await expect(page.locator("#design-date-format")).toBeVisible();
			if (width === 1440) {
				await page
					.locator("#design-template")
					.evaluate((section) => section.scrollIntoView({ behavior: "instant", block: "start" }));
				await expect(
					page.getByRole("tab", { name: locale === "ar-SA" ? "القالب" : "Template", exact: true }),
				).toHaveAttribute("aria-selected", "true");
			}
			metrics.push({ locale, width, paperWidths: widths });
			await devicePage.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await devicePage.setViewportSize({ width, height: 950 });
			await devicePage.goto(`/dashboard/settings/account?locale=${locale}`);
			await settleScreen(devicePage);
			await expect(
				devicePage.getByText(locale === "ar-SA" ? "هذا الجهاز" : "This device", { exact: true }),
			).toBeVisible();
			await expect(devicePage.getByRole("button", { name: /10/ })).toBeVisible();
			await expect(devicePage.locator('[data-slot="settings-row"][data-density="compact"]')).toHaveCount(5);
			const deviceRow = devicePage.locator('[data-slot="settings-row"][data-density="compact"]').nth(1);
			const aligned = await deviceRow.evaluate((row) => {
				const labelElement = row.querySelector('[dir="auto"]');
				const timeElement = row.querySelector("time");
				if (!labelElement || !timeElement) return false;
				const label = labelElement.getBoundingClientRect();
				const time = timeElement.getBoundingClientRect();
				return Math.abs(label.top + label.height / 2 - time.top - time.height / 2) < 2;
			});
			expect(aligned).toBe(true);
			await devicePage
				.getByRole("heading", { name: locale === "ar-SA" ? "الأجهزة المتصلة" : "Connected devices", exact: true })
				.evaluate((heading) => heading.closest("section")?.scrollIntoView({ block: "start" }));
			await settleScreen(devicePage);
			await devicePage.screenshot({ path: info.outputPath(`sessions-${locale}-${width}.png`) });
		}
	await devicePage.context().addCookies([{ name: "locale", value: "en-US", url: baseURL }]);
	await devicePage.getByRole("button", { name: "Show all 10" }).click();
	const devices = devicePage
		.getByRole("region")
		.filter({ has: devicePage.getByRole("heading", { name: "Connected devices", exact: true }) });
	await expect(devices.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(9);
	await devicePage.getByRole("button", { name: "Sign out of all other devices", exact: true }).click();
	await expect(devicePage.getByRole("alertdialog")).toBeVisible();
	await devicePage.getByRole("button", { name: "Confirm sign out", exact: true }).click();
	await expect(devices.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
	await expect(devicePage.getByText("This device", { exact: true })).toBeVisible();
	await page.goto("/dashboard/career/information?locale=en-US");
	await page.locator("#career-heading-summary").waitFor();
	await page.getByRole("button", { name: "Add a summary", exact: true }).click();
	await page.getByLabel("Summary", { exact: true }).fill("Twenty years of saved career evidence.");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByRole("link", { name: /to reach/ })).toHaveCount(0);
	await expect(page.getByRole("progressbar").first()).toHaveAttribute("aria-valuenow", "100");
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(before.data);
	const latest = await api.career.master.read({});
	await api.career.master.saveDetails({
		expectedProfileRevision: latest.profileRevision,
		contact: master.contact,
		summary: "",
	});
	await page.goto("/?locale=en-US");
	await expect(page.getByRole("link", { name: "Open my workspace", exact: true }).first()).toBeVisible();
	await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toHaveCount(0);
	await page.goto("/ats-checker");
	await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
	await writeFile(info.outputPath("editor-career-metrics.json"), JSON.stringify(metrics, null, 2));

	await page.request.post("/api/auth/sign-out", { headers: { origin: baseURL }, data: {} });
	await page.goto("/ats-checker");
	await expect(page).toHaveURL(new RegExp(`${baseURL}/?(?:\\?|$)`));
});

test("career rings and navigation totals fit expanded, collapsed, and mobile layouts", async ({ page }, info) => {
	test.setTimeout(180_000);
	seedDemo();
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	for (const locale of ["ar-SA", "en-US"]) {
		for (const width of [1440, 1024, 390]) {
			await page.setViewportSize({ width, height: 950 });
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			await settleScreen(page);
			for (const collapsed of width >= 1024 ? [false, true] : [false]) {
				if (width >= 1024) {
					const toggle = page.locator('[data-slot="sidebar-toggle"]');
					if ((await toggle.getAttribute("aria-expanded")) === String(collapsed)) await toggle.click();
					await settleScreen(page);
				}
				await expect(page.getByRole("progressbar")).toHaveCount(2);
				const rings = await page.getByRole("progressbar").evaluateAll((elements) =>
					elements.map((element) => {
						const box = element.getBoundingClientRect();
						const label = element.querySelector('span[dir="ltr"]');
						const range = document.createRange();
						if (label) range.selectNodeContents(label);
						const text = label ? range.getBoundingClientRect() : null;
						const arc = element.querySelector('circle[stroke="currentColor"]');
						return {
							value: element.getAttribute("aria-valuenow"),
							dash: arc?.getAttribute("stroke-dasharray"),
							cap: arc?.getAttribute("stroke-linecap"),
							start: arc?.getAttribute("transform"),
							fits: !text || (text.width <= box.width * 0.78 && text.height <= box.height * 0.78),
							centered:
								!text ||
								(Math.abs(text.x + text.width / 2 - box.x - box.width / 2) < 1.5 &&
									Math.abs(text.y + text.height / 2 - box.y - box.height / 2) < 2.5),
						};
					}),
				);
				expect(rings.length).toBeGreaterThan(1);
				for (const ring of rings) {
					expect(ring).toEqual({
						value: "85",
						dash: "85 15",
						cap: "butt",
						start: "rotate(-90 18 18)",
						fits: true,
						centered: true,
					});
				}
				if (width >= 1024) {
					const aside = page.getByRole("complementary");
					if (collapsed) {
						await expect(aside).not.toContainText("%");
						const career = aside.getByRole("link", { name: /85%/ });
						await career.hover();
						await expect(page.getByRole("tooltip")).toContainText("85%");
						await page.mouse.move(width / 2, 900);
						await expect(page.getByRole("tooltip")).not.toBeVisible();
					}
					const badges = await aside.locator('[data-slot="sidebar-count-badge"]').evaluateAll((elements) =>
						elements.map((badge) => {
							const b = badge.getBoundingClientRect();
							const link = badge.closest("a");
							const icon = link?.querySelector('[data-slot="icon"]')?.getBoundingClientRect();
							const parent = link?.getBoundingClientRect();
							return {
								text: badge.textContent,
								overlap:
									!!icon &&
									Math.min(b.right, icon.right) > Math.max(b.left, icon.left) &&
									Math.min(b.bottom, icon.bottom) > Math.max(b.top, icon.top),
								inside:
									!!parent &&
									b.left >= parent.left &&
									b.right <= parent.right &&
									b.top >= parent.top &&
									b.bottom <= parent.bottom,
							};
						}),
					);
					expect(badges).toHaveLength(3);
					for (const badge of badges) {
						expect(badge.overlap).toBe(false);
						expect(badge.inside).toBe(true);
						if (collapsed) expect(badge.text).toBe("");
					}
				} else await expect(page.getByRole("complementary")).toHaveCount(0);
				await expect(page.locator('a[href="#career-heading-summary"]').first()).toContainText("100%");
				await page.screenshot({
					path: info.outputPath(`navigation-${locale}-${width}-${collapsed ? "collapsed" : "expanded"}.png`),
				});
			}
		}
	}
});

test("live editor detector scans one authenticated URL at a time", async ({ page, baseURL }, info) => {
	test.skip(!process.env.IMPECCABLE_BIN, "This local review requires an explicit detector binary.");
	test.setTimeout(300_000);
	if (!baseURL) throw new Error("BROWSER_BASE_URL_REQUIRED");
	seedDemo();
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	await page.goto("/dashboard?locale=en-US");
	await settleScreen(page);
	const link = page.locator('a[href^="/builder/"]').first();
	const href = await link.getAttribute("href");
	if (!href) throw new Error("SEEDED_CV_LINK_REQUIRED");
	const path = new URL(href, baseURL).pathname;
	await page.goto(`${path}?mode=design`);
	await settleScreen(page);
	await detectAuthenticatedPage(page, baseURL, info, {
		name: "editor-design",
		pathname: `${path}?mode=design`,
		readPath: "resume/getById",
	});
});
