import { mkdir, writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

const core = ["/dashboard", "/dashboard/career/information", "/dashboard/applications", "/dashboard/settings"];
const remaining = [
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
];

type Frame = {
	time: number;
	route: string;
	header: number[] | null;
	title: number[] | null;
	contentY: number | null;
	scrollY: number;
	scrollX: number;
	rootWidth: number;
	rootScrollWidth: number;
	rootLeft: number;
	fontStatus: string;
	rootTranslate: string;
	rootTransform: string;
	rootTransitionName: string;
	headerTranslate: string;
	headerTransform: string;
	headerAnimation: string;
	headerGroupAnimation: string;
	bodyTranslate: string;
	headerTransitionName: string;
	transition: boolean;
	action: string;
	activeElement: string;
	aside: number[] | null;
	areas: Record<string, { key: string; box: number[] }>;
	oldBodyDisplay: string;
	bodyTransform: string;
};
type RecordingWindow = typeof globalThis & {
	stopShellRecording?: () => Frame[];
	shellAction?: string;
	__TSR_ROUTER__?: { state: { status: string; resolvedLocation?: { pathname: string } } };
};

for (const locale of ["ar-SA", "en-US"]) {
	for (const width of [1440, 1920]) {
		test(`${locale} ${width} header stays still within each native scrollbar layout`, async ({
			authPage: page,
			baseURL,
		}, testInfo) => {
			test.setTimeout(120_000);
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			const response = await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic frame audit", role: "Engineer", status: "saved" },
			});
			await expect(response).toBeOK();
			const id = (await response.json()) as string;
			await expect(
				await page.request.post("/api/openapi/resumes", {
					data: { name: "Stationary first document", tags: [], withSampleData: true },
				}),
			).toBeOK();
			await page.goto("/dashboard");
			await expect(page.locator("main h1")).toBeVisible();
			await expect(
				page.locator('[data-slot="skeleton"]:not([data-slot="context-menu-trigger"] [data-slot="skeleton"])'),
			).toHaveCount(0);
			await settleScreen(page);
			const documentId = await page.evaluate(() => performance.timeOrigin);
			await page.evaluate(() => {
				const frames: Frame[] = [];
				let recording = true;
				const box = (el: Element | null) => {
					if (!el) return null;
					const r = el.getBoundingClientRect();
					return [r.x, r.y, r.width, r.height];
				};
				const sample = (time: number) => {
					const header = document.querySelector("main > header");
					const style = getComputedStyle(document.documentElement, "::view-transition-new(root)");
					const headerStyle = getComputedStyle(document.documentElement, "::view-transition-new(app-header)");
					const areas: Frame["areas"] = {};
					for (const [name, selector] of Object.entries({
						title: "main h1",
						tabs: 'main nav a[href="/dashboard/settings/account"]',
						toolbar: '[data-slot="page-toolbar"]',
						row: '[data-slot="settings-row"], [data-slot="section-card"], main tbody tr, main [data-slot="context-menu-trigger"], [data-slot="dashboard-content"] > section',
					})) {
						const el = document.querySelector(selector);
						if (!el || !el.getBoundingClientRect().height) continue;
						const rect = box(el);
						if (rect) areas[name] = { key: el.textContent ?? "", box: rect };
					}
					frames.push({
						time,
						route: location.pathname,
						header: box(header),
						title: box(document.querySelector("main h1")),
						contentY: document.querySelector('[data-slot="dashboard-page"]')?.getBoundingClientRect().top ?? null,
						scrollY,
						scrollX,
						rootWidth: document.documentElement.clientWidth,
						rootScrollWidth: document.documentElement.scrollWidth,
						rootLeft: document.documentElement.getBoundingClientRect().left,
						fontStatus: document.fonts.status,
						rootTranslate: style.translate,
						rootTransform: style.transform,
						rootTransitionName: getComputedStyle(document.documentElement).viewTransitionName,
						headerTranslate: headerStyle.translate,
						headerTransform: headerStyle.transform,
						headerAnimation: headerStyle.animationName,
						headerGroupAnimation: getComputedStyle(document.documentElement, "::view-transition-group(app-header)")
							.animationName,
						bodyTranslate: getComputedStyle(document.documentElement, "::view-transition-new(dashboard-body)")
							.translate,
						headerTransitionName: header ? getComputedStyle(header).viewTransitionName : "missing",
						transition: document.documentElement.matches(":active-view-transition"),
						action: (globalThis as RecordingWindow).shellAction ?? "initial",
						activeElement: document.activeElement?.tagName ?? "none",
						aside: box(document.querySelector("aside")),
						areas,
						oldBodyDisplay: getComputedStyle(document.documentElement, "::view-transition-old(dashboard-body)").display,
						bodyTransform: getComputedStyle(document.documentElement, "::view-transition-new(dashboard-body)")
							.transform,
					});
					if (recording) requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
				(globalThis as RecordingWindow).stopShellRecording = () => {
					recording = false;
					return frames;
				};
			});
			const destinations = [...core.slice(1), ...core, ...remaining, `/dashboard/applications/${id}`, ...core];
			for (const route of destinations) {
				await page.evaluate((destination) => {
					(globalThis as RecordingWindow).shellAction = destination;
				}, route);
				const link = page.locator(`aside a[href="${route}"]`);
				if (await link.count()) await link.click();
				else
					await page.evaluate((destination) => {
						// Installed TanStack browser history observes pushState, preserving client navigation.
						history.pushState(
							{ ...history.state, __TSR_key: crypto.randomUUID(), __TSR_index: (history.state?.__TSR_index ?? 0) + 1 },
							"",
							destination,
						);
					}, route);
				await expect
					.poll(() => new URL(page.url()).pathname.replace(/\/$/u, ""))
					.toBe(route === "/dashboard/settings" ? "/dashboard/settings/account" : route);
				// The URL changes before lazy routes commit. Measure their rendered destination too.
				await page.waitForFunction(
					(destination) => {
						const state = (globalThis as RecordingWindow).__TSR_ROUTER__?.state;
						return state?.status === "idle" && state.resolvedLocation?.pathname.replace(/\/$/u, "") === destination;
					},
					route === "/dashboard/settings" ? "/dashboard/settings/account" : route,
				);
				await expect(page.locator("main h1").first()).toBeVisible();
				await expect(
					page.locator('[data-slot="skeleton"]:not([data-slot="context-menu-trigger"] [data-slot="skeleton"])'),
				).toHaveCount(0);
				await settleScreen(page);
				const title = await page.locator("main h1").first().innerText();
				await expect(page.locator("main > header").getByText(title, { exact: true })).toHaveCount(0);
			}
			// Settings sub-tab switches are client navigations too, not isolated reloads.
			for (const destination of [
				"/dashboard/settings/account",
				"/dashboard/settings/preferences",
				"/dashboard/settings/account",
			]) {
				await page.evaluate((value) => {
					(globalThis as RecordingWindow).shellAction = `tabs:${value}`;
				}, destination);
				const tab = page.locator(`main nav a[href="${destination}"]`);
				if (await tab.count()) await tab.click();
				else
					await page.evaluate(
						(href) =>
							history.pushState(
								{
									...history.state,
									__TSR_key: crypto.randomUUID(),
									__TSR_index: (history.state?.__TSR_index ?? 0) + 1,
								},
								"",
								href,
							),
						destination,
					);
				await expect(page.locator(`main nav a[href="${destination}"]`)).toHaveAttribute("aria-current", "page");
				await settleScreen(page);
			}
			await page.evaluate(() => {
				(globalThis as RecordingWindow).shellAction = "intentional scroll";
			});
			// Include scroll restoration from the longest primary sidebar surface.
			await page.locator('aside a[href="/dashboard/settings"]').click();
			await settleScreen(page);
			await page.evaluate(() => window.scrollTo(0, 300));
			await page.locator('aside a[href="/dashboard"]').click();
			await expect(page.locator("main h1")).toBeVisible();
			await settleScreen(page);
			const frames = await page.evaluate(() => (globalThis as RecordingWindow).stopShellRecording?.() ?? []);
			const path = process.env.HEADER_MOTION_EVIDENCE;
			if (path) {
				await mkdir(path, { recursive: true });
				await writeFile(`${path}/${locale}-${width}.json`, JSON.stringify(frames, null, 2));
			}
			const record = testInfo.outputPath("animation-frames.json");
			await writeFile(record, JSON.stringify(frames));
			await testInfo.attach("animation-frames", { path: record, contentType: "application/json" });
			expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentId);
			expect(frames.length).toBeGreaterThan(20);
			expect(
				frames.filter((frame) => frame.transition).every((frame) => ["none", "0px"].includes(frame.bodyTranslate)),
				"Page snapshots must never translate titles or toolbars",
			).toBe(true);
			const baseline = frames[0].header;
			const positions = new Map<string, number[]>();
			for (const frame of frames.filter((value) => value.action !== "intentional scroll" && value.scrollY === 0)) {
				for (const [area, value] of Object.entries(frame.areas)) {
					const key = JSON.stringify([frame.action, frame.route, area, value.key, frame.rootWidth, frame.rootLeft]);
					const xy = value.box.slice(0, 2);
					const previous = positions.get(key);
					if (previous) expect(xy, `${area} must have 0px x/y delta at ${frame.route}`).toEqual(previous);
					else positions.set(key, xy);
				}
			}
			expect(positions.size).toBeGreaterThan(20);
			for (const frame of frames.filter((value) => value.transition)) {
				expect(frame.oldBodyDisplay).toBe("none");
				expect(["none", "matrix(1, 0, 0, 1, 0, 0)"], "Page snapshots cannot scale or translate").toContain(
					frame.bodyTransform,
				);
			}
			expect(baseline).not.toBeNull();
			// The browser may add or remove its scrollbar. Keep exact geometry within each resulting viewport.
			const headerLayouts = new Map<string, string>();
			for (const frame of frames) {
				const key = JSON.stringify([frame.rootWidth, frame.rootLeft]);
				const header = JSON.stringify(frame.header);
				const previous = headerLayouts.get(key);
				if (previous) expect.soft(header, "Header stays fixed within the same viewport layout").toBe(previous);
				else headerLayouts.set(key, header);
			}
			expect(
				frames.some((frame) => frame.transition),
				"The browser must actually run route view transitions",
			).toBe(true);
			expect(
				frames.every((frame) => frame.rootTransitionName === "none"),
				"No viewport-wide dashboard snapshot",
			).toBe(true);
			expect
				.soft(
					frames.filter(
						(frame) =>
							frame.transition &&
							((frame.rootTranslate !== "none" && frame.rootTranslate !== "0px") ||
								(frame.rootTransform !== "none" && frame.rootTransform !== "matrix(1, 0, 0, 1, 0, 0)")),
					).length,
					"Root snapshots must not move the shell",
				)
				.toBe(0);
			expect(
				frames
					.filter((frame) => frame.transition)
					.every(
						(frame) =>
							frame.headerAnimation === "none" &&
							frame.headerGroupAnimation === "none" &&
							["none", "0px"].includes(frame.headerTranslate) &&
							["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(frame.headerTransform),
					),
				"Header snapshots must also remain still",
			).toBe(true);
			expect
				.soft(
					frames.every((frame) => frame.headerTransitionName === "app-header"),
					"Header is isolated from body snapshots",
				)
				.toBe(true);
		});
	}
}
