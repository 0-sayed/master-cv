import { writeFile } from "node:fs/promises";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} credential settings never paint a passwordless state while accounts load`, async ({
		authPage: page,
		baseURL,
	}) => {
		if (!baseURL) throw new Error("Browser baseURL missing");
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.route("**/api/auth/list-accounts**", async (route) => {
			const response = await route.fetch();
			await new Promise((resolve) => setTimeout(resolve, 600));
			await route.fulfill({ response });
		});
		await page.addInitScript(() => {
			const frames: boolean[] = [];
			(globalThis as typeof globalThis & { credentialFrames: boolean[] }).credentialFrames = frames;
			const sample = () => {
				const section = [...document.querySelectorAll("main section")].find((el) =>
					/^(Sign-in & security|تسجيل الدخول والأمن)$/u.test(el.querySelector("h2")?.textContent ?? ""),
				);
				if (section) frames.push(!!section.querySelector('[role="switch"]'));
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		});
		await page.goto(`/dashboard/settings/account?locale=${locale}`);
		await expect(page.getByRole("switch").first()).toBeVisible();
		const frames = await page.evaluate(
			() => (globalThis as typeof globalThis & { credentialFrames: boolean[] }).credentialFrames,
		);
		expect(frames.length).toBeGreaterThan(0);
		expect(frames.every(Boolean), "No false passwordless state or inserted security row after first paint").toBe(true);
	});
}

function recordTabs() {
	const frames: { box: number[]; tabs: number[][]; font: string; loaded: boolean; snapshot: string[] }[] = [];
	let running = true;
	const sample = () => {
		const nav = document.querySelector('main nav a[href="/dashboard/settings/account"]')?.closest("nav");
		if (nav && nav.getBoundingClientRect().height) {
			const box = (el: Element) => {
				const r = el.getBoundingClientRect();
				return [r.x, r.y, r.width, r.height];
			};
			const link = nav.querySelector("a");
			if (!link) throw new Error("Settings tab missing");
			const pseudo = getComputedStyle(document.documentElement, "::view-transition-group(settings-nav)");
			frames.push({
				box: box(nav),
				tabs: [...nav.querySelectorAll("a")].map(box),
				font: [
					getComputedStyle(link).fontFamily,
					getComputedStyle(link).fontSize,
					getComputedStyle(link).fontWeight,
				].join(" / "),
				loaded: document.fonts.status === "loaded",
				snapshot: [pseudo.width, pseudo.height, pseudo.transform, pseudo.animationName],
			});
		}
		if (running) requestAnimationFrame(sample);
	};
	requestAnimationFrame(sample);
	(globalThis as typeof globalThis & { stopTabFrames: () => typeof frames }).stopTabFrames = () => {
		running = false;
		return frames;
	};
}

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1280, 1440]) {
		test(`${locale} ${width} settings tabs have no frame size delta`, async ({ authPage: page, baseURL }, info) => {
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard?locale=${locale}`);
			await page.evaluate(recordTabs);
			await page.locator('aside a[href="/dashboard/settings"]').click();
			await expect(page.locator('main nav a[href="/dashboard/settings/account"]')).toBeVisible();
			await page.evaluate(async () => {
				await document.fonts.ready;
				await new Promise<void>((resolve) => setTimeout(resolve, 450));
			});
			const frames = await page.evaluate(() =>
				(
					globalThis as typeof globalThis & {
						stopTabFrames: () => {
							box: number[];
							tabs: number[][];
							font: string;
							loaded: boolean;
							snapshot: string[];
						}[];
					}
				).stopTabFrames(),
			);
			await writeFile(info.outputPath("tab-frames.json"), JSON.stringify(frames, null, 2));
			expect(frames.length).toBeGreaterThan(5);
			const final = frames.at(-1);
			if (!final) throw new Error("No settings frames recorded");
			for (const frame of frames) {
				expect.soft(frame.box.slice(2), "Strip size on every frame").toEqual(final.box.slice(2));
				expect
					.soft(
						frame.tabs.map((r) => r.slice(2)),
						"Tab size on every frame",
					)
					.toEqual(final.tabs.map((r) => r.slice(2)));
				if (frame.snapshot[3] !== "none") {
					expect
						.soft(Number.parseFloat(frame.snapshot[0]), "Snapshot width must match final strip")
						.toBeCloseTo(final.box[2], 0);
					expect
						.soft(Number.parseFloat(frame.snapshot[1]), "Snapshot height must match final strip")
						.toBeCloseTo(final.box[3], 0);
				}
			}
		});
		test(`${locale} ${width} settings actions have one trailing edge`, async ({ authPage: page, baseURL }, info) => {
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "http://localhost:3030" },
				data: { uiLocale: locale },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/settings/account?locale=${locale}`);
			await expect(
				page.getByRole("button", { name: locale === "ar-SA" ? "إضافة مفتاح المرور" : "Add passkey", exact: true }),
			).toBeVisible();
			const actions = await page.locator('main [data-slot="settings-row-action"]').evaluateAll((containers) =>
				containers.map((container) => {
					// Base UI switches append a hidden native input after their visible control.
					const el = [...container.querySelectorAll('button, a[href], [role="switch"]')].at(-1);
					if (!el) throw new Error("Settings row action missing");
					const r = el.getBoundingClientRect();
					return { edge: document.dir === "rtl" ? r.left : r.right, height: r.height, text: el.textContent };
				}),
			);
			expect(actions.length).toBeGreaterThanOrEqual(5);
			for (const action of actions) expect.soft(action.edge).toBeCloseTo(actions[0].edge, 0);
			const buttons = actions.filter((a) => a.text?.trim());
			for (const action of buttons) expect.soft(action.height).toBe(buttons[0].height);
			const signOut = await page
				.getByRole("button", { name: locale === "ar-SA" ? "تسجيل الخروج" : "Sign out", exact: true })
				.boundingBox();
			if (!signOut) throw new Error("Sign out missing");
			expect(locale === "ar-SA" ? signOut.x : signOut.x + signOut.width).toBeCloseTo(actions[0].edge, 0);
			expect(signOut.height).toBe(buttons[0].height);
			await page.evaluate(() => document.fonts.ready);
			await page.screenshot({ path: info.outputPath(`settings-${locale}-${width}.png`), fullPage: true });
		});
	}
}
