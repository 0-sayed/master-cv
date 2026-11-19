import type { RouterClient } from "@orpc/server";
import type router from "@reactive-resume/api/routers";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createDemoFixture, demoCredentials, demoAccountName } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/demo-test";
import { settleScreen } from "../fixtures/screen";

test("dense fictional career supports application and calendar review", async ({
	page,
	baseURL,
	demoLock,
}, testInfo) => {
	test.setTimeout(300_000);
	await demoLock();
	const seed = (...args: string[]) =>
		execFileSync(process.execPath, ["tooling/local/demo-seed.mjs", ...args], {
			encoding: "utf8",
			env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		});
	expect(seed("--reset")).toContain("Demo created:");
	expect(seed()).toContain("Demo skipped:");
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const api: RouterClient<typeof router> = createORPCClient(
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
	const trash = await api.documents.list({ trashed: true });
	expect(trash).toHaveLength(2);
	await page.goto("/dashboard/trash?locale=en-US");
	await settleScreen(page);
	const restored = trash[0];
	const purged = trash[1];
	if (!restored || !purged) throw new Error("DEMO_TRASH_MISSING");
	await page
		.getByRole("row", { name: restored.name, exact: true })
		.getByRole("button", { name: "Restore", exact: true })
		.click();
	await expect(page.getByRole("row", { name: restored.name, exact: true })).toHaveCount(0);
	expect((await api.documents.list({ trashed: false })).some((item) => item.id === restored.id)).toBe(true);
	await page
		.getByRole("row", { name: purged.name, exact: true })
		.getByRole("button", { name: "Delete forever", exact: true })
		.click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever", exact: true }).click();
	await expect(page.getByRole("row", { name: purged.name, exact: true })).toHaveCount(0);
	await expect(api.documents.restore({ type: purged.type, id: purged.id })).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
	expect(seed("--reset")).toContain("Demo created:");
	expect(seed()).toContain("Demo skipped:");
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	expect(await api.documents.counts()).toEqual({ resume: 15, letter: 11, trash: 2 });
	const applications = await api.applications.list({});
	expect(applications).toHaveLength(20);
	expect(applications.filter((application) => application.status !== "saved" && application.resumeId)).toHaveLength(16);
	expect(applications.filter((application) => application.status === "saved" && application.resumeId)).toHaveLength(2);
	const documents = await api.documents.list({ trashed: false });
	const scenarios = createDemoFixture(new Date()).applicationScenarios;
	for (const scenario of scenarios) {
		const application = applications.find((row) => row.company === scenario.input.company);
		expect(application).toBeDefined();
		expect(
			application?.activity
				.filter((entry) => entry.type === "stage")
				.sort((a, b) => a.at.getTime() - b.at.getTime())
				.map((entry) => entry.stage),
		).toEqual(scenario.history.map((entry) => entry.stage));
		if (scenario.resumeGroup === "tailored")
			expect(documents.find((row) => row.id === application?.resumeId)?.application?.id).toBe(application?.id);
	}
	expect((await api.coverLetters.list({})).items).toHaveLength(11);
	const calendarApplication = applications.find((application) =>
		application.company.startsWith("International Desert Observatory"),
	);
	if (!calendarApplication || !baseURL) throw new Error("DEMO_CALENDAR_APPLICATION_MISSING");
	const metrics: unknown[] = [];
	const screenshots: string[] = [];
	for (const locale of ["ar-SA", "en-US"]) {
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: 900 });
			for (const [name, route] of [
				["trash", "/dashboard/trash?review=true"],
				["applications", "/dashboard/applications?closed=true"],
				["calendar", `/dashboard/applications?view=calendar&q=${encodeURIComponent(calendarApplication.company)}`],
				["application", `/dashboard/applications/${calendarApplication.id}`],
				["account", "/dashboard/settings/account?review=true"],
			]) {
				await page.goto(
					`${route}&locale=${locale}`.replace(`${calendarApplication.id}&`, `${calendarApplication.id}?`),
				);
				await settleScreen(page);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				if (name === "trash") {
					const nav =
						width === 390
							? page.locator('[data-slot="app-bottom-nav"]')
							: page.getByRole("complementary").getByRole("navigation");
					expect(
						await nav.locator("a[href]").evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
					).toEqual(["/dashboard/career/information", "/dashboard", "/dashboard/applications", "/dashboard/trash"]);
					await expect(page.getByRole("row", { name: "خطاب مدير العمليات", exact: true })).toBeVisible();
					await expect(page.getByRole("row", { name: "Service improvement cover letter", exact: true })).toBeVisible();
				}
				if (name === "account") {
					await expect(page.getByRole("heading", { name: /Your data|البيانات الخاصة بك/ })).toHaveCount(0);
					await expect(
						page.getByRole("heading", { name: locale === "ar-SA" ? "الجلسة الحالية" : "Current session" }),
					).toBeVisible();
				}
				if (name === "calendar") {
					if (width === 390)
						await page.getByRole("button", { name: locale === "ar-SA" ? /عرض الشهر/ : /Show month/ }).click();
					await expect(page.getByTestId("interview-calendar")).toBeVisible();
					const event = page.getByRole("button", { name: new RegExp(calendarApplication.company) }).first();
					await expect(event).toBeVisible();
					if (width === 1440) {
						await event.focus();
						await expect(page.getByRole("tooltip")).toContainText(calendarApplication.company);
					} else {
						await page
							.locator(".calendar-agenda")
							.getByRole("button", { name: new RegExp(calendarApplication.company) })
							.first()
							.click();
						await expect(page.getByRole("dialog")).toContainText(calendarApplication.company);
						await page
							.getByRole("dialog")
							.getByRole("button", { name: locale === "ar-SA" ? "إلغاء" : "Cancel", exact: true })
							.click();
					}
				}
				const path = testInfo.outputPath(`${name}-${locale}-${width}.png`);
				await page.screenshot({ path, fullPage: false });
				screenshots.push(path);
				metrics.push({
					name,
					locale,
					width,
					...(await page.evaluate(() => ({
						scrollWidth: document.documentElement.scrollWidth,
						clientWidth: document.documentElement.clientWidth,
					}))),
				});
			}
		}
	}
	await writeFile(testInfo.outputPath("visual-metrics.json"), JSON.stringify({ metrics, screenshots }, null, 2));
	await page.goto("/dashboard/settings/account?deleteAccount=true&locale=en-US");
	await expect(page).toHaveURL(/\/dashboard\/settings\/delete-account/);
	for (const [name, path] of [
		["trash", "/dashboard/trash"],
		["applications", "/dashboard/applications"],
		["calendar", "/dashboard/applications?view=calendar"],
		["account", "/dashboard/settings/account"],
	]) {
		await page.goto(path);
		await settleScreen(page);
		await expect(page.locator("#main-content")).toBeVisible();
		const session = await (await page.request.get("/api/auth/get-session")).json();
		expect(session.user.email).toBe(demoCredentials.email);
		const geometry = await page.evaluate(() => ({
			width: innerWidth,
			scrollWidth: document.documentElement.scrollWidth,
		}));
		expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
		await testInfo.attach(`layout-${name}`, { body: JSON.stringify(geometry), contentType: "application/json" });
	}
});
