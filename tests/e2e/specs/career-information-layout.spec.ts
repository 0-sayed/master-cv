import type { RouterClient } from "@orpc/server";
import type { Page, TestInfo } from "@playwright/test";
import type router from "@reactive-resume/api/routers";
import type { MasterFactInput } from "@reactive-resume/schema/career-master";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { demoCredentials, demoAccountName } from "../../../tooling/local/demo-fixture";
import { loginViaUi } from "../fixtures/auth";
import { detectAuthenticatedPage } from "../fixtures/design-detector";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

const sections = ["experience", "education", "skills", "languages", "certifications"] as const;
function client(page: Page): RouterClient<typeof router> {
	return createORPCClient(
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
}
async function capture(page: Page, info: TestInfo, locale: string, width: number, state: string) {
	await settleScreen(page);
	await page.evaluate(() => document.fonts.ready);
	await page.screenshot({ path: info.outputPath(`career-info-${locale}-${width}-${state}.png`), fullPage: true });
	await page.screenshot({
		path: info.outputPath(`career-info-${locale}-${width}-${state}-viewport.png`),
		fullPage: false,
	});
}
test("dense master keeps facts and CVs intact across all four layouts", async ({ page, baseURL }, info) => {
	test.setTimeout(300_000);
	if (!baseURL) throw new Error("MISSING_BROWSER_BASE_URL");
	const seed = () =>
		execFileSync(process.execPath, ["tooling/local/demo-seed.mjs"], {
			encoding: "utf8",
			env: { ...process.env, NODE_ENV: "test", npm_config_verify_deps_before_run: "false" },
		});
	expect(seed()).toMatch(/Demo (created|skipped):/);
	expect(seed()).toContain("Demo skipped:");
	await loginViaUi(page, { ...demoCredentials, name: demoAccountName });
	const api = client(page);
	const before = await api.career.master.read({});
	expect(before.facts).toHaveLength(125);
	expect(before.facts.filter((fact) => fact.structured)).toHaveLength(125);
	expect(before.facts.filter((fact) => !fact.structured)).toHaveLength(0);
	const ids = [...new Set(before.links.map((link) => link.resumeId))];
	expect(ids).toHaveLength(3);
	const cvs = await Promise.all(ids.map((id) => api.resume.getById({ id })));
	const totals = sections.map(
		(section) =>
			new Set(before.facts.flatMap((fact) => (fact.structured?.section === section ? [fact.structured.entityId] : [])))
				.size,
	);
	expect(totals).toEqual([8, 3, 18, 2, 6]);
	const metrics: unknown[] = [];
	const touchSession = await page.context().newCDPSession(page);
	for (const locale of ["ar-SA", "en-US"])
		for (const width of [1440, 390]) {
			const ar = locale === "ar-SA";
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.setViewportSize({ width, height: 950 });
			await touchSession.send("Emulation.setTouchEmulationEnabled", { enabled: width === 390 });
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			await settleScreen(page);
			await page.locator("#main-content").evaluate((element) => {
				element.scrollTop = 0;
			});
			await expect(page.locator("html")).toHaveAttribute("dir", ar ? "rtl" : "ltr");
			await expect(page.locator('[id^="career-section-"]')).toHaveCount(5);
			await expect(page.locator('[id^="career-heading-"]')).toHaveCount(7);
			expect(
				await page
					.locator('[id^="career-section-"]')
					.evaluateAll((groups) => groups.map((group) => group.querySelectorAll("article").length)),
			).toEqual([3, 2, 8, 2, 3]);
			await capture(page, info, locale, width, "initial");
			const geometry = await page.evaluate(() => {
				const nav = document.querySelector('[data-slot="career-section-index"]');
				const header = document.querySelector('[data-slot="shell-search"]');
				const content = document.querySelector('[data-slot="dashboard-content"]');
				const skills = document.querySelector("#career-entries-skills");
				const sidebar = document.querySelector("aside");
				const box = (element: Element | null) => {
					const r = element?.getBoundingClientRect();
					return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
				};
				return {
					overflow: document.documentElement.scrollWidth - innerWidth,
					nav: box(nav),
					header: box(header),
					content: box(content),
					sidebar: box(sidebar),
					skillsColumns: skills ? getComputedStyle(skills).gridTemplateColumns.split(" ").length : 0,
					fonts: document.fonts.status,
					coarse: matchMedia("(pointer: coarse)").matches,
				};
			});
			expect(geometry.overflow).toBe(0);
			expect(geometry.fonts).toBe("loaded");
			expect(geometry.skillsColumns).toBe(width === 1440 ? 2 : 1);
			if (width === 390) expect(geometry.coarse).toBe(true);
			metrics.push({ locale, width, totals, geometry });
			const firstEntry = page.locator("#career-section-experience article").first();
			const more = firstEntry.getByRole("button", { name: ar ? /^عرض (المزيد|أقل)$/ : /^See (more|less)$/ });
			await expect(more).toBeVisible();
			await more.click();
			await expect(more).toHaveAttribute("aria-expanded", "true");
			await more.click();
			const usage = firstEntry.getByRole("button", { name: ar ? /في .*سير/ : /In .* CV/ });
			await usage.focus();
			await page.keyboard.press("Enter");
			const disclosure = page.getByRole("dialog", { name: ar ? "السير المرتبطة" : "Linked CVs" });
			await expect(disclosure).toBeVisible();
			const linkedIds = [
				...new Set(
					before.links
						.filter((link) =>
							before.facts.some(
								(fact) =>
									fact.id === link.factId &&
									fact.structured?.entityId ===
										before.sections.find((entry) => entry.section === "experience")?.entityIds[0],
							),
						)
						.map((link) => link.resumeId),
				),
			];
			await expect(disclosure.getByRole("link")).toHaveCount(linkedIds.length);
			for (const id of linkedIds) await expect(disclosure.locator(`a[href="/builder/${id}"]`)).toBeVisible();
			await capture(page, info, locale, width, "usage");
			if (width === 390) {
				await page.keyboard.press("Tab");
				expect(await disclosure.evaluate((element) => element.contains(document.activeElement))).toBe(true);
			}
			await page.keyboard.press("Escape");
			await expect(disclosure).not.toBeVisible();
			await expect(usage).toBeFocused();
			await firstEntry.getByRole("button", { name: ar ? /^تعديل / : /^Edit / }).click();
			await capture(page, info, locale, width, "edit");
			await page
				.getByRole("dialog")
				.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true })
				.click();
			const index = page.locator('[data-slot="career-section-index"]');
			await index.locator('a[href="#career-section-skills"]').click();
			await expect(page.locator("#career-heading-skills")).toBeFocused();
			await expect(index.locator('a[href="#career-section-skills"]')).toHaveAttribute("aria-current", "location");
			const skills = page.locator("#career-section-skills");
			await skills.getByRole("button", { name: ar ? "عرض الكل (18)" : "Show all 18", exact: true }).click();
			await expect(skills.getByRole("article")).toHaveCount(18);
			await capture(page, info, locale, width, "skills-expanded");
			await skills.getByRole("article").last().scrollIntoViewIfNeeded();
			await capture(page, info, locale, width, "older-skills");
			const fewer = skills.getByRole("button", { name: ar ? "عرض أقل" : "Show fewer", exact: true });
			await fewer.focus();
			await page.keyboard.press("Enter");
			await expect(
				skills.getByRole("button", { name: ar ? "عرض الكل (18)" : "Show all 18", exact: true }),
			).toBeFocused();
			await index.locator('a[href="#career-section-certifications"]').click();
			const certificates = page.locator("#career-section-certifications");
			await certificates.getByRole("button", { name: ar ? "عرض الكل (6)" : "Show all 6", exact: true }).click();
			await certificates.getByRole("article").last().scrollIntoViewIfNeeded();
			await capture(page, info, locale, width, "last-controls");
			const lastControl = certificates.getByRole("button", { name: ar ? "عرض أقل" : "Show fewer", exact: true });
			await lastControl.scrollIntoViewIfNeeded();
			const bounds = await lastControl.boundingBox();
			const bottomNavigation = page.locator('[data-slot="app-bottom-nav"]');
			const bottomNav = (await bottomNavigation.count()) ? await bottomNavigation.boundingBox() : null;
			if (bounds && bottomNav) expect(bounds.y + bounds.height).toBeLessThanOrEqual(bottomNav.y);
		}
	await touchSession.detach();
	expect(await api.career.master.read({})).toEqual(before);
	expect(await Promise.all(ids.map((id) => api.resume.getById({ id })))).toEqual(cvs);
	await writeFile(info.outputPath("career-layout-metrics.json"), JSON.stringify(metrics, null, 2));
	await detectAuthenticatedPage(page, baseURL, info, {
		name: "career",
		pathname: "/dashboard/career/information",
		readPath: "/career/master/read",
	});
});

