import { writeFile } from "node:fs/promises";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type LoadingFrame = { loading: boolean; boxes: Record<string, number[]> };
type LoadingWindow = typeof globalThis & { stopLoadingFrames: () => LoadingFrame[] };

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} loading swaps preserve title and toolbar coordinates from first paint`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(90_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await expect(
			await page.request.post("/api/openapi/resumes", {
				data: { name: "Loading fixture", tags: [], withSampleData: true },
			}),
		).toBeOK();
		await expect(
			await page.request.post("/api/openapi/applications", {
				data: { company: "Synthetic loading fixture", role: "Engineer", status: "saved" },
			}),
		).toBeOK();
		let responses = Promise.resolve();
		let releaseResponses = () => {};
		await page.route(/\/api\/rpc(?:\/|\?|$)/u, async (route) => {
			const pending = responses;
			const response = await route.fetch();
			// Root auth/flags/onboarding must resolve before the page's query can start.
			if (!/\/(?:flags\/get|career\/personalWorkspace\/state)(?:\/|\?|$)/u.test(route.request().url())) await pending;
			await route.fulfill({ response });
		});
		await page.addInitScript(() => {
			const frames: LoadingFrame[] = [];
			let running = true;
			const sample = () => {
				const boxes: LoadingFrame["boxes"] = {};
				for (const [name, selector] of Object.entries({
					header: "main > header",
					title: "main h1",
					toolbar: '[data-slot="page-toolbar"]',
				})) {
					const element = document.querySelector(selector);
					if (!element || !element.getBoundingClientRect().height) continue;
					const box = element.getBoundingClientRect();
					boxes[name] = [box.x, box.y];
				}
				const content = document.querySelector('[data-slot="dashboard-content"]');
				const flatten = (parent: Element): Element[] =>
					[...parent.children].flatMap((child) =>
						getComputedStyle(child).display === "contents" ? flatten(child) : [child],
					);
				if (content) {
					const blocks = flatten(content).filter((el) => el.getBoundingClientRect().height);
					const lastHeader = blocks.findLastIndex(
						(el) => el.tagName === "HEADER" || el.getAttribute("data-slot") === "page-toolbar",
					);
					const firstContent = blocks[lastHeader + 1];
					if (firstContent) {
						const box = firstContent.getBoundingClientRect();
						boxes.contentStart = [box.x, box.y];
					}
				}
				if (boxes.title)
					frames.push({
						loading: !!document.querySelector(
							'main [data-slot="skeleton-region"] [data-visible="true"] [data-slot="skeleton"]',
						),
						boxes,
					});
				if (running) requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
			(globalThis as LoadingWindow).stopLoadingFrames = () => {
				running = false;
				return frames;
			};
		});
		for (const width of [1440, 1920]) {
			await page.setViewportSize({ width, height: 900 });
			for (const route of ["/dashboard", "/dashboard/career/information", "/dashboard/applications"]) {
				responses = new Promise<void>((resolve) => {
					releaseResponses = resolve;
				});
				try {
					await page.goto(route);
					await expect(page.locator('main [data-slot="skeleton-region"] [data-visible="true"]').first()).toBeVisible();
				} finally {
					releaseResponses();
				}
				await expect(page.locator('main [data-slot="skeleton-region"]')).toHaveCount(0);
				await settleScreen(page);
				const frames = await page.evaluate(() => (globalThis as LoadingWindow).stopLoadingFrames());
				expect(
					frames.some((frame) => frame.loading),
					"Must observe the real pending state",
				).toBe(true);
				expect(
					frames.some((frame) => !frame.loading),
					"Must observe the resolved state",
				).toBe(true);
				const baseline = frames.at(-1);
				if (!baseline) throw new Error("No loading frames captured");
				for (const frame of frames)
					for (const [name, box] of Object.entries(frame.boxes))
						expect(box, `${route} ${width} ${name}: 0px delta`).toEqual(baseline.boxes[name]);
				const name = `${width}-${route.replaceAll("/", "-")}-loading`;
				const record = info.outputPath(`${name}.json`);
				await writeFile(record, JSON.stringify(frames));
				await info.attach(name, { path: record, contentType: "application/json" });
			}
		}
	});
}
