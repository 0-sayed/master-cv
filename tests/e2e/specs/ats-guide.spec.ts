import { execFileSync } from "node:child_process";
import { ATS_RULE_CODES } from "@reactive-resume/resume/ats";
import { PDF_ATS_RULE_CODES } from "@reactive-resume/resume/ats-pdf";
import { demoCredentials, demoAccountName } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { openReview } from "../fixtures/reviewable-ai";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

// Written for the isolated browser runner. Never seed an owner's live runtime.
function seedSyntheticDemo() {
	execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
		env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		stdio: "pipe",
		timeout: 60_000,
	});
}
test("requires authentication and retains a rule destination through sign-in", async ({ page }) => {
	seedSyntheticDemo();
	await page.goto("/dashboard/review-guide?locale=en-US#rule-NO_EMAIL");
	await expect(page).toHaveURL(/\/auth\/login/);
	expect(new URL(page.url()).searchParams.get("callbackURL")).toContain("#rule-NO_EMAIL");
	await expect(page.getByRole("heading", { name: "Review guide" })).toHaveCount(0);
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName }, page.url());
	await expect(page).toHaveURL(/review-guide.*#rule-NO_EMAIL/);
	await expect(page.locator("#rule-NO_EMAIL")).toHaveAttribute("open", "");
	expect((await (await page.request.get("/api/auth/get-session")).json()).user.email).toBe("demo@sirawise.test");
});
test("explores six branches, global bilingual search, severity types, table and keyboard recovery without writes", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/review-guide?locale=en-US");
	await settleScreen(page);
	const writes: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method()))
			writes.push(request.url());
	});
	await expect(page.locator("#ats-guide-results")).toBeVisible();
	await expect(page.locator('details[id^="rule-"]')).toHaveCount(77);
	for (const area of ["parseability", "layout", "sections", "contact", "dates", "content"]) {
		const branch = page.locator(`[data-guide-area="${area}"]`);
		await branch.focus();
		await page.keyboard.press("Enter");
		await expect(page.locator("#ats-guide-results")).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(branch).toBeFocused();
	}
	const findingTypes = page.getByRole("radiogroup", { name: "Finding type", exact: true });
	await expect(findingTypes.getByRole("radio")).toHaveCount(4);
	for (const type of ["blocker", "warning", "tip"]) {
		const label = type.charAt(0).toUpperCase() + type.slice(1);
		await findingTypes.getByRole("radio", { name: new RegExp(`^${label} \\d+$`) }).click();
		await expect(page.locator("details")).not.toHaveCount(0);
	}
	await findingTypes.getByRole("radio", { name: /^All \d+$/u }).click();
	await page.getByRole("tab", { name: "Data check", exact: true }).click();
	await page.getByRole("searchbox").fill("MISSING_EMAIL");
	await expect(page.locator("#rule-MISSING_EMAIL")).toBeVisible();
	await page.getByRole("searchbox").fill("البريد");
	await expect(page.locator("details")).not.toHaveCount(0);
	await page.getByRole("searchbox").fill("not-a-rule-xyz");
	await expect(page.getByText("No matching checks", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Clear filters", exact: true }).click();
	await page.getByRole("button", { name: "Show as table" }).click();
	await expect(page.getByRole("table")).toHaveAccessibleName("Checks by CV area");
	await expect(page.getByRole("table").getByRole("row")).toHaveCount(8);
	await page.getByRole("table").getByRole("button", { name: "Contact", exact: true }).click();
	const summary = page.locator("details summary").first();
	await summary.focus();
	await page.keyboard.press("Space");
	await expect(summary.locator("..")).toHaveAttribute("open", "");
	await page.keyboard.press("Enter");
	await expect(summary.locator("..")).not.toHaveAttribute("open", "");
	expect(writes).toEqual([]);
});
test("resolves catalog anchors, same-rule reopening, history and invalid links", async ({ authPage: page }) => {
	await page.goto("/dashboard/review-guide?locale=en-US#rule-NO_EMAIL");
	for (const code of ["NO_EMAIL", "MISSING_EMAIL"]) {
		await page.goto(`/dashboard/review-guide?locale=en-US#rule-${code}`);
		const row = page.locator(`#rule-${code}`);
		await expect(row).toHaveAttribute("open", "");
		await expect(row.locator("summary")).toBeFocused();
		await row.locator("summary").click();
		await expect(row).not.toHaveAttribute("open", "");
		// The destination also appears through a real same-route navigation.
		await page.evaluate((code) => {
			const router = (
				window as unknown as {
					__TSR_ROUTER__: { navigate: (options: { to: string; hash: string; replace: boolean }) => Promise<void> };
				}
			).__TSR_ROUTER__;
			return router.navigate({ to: "/dashboard/review-guide", hash: `rule-${code}`, replace: true });
		}, code);
		await expect(row).toHaveAttribute("open", "");
	}
	await page.goBack();
	await expect(page.locator("#rule-NO_EMAIL")).toHaveAttribute("open", "");
	await page.goForward();
	await expect(page.locator("#rule-MISSING_EMAIL")).toHaveAttribute("open", "");
	for (const hash of ["rule-UNKNOWN", "rule-%"]) {
		await page.goto(`/dashboard/review-guide?locale=en-US#${hash}`);
		await expect(page.getByRole("alert")).toContainText("This check link is unavailable");
		await page.getByRole("button", { name: "Clear filters", exact: true }).click();
		await expect(page.getByRole("alert")).toHaveCount(0);
	}
	expect(new Set([...PDF_ATS_RULE_CODES, ...ATS_RULE_CODES]).size).toBe(99);
});
test("real PDF and editor finding links preserve a disposable CV and its document language", async ({
	authPage: page,
}, testInfo) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 1024 });
	await createSampleResumeFromDashboard(page, testInfo);
	const builder = new URL(page.url()).pathname;
	const id = builder.split("/").at(-1);
	if (!id) throw new Error("Missing disposable CV");
	const endpoint = `/api/openapi/resumes/${id}`;
	try {
		const current = await (await page.request.get(endpoint)).json();
		current.data.basics.email = "";
		current.data.metadata.page.locale = "ar-SA";
		await expect(
			await page.request.put(endpoint, { data: { data: current.data, expectedUpdatedAt: current.updatedAt } }),
		).toBeOK();
		await page.reload();
		await openReview(page, 1440, "ats");
		await expect(page.locator("[data-pdf-bytes-hash]")).toBeVisible({ timeout: 75_000 });
		const before = await (await page.request.get(endpoint)).json();
		for (const code of ["NO_EMAIL", "MISSING_EMAIL"]) {
			await openReview(page, 1440, code === "NO_EMAIL" ? "ats" : "writing");
			await page.locator(`a[href$="#rule-${code}"]`).first().click();
			await expect(page.locator(`#rule-${code}`)).toHaveAttribute("open", "");
			await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
			await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
			await expect(page.locator(`#rule-${code}`)).toHaveAttribute("open", "");
			await page.getByRole("button", { name: "تغيير الواجهة إلى الإنجليزية" }).click();
			await page.goto(`${builder}?locale=en-US`);
			await openReview(page, 1440, "ats");
		}
		const after = await (await page.request.get(endpoint)).json();
		expect(after.data).toEqual(before.data);
		expect(after.updatedAt).toBe(before.updatedAt);
	} finally {
		await expect(await page.request.delete(endpoint)).toBeOK();
	}
});
test("a rejected locale catalog shows retry rather than an empty guide", async ({ authPage: page }, testInfo) => {
	let fail = true;
	let releaseCatalog!: () => void;
	const catalogGate = new Promise<void>((resolve) => {
		releaseCatalog = resolve;
	});
	await page.route(/(?:ar-SA\.po|ar-SA[^/]*\.js)/, async (route) => {
		if (fail) {
			await catalogGate;
			await route.abort("failed");
		} else await route.continue();
	});
	await page.goto("/dashboard/review-guide?locale=en-US");
	await expect(page.getByRole("status").filter({ hasText: "Loading review guide" })).toHaveCount(1);
	await page.screenshot({ path: testInfo.outputPath("pending.png"), animations: "disabled" });
	releaseCatalog();
	await expect(page.getByRole("alert")).toContainText("Could not load the review guide");
	await page.screenshot({ path: testInfo.outputPath("catalog-error.png"), animations: "disabled" });
	await expect(page.locator('[data-slot="dashboard-header-content"]')).toBeVisible();
	fail = false;
	await page.getByRole("button", { name: "Try again" }).click();
	await expect(page.getByRole("heading", { name: "Review guide", exact: true })).toBeVisible();
});

