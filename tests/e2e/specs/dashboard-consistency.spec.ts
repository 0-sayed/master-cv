import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

const routes = [
	"/dashboard",
	"/dashboard/career/information",
	"/dashboard/applications",
	"/dashboard/settings",
	"/dashboard/settings/account",
	"/dashboard/settings/preferences",
	"/dashboard/settings/ai",
	"/dashboard/trash",
	"/dashboard/career",
	"/dashboard/career/coach",
	"/dashboard/career/knowledge/facts",
	"/dashboard/career/knowledge/stories",
	"/dashboard/career/knowledge/preferences",
	"/dashboard/career/offers",
] as const;

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1024, 1280, 1440, 1920]) {
		test(`${locale} ${width} dashboard routes share edges, sidebar and title role`, async ({
			authPage: page,
			baseURL,
		}) => {
			test.setTimeout(120_000);
			await page.setViewportSize({ width, height: 1024 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
			const response = await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic consistency", role: "Engineer", status: "saved" },
			});
			await expect(response).toBeOK();
			const id = (await response.json()) as string;
			let firstSidebar: { x: number; width: number } | undefined;
			for (const route of [...routes, `/dashboard/applications/${id}`]) {
				await page.goto(`${route}?locale=${locale}`);
				await expect(page.locator("main h1").first()).toBeVisible();
				await expect(page.locator("html")).toHaveAttribute("lang", locale);
				await settleScreen(page);
				const layout = await page.evaluate(() => {
					const main = document.querySelector("main");
					if (!main) throw new Error("Dashboard main missing");
					const bar = document.querySelector(".shell-toolbar");
					const title = main.querySelector("h1");
					const navigation = document.querySelector("aside");
					if (!bar || !title || !navigation) throw new Error("Dashboard header, title or navigation missing");
					const sidebar = navigation.getBoundingClientRect();
					const rect = bar.getBoundingClientRect();
					const bandElement = document.querySelector('[data-slot="dashboard-header-content"]');
					if (!bandElement) throw new Error("Dashboard band missing");
					const band = bandElement.getBoundingClientRect();
					const mainBox = main.getBoundingClientRect();
					const heading = title.getBoundingClientRect();
					const pageHeader = title.closest("header");
					if (!pageHeader) throw new Error("Dashboard page header missing");

					const rtl = document.documentElement.dir === "rtl";
					return {
						sidebar: { x: sidebar.x, width: sidebar.width },
						headerStart: rtl ? band.right : band.left,
						titleStart: rtl ? heading.right : heading.left,
						titleTop: heading.top,
						pageHeaderTop: pageHeader.getBoundingClientRect().top,
						barBottom: rect.bottom,
						centerGapDifference: band.left - mainBox.left - (mainBox.right - band.right),
						titleSize: getComputedStyle(title).fontSize,
						titleLine: getComputedStyle(title).lineHeight,
						overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
					};
				});
				expect.soft(Math.abs(layout.titleStart - layout.headerStart), route).toBeLessThanOrEqual(1);
				if (width === 1920) expect.soft(Math.abs(layout.centerGapDifference), route).toBeLessThanOrEqual(2);
				expect.soft(layout.sidebar.width, route).toBe(236);
				firstSidebar ??= layout.sidebar;
				expect.soft(layout.sidebar, route).toEqual(firstSidebar);
				expect.soft(layout.titleSize, route).toBe("32px");
				expect.soft(layout.titleLine, route).toBe("48px");
				expect.soft(layout.pageHeaderTop - layout.barBottom, route).toBe(32);
				// Trash and detail workspaces retain a visible back link above their title.
				if (route !== "/dashboard/trash" && !route.startsWith("/dashboard/applications/"))
					expect.soft(layout.titleTop - layout.barBottom, route).toBe(32);
				expect.soft(layout.overflow, route).toBe(false);
			}
		});
	}

	test(`${locale} toolbar controls fit labels and share one height at 1280`, async ({ authPage: page }) => {
		await page.setViewportSize({ width: 1280, height: 1024 });
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Synthetic toolbar", tags: [], withSampleData: false },
			}),
		).toBeOK();
		await expect(
			await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic toolbar", role: "Engineer", status: "saved" },
			}),
		).toBeOK();
		for (const route of ["/dashboard", "/dashboard/applications"]) {
			await page.goto(`${route}?locale=${locale}`);
			await expect(page.locator("main input[type=search]")).toBeVisible();
			await settleScreen(page);
			const heights = await page.locator("main").evaluate((main) => {
				const header = main.querySelector("h1")?.closest("header");
				if (!header) throw new Error("Page header missing");
				const controls: Element[] = [...header.querySelectorAll("button")].filter(
					(el) => !el.closest('[role="tablist"]'),
				);
				controls.push(
					...[...main.querySelectorAll('input[type="search"]')].map(
						(el) => el.closest('[data-slot="input-group"]') ?? el,
					),
				);
				controls.push(...main.querySelectorAll('select, [data-slot="segmented-control"], [data-slot="tabs-list"]'));
				return controls.map((el) => ({
					name: el.getAttribute("aria-label") ?? el.textContent,
					height: el.getBoundingClientRect().height,
				}));
			});
			for (const control of heights) expect.soft(control.height, `${route} ${control.name}`).toBe(44);
			for (const select of await page.locator("main select").all()) {
				const fit = await select.evaluate((element) => {
					const style = getComputedStyle(element);
					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Text measurement unavailable");
					context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
					return {
						text: context.measureText((element as HTMLSelectElement).selectedOptions[0]?.text ?? "").width,
						available:
							element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
					};
				});
				expect(fit.text).toBeLessThanOrEqual(fit.available + 1);
			}
		}
	});

	test(`${locale} sidebar and tablet rail omit New while N still creates`, async ({ authPage: page }) => {
		for (const width of [1440, 768]) {
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			await expect(page.locator("main h1")).toBeVisible();
			await expect(
				page.getByRole("complementary").getByRole("button", { name: locale === "ar-SA" ? "جديد" : "New", exact: true }),
			).toHaveCount(0);
			await page.keyboard.press("n");
			await expect(page.getByRole("dialog")).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(page.getByRole("dialog")).not.toBeVisible();
		}
	});

	test(`${locale} root scrollbar does not move dashboard edges`, async ({ authPage: page }) => {
		await page.setViewportSize({ width: 1280, height: 1800 });
		await page.goto(`/dashboard/applications?locale=${locale}`);
		await expect(page.locator("main h1")).toBeVisible();
		await page.addStyleTag({ content: "::-webkit-scrollbar { width: 16px; }" });
		const before = await page.locator("main h1").boundingBox();
		await page.evaluate(() => {
			const extra = document.createElement("div");
			extra.style.height = "3000px";
			const main = document.querySelector("main");
			if (!main) throw new Error("Dashboard main missing");
			main.append(extra);
		});
		const after = await page.locator("main h1").boundingBox();
		expect(after?.x).toBe(before?.x);
		expect(after?.width).toBe(before?.width);
	});
}