test("mock-shaped inventory keeps thresholds, pending review and recovery reachable", async ({
	authPage: page,
	baseURL,
}, info) => {
	test.setTimeout(240_000);
	await page.goto("/dashboard/career/information?locale=en-US");
	const api = client(page);
	const totals = [8, 3, 24, 3, 7];
	for (const [sectionIndex, section] of sections.entries())
		for (let index = 0; index < (totals[sectionIndex] ?? 0); index++) {
			const entityId = `${section}-${index}`;
			const primary =
				section === "experience"
					? "position"
					: section === "education"
						? "degree"
						: section === "skills"
							? "name"
							: section === "languages"
								? "language"
								: "title";
			const fields: Array<[string, string]> = [
				[primary, `${section} ${index} · قيادة تحسين الخدمات والمنتجات الرقمية`],
			];
			if (section === "experience" || section === "education" || section === "certifications")
				fields.push([
					"description",
					index === 0 && section === "certifications"
						? "شهادة في إدارة الخدمات."
						: "أقود تطوير الخدمات وتحسين العمليات مع فرق متعددة التخصصات. ".repeat(18),
				]);
			for (const [field, value] of fields)
				await api.career.master.savePending({
					fact: {
						section,
						entityId,
						field,
						value,
						source: { kind: "manual", id: "layout-inventory", quote: value },
					} as MasterFactInput,
				});
		}
	let master = await api.career.master.read({});
	const entityIds = [...new Set(master.facts.map((fact) => fact.proposedStructured?.entityId))];
	for (const entityId of entityIds) {
		const batch = master.facts.filter((fact) => fact.proposedStructured?.entityId === entityId);
		const result = await api.career.master.confirm({
			expectedProfileRevision: master.profileRevision,
			facts: batch.map(({ id, revision, draftRevision }) => ({
				id,
				expectedRevision: revision,
				expectedDraftRevision: draftRevision,
			})),
		});
		master = result;
	}
	const target = master.facts.find(
		(fact) => fact.structured?.entityId === "experience-6" && fact.structured.field === "position",
	);
	if (!target?.structured) throw new Error("MISSING_PENDING_TARGET");
	await api.career.master.savePending({
		fact: { ...target.structured, value: "Proposed service director" },
		version: { id: target.id, expectedRevision: target.revision, expectedDraftRevision: target.draftRevision },
	});
	await page.reload();
	await settleScreen(page);
	await expect(page.locator("#career-section-experience article")).toHaveCount(3);
	const pending = page.getByRole("button", { name: "Review pending entries (1)" });
	await pending.click();
	await expect(page.locator("#career-entry-experience-experience-6")).toBeFocused();
	expect((await api.career.master.read({})).facts.find((fact) => fact.id === target.id)?.structured).toEqual(
		target.structured,
	);
	const firstCertificate = page.locator("#career-section-certifications article").first();
	await expect(firstCertificate.getByRole("button", { name: "See more" })).toHaveCount(0);
	await page.locator("#career-section-experience").getByRole("button", { name: "See more" }).first().click();
	expect((await api.career.master.read({})).facts.find((fact) => fact.id === target.id)?.structured).toEqual(
		target.structured,
	);
	if (!baseURL) throw new Error("MISSING_BROWSER_BASE_URL");
	await capture(page, info, "en-US", 1440, "pending-review");
});

