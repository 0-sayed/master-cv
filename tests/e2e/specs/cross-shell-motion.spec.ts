import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createSampleResumeFromDashboard, makeResumePublic } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

type MotionWindow = typeof globalThis & {
	__TSR_ROUTER__?: { navigate: (options: { href: string }) => Promise<void>; state: { status: string } };
	shellMotion: {
		transitions: number;
		frames: { path: string; mains: number; transition: boolean }[];
		running: boolean;
	};
};

async function navigate(page: Page, path: string) {
	const link = page.locator(`a[href="${path}"]`).filter({ visible: true }).first();
	let mode = "router (no link on this surface)";
	if (await link.count()) {
		await link.click();
		mode = "link";
	} else
		await page.evaluate(async (href) => {
			const router = (globalThis as MotionWindow).__TSR_ROUTER__;
			if (!router) throw new Error("Router unavailable");
			await router.navigate({ href });
		}, path);
	await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(path, "http://localhost").pathname);
	await page.waitForFunction(() => (globalThis as MotionWindow).__TSR_ROUTER__?.state.status === "idle");
	await settleScreen(page);
	return mode;
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} every shell boundary swaps without concurrent landmarks or outgoing snapshots`, async ({
		authPage: page,
		baseURL,
	}, info) => {
		test.setTimeout(600_000);
		if (!baseURL) throw new Error("Browser baseURL missing");
		await page.setViewportSize({ width: 1440, height: 900 });
		await createSampleResumeFromDashboard(page, info);
		const resume = new URL(page.url()).pathname;
		const publicResume = new URL(await makeResumePublic(page), baseURL).pathname;
		const created = await page.request.post("/api/openapi/cover-letters", { data: { name: "Synthetic shell guard" } });
		await expect(created).toBeOK();
		const letter = `/builder/letter/${((await created.json()) as { id: string }).id}`;
		await expect(
			await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		await page.addInitScript(() => {
			const audit = {
				transitions: Number(sessionStorage.getItem("e2e:shell-transitions") ?? 0),
				frames: JSON.parse(sessionStorage.getItem("e2e:shell-frames") ?? "[]") as MotionWindow["shellMotion"]["frames"],
				running: true,
			};
			(globalThis as MotionWindow).shellMotion = audit;
			const start = document.startViewTransition.bind(document);
			document.startViewTransition = (...args: Parameters<typeof start>) => {
				audit.transitions++;
				sessionStorage.setItem("e2e:shell-transitions", String(audit.transitions));
				return start(...args);
			};
			addEventListener("pagehide", () => sessionStorage.setItem("e2e:shell-frames", JSON.stringify(audit.frames)));
			const sample = () => {
				audit.frames.push({
					path: location.pathname,
					mains: [...document.querySelectorAll("main")].filter(
						(el) => el.getBoundingClientRect().width && getComputedStyle(el).visibility !== "hidden",
					).length,
					transition: document.documentElement.matches(":active-view-transition"),
				});
				if (audit.running) requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
		});
		await page.goto("/");
		await settleScreen(page);
		const paths = [
			"/",
			"/auth/login?reauthenticate=true",
			"/dashboard/welcome",
			"/dashboard",
			resume,
			letter,
			"/templates/azurill.pdf",
			publicResume,
		];
		const edges: { from: string; to: string; mode: string }[] = [];
		// Every directed shell pair, plus real history traversal in both directions.
		for (const from of paths)
			for (const to of paths.filter((path) => path !== from)) {
				await navigate(page, from);
				const before = await page.evaluate(() => (globalThis as MotionWindow).shellMotion.transitions);
				const mode = await navigate(page, to);
				await page.goBack();
				await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(from, baseURL).pathname);
				await settleScreen(page);
				await page.goForward();
				await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(to, baseURL).pathname);
				await settleScreen(page);
				const count = await page.evaluate(() => (globalThis as MotionWindow).shellMotion.transitions);
				expect(count, `${from} → ${to}, back, forward: no snapshot transition`).toBe(before);
				edges.push({ from, to, mode });
			}
		// App-shell destinations all use the same boundary rule; verify the actual landing CTA and editor links.
		for (const app of [
			"/dashboard",
			"/dashboard/career/information",
			"/dashboard/applications",
			"/dashboard/settings/account",
		]) {
			await navigate(page, "/");
			const before = await page.evaluate(() => (globalThis as MotionWindow).shellMotion.transitions);
			await navigate(page, app);
			await navigate(page, resume);
			await navigate(page, app);
			expect(await page.evaluate(() => (globalThis as MotionWindow).shellMotion.transitions)).toBe(before);
		}
		const evidence = await page.evaluate(() => {
			const audit = (globalThis as MotionWindow).shellMotion;
			audit.running = false;
			return audit;
		});
		expect(evidence.frames.length).toBeGreaterThan(100);
		expect(
			evidence.frames.filter((frame) => frame.mains > 1),
			"Never render two shell main landmarks together",
		).toEqual([]);
		expect(
			evidence.frames.some((frame) => frame.transition),
			"Cross-shell snapshots must never start",
		).toBe(false);
		const record = info.outputPath("cross-shell-frames-and-edges.json");
		await writeFile(record, JSON.stringify({ edges, ...evidence }));
		await info.attach("cross-shell-frames-and-edges", { path: record, contentType: "application/json" });
	});
}
