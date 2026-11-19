import type { Page, TestInfo } from "@playwright/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { seedExistingResume } from "../fixtures/existing-inventory";
import { failRpcRead } from "../fixtures/rpc-failure";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

const savedTitle = "سيرة مهنية · English operations and service improvement, a complete accessible title";
async function seedLibrary(page: Page, includeSecondCv = true) {
	const data = structuredClone(defaultResumeData);
	data.metadata.template = "onyx";
	data.metadata.page.locale = "ar-SA";
	const id = await seedExistingResume(page, savedTitle, data);
	if (includeSecondCv)
		await seedExistingResume(page, "English CV", {
			...data,
			metadata: { ...data.metadata, page: { ...data.metadata.page, locale: "en-US" } },
		});
	await variantClient(page).coverLetters.create({
		name: "Synthetic English letter",
		documentLocale: "en-US",
		content: "<p>Synthetic letter body.</p>",
	});
	return id;
}
async function capture(page: Page, info: TestInfo, name: string) {
	await settleScreen(page);
	await info.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
async function noOverflow(page: Page) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	const geometry = await page.evaluate(() => {
		const header = document.querySelector('[data-slot="dashboard-header-content"]')?.getBoundingClientRect();
		const body = document.querySelector('[data-slot="dashboard-content"]')?.getBoundingClientRect();
		const sidebar = document.querySelector('aside[aria-label], [data-slot="sidebar"]')?.getBoundingClientRect();
		const rtl = document.documentElement.dir === "rtl";
		return {
			edgeDelta: header && body ? Math.abs((rtl ? header.right : header.left) - (rtl ? body.right : body.left)) : null,
			sidebarWidth: sidebar?.width ?? 0,
		};
	});
	if (geometry.edgeDelta !== null) expect(geometry.edgeDelta).toBeLessThanOrEqual(1);
	if (page.viewportSize()?.width === 1440 && geometry.sidebarWidth > 0) expect(geometry.sidebarWidth).toBe(236);
}

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 1920, 390]) {
		test(`${locale} ${width} compact library preserves saved identity, All-only Type and request boundaries`, async ({
			authPage: page,
		}, info) => {
			await seedLibrary(page);
			const reads: string[] = [];
			page.on("request", (request) => {
				const path = new URL(request.url()).pathname;
				if (
					/\/api\/rpc\/(resume\/getById|coverLetters\/(getById|listVersions|getVersion)|translations\/|words\/)/.test(
						path,
					)
				)
					reads.push(path);
			});
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			await page.goto(`/dashboard?locale=${locale}&view=grid`);
			const cards = page.locator('main [data-slot="document-card"]');
			await expect(cards).toHaveCount(3);
			const cardGeometry = await cards.evaluateAll((elements) =>
				elements.map((element) => {
					const card = element.getBoundingClientRect();
					const timestamp = element.querySelector('time[data-slot="document-meta"]');
					if (!timestamp) throw new Error("Document timestamp missing");
					const date = timestamp.getBoundingClientRect();
					return {
						top: card.top,
						height: card.height,
						left: date.left - card.left,
						right: card.right - date.right,
						dateTop: date.top - card.top,
						bottom: card.bottom - date.bottom,
						fits: timestamp.scrollWidth <= timestamp.clientWidth,
					};
				}),
			);
			for (const card of cardGeometry) {
				for (const edge of [card.left, card.right, card.dateTop, card.bottom]) expect(edge).toBeGreaterThanOrEqual(0);
				expect(card.fits).toBe(true);
				for (const peer of cardGeometry)
					if (Math.abs(card.top - peer.top) <= 1) expect(Math.abs(card.height - peer.height)).toBeLessThanOrEqual(1);
			}
			for (const timestamp of await cards.locator('time[data-slot="document-meta"]').all()) {
				await expect(timestamp).toHaveAttribute("aria-label", /\S/u);
				await expect(timestamp).toHaveCSS("white-space", "normal");
			}
			await expect(cards.locator("img, canvas")).toHaveCount(0);
			await expect(
				cards.locator('[data-slot="document-type"], [data-slot$="-thumbnail"], [data-slot="preview-placeholder"]'),
			).toHaveCount(0);
			await expect(cards.first().locator('[data-slot="document-template"]')).toHaveCount(0);
			await expect(cards.first().locator('time[data-slot="document-meta"]')).toHaveAttribute(
				"datetime",
				/^\d{4}-\d{2}-\d{2}T/u,
			);
			const title = page.getByRole("link", { name: savedTitle, exact: true });
			await expect(title).toHaveAttribute("dir", "auto");
			await title.focus();
			await expect(page.getByRole("tooltip")).toHaveText(savedTitle);
			await page.keyboard.press("Escape");
			await expect(cards.first().getByRole("button", { name: /^(More actions|المزيد من الإجراءات)$/u })).toHaveAttribute(
				"data-size",
				"icon-sm",
			);
			await capture(page, info, `grid-${locale}-${width}`);
			const grid = page.locator('main [data-slot="collection-grid"]').first();
			const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
			expect(columns).toBe(width === 390 ? 1 : width >= 1600 ? 5 : 4);
			await noOverflow(page);
			// Exact zero PDF/raster calls belong to the component spies. These assertions cover network work.
			await page.getByRole("radio", { name: locale === "ar-SA" ? "قائمة" : "List", exact: true }).click();
			for (const type of ["all", "resume", "letter"] as const) {
				await page
					.getByRole("tab")
					.nth(type === "all" ? 0 : type === "resume" ? 1 : 2)
					.click();
				const rows = page.locator("main tbody tr");
				await expect(rows).toHaveCount(type === "all" ? 3 : type === "resume" ? 2 : 1);
				await expect(
					page.getByRole("columnheader", { name: locale === "ar-SA" ? "النوع" : "Type", exact: true }),
				).toHaveCount(type === "all" ? 1 : 0);
				await expect(rows.locator('[data-slot="document-type"]')).toHaveCount(type === "all" ? 3 : 0);
				if (type === "all") await expect(rows.locator('[data-slot="document-type"]').first()).toBeVisible();
				await capture(page, info, `list-${type}-${locale}-${width}`);
				await noOverflow(page);
			}
			await page.getByRole("tab").first().click();
			await page.getByRole("searchbox").fill("no synthetic match");
			await expect(page.getByRole("button", { name: /Clear search and filters|مسح البحث/ })).toBeVisible();
			await expect(page.getByRole("searchbox")).toHaveValue("no synthetic match");
			await capture(page, info, `no-matches-${locale}-${width}`);
			await page.getByRole("searchbox").fill("");
			await page
				.getByRole("combobox", { name: locale === "ar-SA" ? "ترتيب" : "Sort", exact: true })
				.selectOption("name");
			await page.getByRole("radio", { name: locale === "ar-SA" ? "الشبكة" : "Grid", exact: true }).click();
			await cards.last().scrollIntoViewIfNeeded();
			await expect(cards.locator("img, canvas")).toHaveCount(0);
			expect(reads).toEqual([]);
		});
	}