for (const locale of ["ar-SA", "en-US"])
	for (const width of [1440, 390]) {
		test(`career recovery states ${locale} at ${width}`, async ({ authPage: page, baseURL }, info) => {
			test.setTimeout(120_000);
			const ar = locale === "ar-SA";
			if (!baseURL) throw new Error("MISSING_BROWSER_BASE_URL");
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.setViewportSize({ width, height: 950 });
			let mode: "hold" | "pass" | "fail" = "hold";
			let release = () => {};
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			await page.route("**/api/rpc/**", async (route) => {
				if (
					!route.request().url().endsWith("/career/master/read") &&
					!route.request().postData()?.includes("/career/master/read")
				) {
					await route.continue();
					return;
				}
				if (mode === "hold") await held;
				if (mode === "fail") await route.abort("failed");
				else await route.continue();
			});
			await page.goto(`/dashboard/career/information?locale=${locale}`);
			try {
				await capture(page, info, locale, width, "loading");
			} finally {
				mode = "pass";
				release();
			}
			await expect(page.locator('[id^="career-section-"]')).toHaveCount(5);
			await capture(page, info, locale, width, "empty");
			mode = "fail";
			await page.reload();
			const retry = page.getByRole("button", { name: ar ? "حاول مرة أخرى" : "Try again", exact: true });
			await expect(retry).toBeVisible({ timeout: 20_000 });
			await capture(page, info, locale, width, "initial-error");
			mode = "pass";
			await retry.click();
			await page.getByRole("button", { name: ar ? "إضافة خبرة" : "Add experience", exact: true }).click();
			await page.locator('input[name="position"]').fill("Service delivery director");
			await page.locator('input[name="company"]').fill("شركة مدار الخدمات");
			await page
				.locator('textarea[name="description"]')
				.fill("تحسين العمليات والخدمات مع فرق متعددة التخصصات. ".repeat(20));
			await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
			await capture(page, info, locale, width, "review");
			await page.getByRole("button", { name: ar ? "تأكيد التغييرات" : "Confirm changes", exact: true }).click();
			await expect(page.getByRole("dialog")).not.toBeVisible();
			const more = page
				.locator("#career-section-experience")
				.getByRole("button", { name: ar ? /^عرض (المزيد|أقل)$/ : /^See (more|less)$/ });
			await more.click();
			await page
				.getByRole("button", {
					name: ar ? "تعديل Service delivery director" : "Edit Service delivery director",
					exact: true,
				})
				.click();
			await page.locator('input[name="company"]').fill("شركة مدار للخدمات الرقمية");
			await page.getByRole("button", { name: ar ? "مراجعة التغييرات" : "Review changes", exact: true }).click();
			mode = "fail";
			await page.getByRole("button", { name: ar ? "تأكيد التغييرات" : "Confirm changes", exact: true }).click();
			await expect(page.getByRole("dialog")).not.toBeVisible();
			await expect(retry).toBeVisible({ timeout: 20_000 });
			await expect(page.getByRole("heading", { name: "Service delivery director", exact: true })).toBeVisible();
			await expect(more).toHaveAttribute("aria-expanded", "true");
			await capture(page, info, locale, width, "cached-error");
			mode = "pass";
			await retry.click();
			await expect(retry).not.toBeVisible();
			await expect(page.getByText("شركة مدار للخدمات الرقمية", { exact: true })).toBeVisible();
			await expect(more).toHaveAttribute("aria-expanded", "true");
		});
	}
