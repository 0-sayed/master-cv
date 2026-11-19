import type { RouterClient } from "@orpc/server";
import type router from "@reactive-resume/api/routers";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { demoCredentials, demoAccountName, demoFixture } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { expect, test } from "../fixtures/demo-test";
import { settleScreen } from "../fixtures/screen";

test("the fictional demo survives reruns and interface language changes", async ({
	page,
	baseURL,
	demoLock,
}, testInfo) => {
	test.setTimeout(600_000);
	await demoLock();
	const seed = () =>
		execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
			encoding: "utf8",
			env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
			timeout: 60_000,
		});
	expect(seed()).toMatch(/Demo (created|skipped):/);
	expect(seed()).toContain("Demo skipped:");
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const api: RouterClient<typeof router> = createORPCClient(
		new RPCLink({
			url: new URL("/api/rpc", page.url()).href,
			fetch: async (request, init) => {
				const session = await (await page.request.get("/api/auth/get-session")).json();
				expect(session.user.email).toBe(demoCredentials.email);
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
	const letters = (await api.coverLetters.list({})).items;
	const applications = await api.applications.list({});
	expect(resumes).toHaveLength(15);
	expect(letters).toHaveLength(11);
	expect(applications).toHaveLength(20);
	const master = await api.career.master.read({});
	expect(master.facts.filter((fact) => fact.structured?.section === "experience").length).toBeGreaterThanOrEqual(15);
	expect(master.facts.filter((fact) => fact.structured?.section === "skills").length).toBeGreaterThanOrEqual(8);
	const documents = await Promise.all(resumes.map((resume) => api.resume.getById({ id: resume.id })));
	const exemplars = [
		documents.find((row) => row.data.metadata.page.locale === "ar-SA"),
		documents.find((row) => row.data.metadata.page.locale === "en-US" && !row.applicationId),
		documents.find(
			(row) =>
				row.data.basics.headline === demoFixture.resumes[2].basics.headline &&
				row.applicationId &&
				!row.name.includes(" — "),
		),
	];
	expect(exemplars.every(Boolean)).toBe(true);
	const summaries = await api.documents.list({ trashed: false });
	expect(summaries.filter((row) => row.type === "resume")).toHaveLength(15);
	expect(applications.filter((row) => row.status !== "saved" && row.resumeId)).toHaveLength(16);
	expect(applications.filter((row) => row.status === "saved" && row.resumeId)).toHaveLength(2);
	const tailored = applications.filter(
		(row) =>
			row.resumeId &&
			summaries.some(
				(document) => document.type === "resume" && document.id === row.resumeId && document.application?.id === row.id,
			),
	);
	expect(tailored).toHaveLength(11);
	expect(new Set(tailored.map((row) => row.resumeId)).size).toBe(11);
	const saved = documents.map(({ id, data, updatedAt }) => ({ id, data, updatedAt }));
	const metrics: unknown[] = [];
	const captures: string[] = [];
	for (const locale of ["ar-SA", "en-US"]) {
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "" },
				data: { uiLocale: locale },
			}),
		).toBeOK();
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:23100" }]);
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.emulateMedia({ reducedMotion: "reduce" });
			const routes = [
				"/dashboard",
				"/dashboard/career/information",
				"/dashboard/cover-letters",
				"/dashboard/applications",
				"/dashboard/settings/account",
				"/dashboard/settings/delete-account",
				...exemplars.map((resume) => `/builder/${resume?.id}`),
				...letters.map((letter) => `/builder/letter/${letter.id}`),
			];
			for (const [index, route] of routes.entries()) {
				await page.goto(`${route}?locale=${locale}`);
				await settleScreen(page);
				await expect(page).toHaveTitle(locale === "ar-SA" ? /سيراوايز/ : /Sirawise/);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				if (route === "/dashboard/career/information") {
					const values = await page.locator("main").evaluate(
						(main) =>
							`${main.textContent} ${Array.from(main.querySelectorAll("input"))
								.map((input) => input.value)
								.join(" ")}`,
					);
					expect(values).toContain("SQL");
				}
				const path = testInfo.outputPath(`${locale}-${width}-workspace-${index}.jpg`);
				await page.screenshot({ path, type: "jpeg", quality: 55, animations: "disabled" });
				captures.push(path);
				metrics.push({
					locale,
					width,
					route,
					...(await page.evaluate(() => ({
						viewport: innerWidth,
						documentWidth: document.documentElement.scrollWidth,
						sidebar: document.querySelector("aside")?.getBoundingClientRect().width ?? null,
					}))),
				});
			}
		}
	}
	const after = await Promise.all(resumes.map((resume) => api.resume.getById({ id: resume.id })));
	expect(after.map(({ id, data, updatedAt }) => ({ id, data, updatedAt }))).toEqual(saved);
	await page.context().storageState({ path: testInfo.outputPath("demo-state.json") });
	await writeFile(testInfo.outputPath("visual-evidence.json"), JSON.stringify({ captures, metrics }, null, 2));
	const session = await (await page.request.get("/api/auth/get-session")).json();
	expect(session.user.email).toBe(demoCredentials.email);
	for (const locale of ["ar-SA", "en-US"]) {
		await expect(
			await page.request.post("/api/auth/update-user", {
				headers: { origin: baseURL ?? "" },
				data: { uiLocale: locale },
			}),
		).toBeOK();
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			for (const [surface, path] of [
				["landing", "/"],
				["auth", "/auth/login"],
				["dashboard", "/dashboard"],
				["letter", `/builder/letter/${letters[0].id}`],
				["legal", "/privacy-and-terms?tab=terms"],
			]) {
				await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
				await settleScreen(page);
				await expect(page).toHaveTitle(locale === "ar-SA" ? /سيراوايز/ : /Sirawise/);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				const geometry = await page.evaluate(() => ({
					width: innerWidth,
					scrollWidth: document.documentElement.scrollWidth,
				}));
				expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
				await testInfo.attach(`layout-${surface}-${locale}-${width}`, {
					body: JSON.stringify(geometry),
					contentType: "application/json",
				});
			}
		}
	}
});

test("captures bilingual public brand and recovery surfaces", async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	for (const locale of ["ar-SA", "en-US"]) {
		for (const width of [1440, 390]) {
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.emulateMedia({ reducedMotion: "reduce" });
			for (const [index, path] of [
				"/",
				"/privacy-and-terms?tab=terms",
				"/privacy-and-terms?tab=privacy",
				"/help",
				"/auth/login",
				"/auth/register",
				"/auth/forgot-password",
				"/auth/reset-password?token=invalid",
				"/auth/verify-email",
			].entries()) {
				await page.goto(`${path}${path.includes("?") ? "&" : "?"}locale=${locale}`);
				await settleScreen(page);
				await expect(page).toHaveTitle(locale === "ar-SA" ? /سيراوايز/ : /Sirawise/);
				await page.screenshot({
					path: testInfo.outputPath(`${locale}-${width}-public-${index}.jpg`),
					type: "jpeg",
					quality: 55,
					animations: "disabled",
				});
			}
		}
	}
});
