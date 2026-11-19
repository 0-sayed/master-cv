import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { hostname, platform, arch, cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { demoCredentials, demoAccountName, demoFixture } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { rpcRequestPaths } from "../fixtures/rpc-failure";
import { expect, test } from "../fixtures/test";

async function measure(page: Page) {
	const requests: Record<string, number> = {};
	const start = performance.now();
	let listStarted = start;
	let listResponseMs = 0;
	let listDurationMs = 0;
	let responseBytes = 0;
	const now = () => performance.now() - start;
	page.on("request", (request) => {
		for (const path of rpcRequestPaths(request)) {
			if (path.startsWith("/api/")) requests[path] = (requests[path] ?? 0) + 1;
			if (path.endsWith("/documents/list")) listStarted = performance.now();
		}
	});
	const list = page.waitForResponse((response) =>
		rpcRequestPaths(response.request()).some((path) => path.endsWith("/documents/list")),
	);
	const firstCard = page.locator("main article").first().waitFor().then(now);
	const navigation = page.goto("/dashboard?locale=en-US", { waitUntil: "domcontentloaded" }).then(now);
	const response = await list;
	listResponseMs = now();
	listDurationMs = performance.now() - listStarted;
	expect(response.ok()).toBe(true);
	responseBytes = (await response.body()).byteLength;
	const firstCardMs = await firstCard;
	const domContentLoadedMs = await navigation;
	const cards = page.locator("main article");
	await expect(cards.first()).toBeVisible();
	const count = await cards.count();
	expect(count).toBeGreaterThan(0);
	for (const card of await cards.all()) {
		await card.scrollIntoViewIfNeeded();
		const preview = card.locator('[data-slot$="-thumbnail"]');
		if (await preview.count()) {
			await expect(preview).toHaveAttribute("data-state", /^(ready|empty)$/, { timeout: 60_000 });
		} else {
			await expect(card.getByRole("link").first()).toBeVisible();
		}
	}
	await expect(page.getByRole("button", { name: /^Retry$/ })).toHaveCount(0);
	return {
		domContentLoadedMs,
		listResponseMs,
		listDurationMs,
		firstCardMs,
		allCardReadyMs: now(),
		count,
		responseBytes,
		requests,
	};
}

test("demo library load measurements", async ({ browser, page, baseURL }, testInfo) => {
	test.setTimeout(600_000);
	const seed = execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
		encoding: "utf8",
		env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		timeout: 60_000,
	});
	expect(seed).toMatch(/Demo (created|skipped):/);
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const storageState = await page.context().storageState();
	const samples = [];
	for (let index = 0; index < 5; index++) {
		const context = await browser.newContext({ baseURL, storageState, viewport: { width: 1440, height: 1024 } });
		try {
			const cold = await context.newPage();
			samples.push({ kind: "cold", index, ...(await measure(cold)) });
			await cold.goto("/dashboard/career");
			await cold.close();
			const warm = await context.newPage();
			samples.push({ kind: "warm", index, ...(await measure(warm)) });
		} finally {
			await context.close();
		}
	}
	const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
	const metrics = ["domContentLoadedMs", "listResponseMs", "listDurationMs", "firstCardMs", "allCardReadyMs"] as const;
	const medians = Object.fromEntries(
		["cold", "warm"].map((kind) => [
			kind,
			Object.fromEntries(
				metrics.map((metric) => [
					metric,
					median(samples.filter((sample) => sample.kind === kind).map((sample) => sample[metric])),
				]),
			),
		]),
	);
	const result = {
		medians,
		fixtureBytes: Buffer.byteLength(JSON.stringify(demoFixture)),
		browser: browser.version(),
		machine: { hostname: hostname(), platform: platform(), arch: arch(), cores: cpus().length },
		mode: process.env.NODE_ENV === "production" ? "production" : "development",
		fixtureRevision: execFileSync(
			"git",
			["hash-object", "tooling/local/demo-fixture.ts", "tooling/local/demo-resume.ts", "tooling/local/demo-career.ts"],
			{ encoding: "utf8" },
		)
			.trim()
			.split("\n"),
		locale: "en-US",
		viewport: { width: 1440, height: 1024 },
		fixture: "tooling/local/demo-fixture.ts",
		samples,
	};
	const path = testInfo.outputPath("load-samples.json");
	await writeFile(path, JSON.stringify(result, null, 2));
	await testInfo.attach("demo-library-load", { path, contentType: "application/json" });
});