test.describe("touch controls", () => {
	test.use({ hasTouch: true });
	test("keyboard and touch card controls preserve selection, focus, mutations and feature gates", async ({
		authPage: page,
	}, info) => {
		const id = await seedLibrary(page, false);
		const api = variantClient(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/dashboard?locale=en-US&view=grid");
		let card = page.getByRole("article", { name: savedTitle, exact: true });
		const menu = () => card.getByRole("button", { name: "More actions", exact: true });
		await menu().focus();
		await page.keyboard.press("Enter");
		await expect(page.getByRole("menu")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(menu()).toBeFocused();
		await menu().tap();
		await expect(page.getByRole("menuitem", { name: "Copy public link" })).toHaveCount(0);
		await expect(page.getByRole("menuitem", { name: "Copies and languages" })).toBeVisible();
		await page.getByRole("menuitem", { name: "Select", exact: true }).click();
		await expect(card.getByRole("checkbox")).toBeChecked();
		await card.getByRole("link", { name: savedTitle, exact: true }).tap();
		await expect(page).toHaveURL(/\/dashboard/);
		await expect(card.getByRole("checkbox")).not.toBeChecked();
		await menu().click();
		await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
		const name = `${savedTitle} renamed`;
		await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
		await page.keyboard.press("Enter");
		card = page.getByRole("article", { name, exact: true });
		await expect(card).toBeVisible();
		await menu().click();
		await page.getByRole("menuitem", { name: "Tags…", exact: true }).click();
		const tags = page.getByRole("dialog", { name: "Tags", exact: true });
		await tags.getByRole("textbox").fill("Synthetic tag");
		await page.keyboard.press("Enter");
		await tags.getByRole("button", { name: "Save", exact: true }).click();
		await expect(tags).not.toBeVisible();
		await expect
			.poll(async () => (await api.documents.list({ trashed: false })).find((item) => item.id === id)?.tags)
			.toContain("Synthetic tag");
		await menu().click();
		await page.getByRole("menuitem", { name: "Lock editing", exact: true }).click();
		await menu().click();
		await expect(page.getByRole("menuitem", { name: "Rename", exact: true })).toBeDisabled();
		await expect(page.getByRole("menuitem", { name: "Move to Trash", exact: true })).toBeDisabled();
		await page.getByRole("menuitem", { name: "Unlock", exact: true }).click();
		await menu().click();
		const duplicateResponse = page.waitForResponse((response) => response.url().includes("/resume/duplicate"));
		await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
		const denied = await duplicateResponse;
		expect(denied.status()).toBe(412);
		expect(await denied.json()).toMatchObject({ json: { data: { reason: "BASE_CV_LIMIT" } } });
		await expect(page.getByRole("article", { name: `${name} (copy)`, exact: true })).toHaveCount(0);
		await expect(card).toBeVisible();
		await menu().click();
		await page.getByRole("menuitem", { name: "Move to Trash", exact: true }).click();
		await expect(card).toHaveCount(0);
		await page.getByRole("button", { name: "Undo", exact: true }).click();
		await expect(card).toBeVisible();
		const applicationId = await api.applications.create({ company: "Synthetic employer", role: "Engineer" });
		const letter = page.getByRole("article", { name: "Synthetic English letter", exact: true });
		await letter.getByRole("button", { name: "More actions", exact: true }).click();
		await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click();
		await expect(page.getByRole("article", { name: "Synthetic English letter (copy)", exact: true })).toBeVisible();
		await letter.getByRole("button", { name: "More actions", exact: true }).click();
		await page.getByRole("menuitem", { name: "Link to application…", exact: true }).click();
		const linkDialog = page.getByRole("dialog", { name: "Link to application", exact: true });
		await linkDialog.getByRole("combobox").click();
		await page.getByRole("option", { name: /Engineer.*Synthetic employer/ }).click();
		await expect(linkDialog).not.toBeVisible();
		await expect(letter).toContainText("Engineer · Synthetic employer");
		await capture(page, info, "linked-letter-mobile");
		await api.applications.delete({ id: applicationId });
		await card.getByRole("link", { name, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/builder/${id}`));
	});
});

test("initial error, compact loading and empty letters retain distinct recovery actions", async ({
	authPage: page,
}, info) => {
	const restoreRead = await failRpcRead(page, "documents/list");
	await page.goto("/dashboard?locale=en-US");
	await expect(page.getByRole("alert")).toContainText("Couldn't load documents");
	await capture(page, info, "initial-error");
	await restoreRead();
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(page.getByRole("button", { name: "New CV", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Import PDF", exact: true })).toBeVisible();
	await capture(page, info, "empty-account");
	await page.goto("/dashboard?locale=en-US&type=letter");
	await expect(page.getByRole("button", { name: "New cover letter", exact: true })).toBeVisible();
	await capture(page, info, "empty-letters");
});