test("keeps segmented guide tabs in URL state and preserves dashboard navigation", async ({ authPage: page }) => {
	await page.goto("/dashboard/review-guide?locale=en-US");
	const tabs = page.getByRole("tablist", { name: "Review guide" });
	await expect(tabs).toHaveAttribute("data-size", "page");
	await expect(tabs).toHaveAttribute("data-variant", "default");
	await expect(tabs.locator('[data-slot="tabs-count"]')).toHaveText(["77", "22", "9"]);
	expect(
		await page.locator("aside nav a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
	).toEqual(["/dashboard/career/information", "/dashboard", "/dashboard/applications", "/dashboard/trash"]);
	await expect(page.locator('aside nav a[href*="review-guide"]')).toHaveCount(0);
	const data = tabs.getByRole("tab", { name: "Data check", exact: true });
	await data.click();
	await expect(page).toHaveURL(/tab=data/);
	await expect(page.locator('[data-guide-area="contact"] [data-guide-source="editor"]')).toHaveText("7");
	await expect(page.locator('[data-guide-source="pdf"]')).toHaveCount(0);
	await data.focus();
	await page.keyboard.press("End");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/tab=ai/);
	await expect(page.locator('[data-guide-area^="review."]')).toHaveCount(9);
	await expect(page.getByRole("tabpanel")).toHaveAccessibleDescription(/AI tools/);
	await expect(page.getByRole("heading", { name: "Review guide", exact: true })).toBeVisible();
	await page.goBack();
	await expect(page).toHaveURL(/tab=data/);
});
