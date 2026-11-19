import type { Locator, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createSampleResumeFromDashboard, openDownloadDialog } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

function exportPanel(page: Page) {
	return page
		.getByRole("complementary", { name: "Export and history" })
		.or(page.getByRole("dialog", { name: "Export and history" }));
}

async function selectVersion(panel: Locator, name: string) {
	await panel.getByRole("tab", { name: "History", exact: true }).click();
	await panel.getByRole("button", { name: new RegExp(`^${name}`) }).click();
	await expect(panel.getByText(/read-only/)).toBeVisible();
}

async function seedVersions(page: Page) {
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	if (!resumeId) throw new Error("The builder did not open a CV");
	const api = variantClient(page);
	const original = await api.resume.createVersion({ resumeId, name: "Original sent CV" });
	const current = await api.resume.getById({ id: resumeId });
	const data = structuredClone(current.data);
	data.basics.name = "Later current work";
	await api.resume.update({ id: resumeId, data, expectedUpdatedAt: current.updatedAt });
	await page.reload();
	return { resumeId, api, original, data };
}

test("both desktop entry points preserve the panel slot and export the visible PDF filename", async ({
	authPage: page,
}, info) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await createSampleResumeFromDashboard(page, info);
	await page.getByRole("button", { name: "History", exact: true }).click();
	const panel = exportPanel(page);
	await expect(panel.getByRole("tab", { name: "History", exact: true })).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("dialog", { name: "Export and history" })).toHaveCount(0);
	await panel.getByRole("button", { name: "Close", exact: true }).click();
	await openDownloadDialog(page);
	const filename = panel.getByRole("textbox", { name: "File name", exact: true });
	await filename.fill("سيرة-Synthetic.PDF.pdf");
	await filename.press("Tab");
	await expect(filename).toHaveValue("سيرة-Synthetic");
	await expect(panel.getByText("سيرة-Synthetic.pdf", { exact: true })).toBeVisible();
	await expect(panel.getByRole("radio")).toHaveCount(0);
	const event = page.waitForEvent("download");
	await panel.getByRole("button", { name: "Download PDF", exact: true }).click();
	const download = await event;
	expect(download.suggestedFilename()).toBe("سيرة-Synthetic.pdf");
	const path = await download.path();
	if (!path) throw new Error("The PDF download did not produce a file");
	expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");
});

test("PDF preparation disables duplicate export and recovers after a download failure", async ({
	authPage: page,
}, info) => {
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route(/\/pdf\.worker(?:\.ts|-[^/]+\.js)/u, async (route) => {
		await gate;
		await route.continue();
	});
	await createSampleResumeFromDashboard(page, info);
	const panel = await openDownloadDialog(page);
	await panel.getByRole("button", { name: "Download PDF", exact: true }).click();
	const preparing = panel.getByRole("button", { name: "Download PDF", exact: true });
	await expect(preparing).toHaveAttribute("aria-busy", "true");
	await expect(preparing).toContainText("Preparing PDF");
	await expect(preparing).toBeDisabled();
	await page.evaluate(() => {
		const click = HTMLAnchorElement.prototype.click;
		HTMLAnchorElement.prototype.click = function () {
			if (this.download.endsWith(".pdf")) {
				HTMLAnchorElement.prototype.click = click;
				throw new Error("Synthetic download failure");
			}
			return click.call(this);
		};
	});
	release?.();
	await expect(panel.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
	const event = page.waitForEvent("download");
	await panel.getByRole("button", { name: "Try again", exact: true }).click();
	expect((await event).suggestedFilename()).toMatch(/\.pdf$/);
});

test("named history survives reload and uses confirmation, exact undo, and immutable sent data", async ({
	authPage: page,
}, info) => {
	await createSampleResumeFromDashboard(page, info);
	const { resumeId, api, original, data } = await seedVersions(page);
	const applicationId = await api.applications.create({
		company: "Synthetic Export Company",
		role: "Engineer",
		resumeId,
	});
	const application = await api.applications.getById({ id: applicationId });
	await api.applications.update({
		id: applicationId,
		selectedResumeVersionId: original.id,
		expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
	});
	const selected = await api.applications.getById({ id: applicationId });
	await api.applications.update({
		id: applicationId,
		status: "applied",
		expectedUpdatedAt: new Date(selected.updatedAt).toISOString(),
	});
	const sentId = (await api.applications.getById({ id: applicationId })).sentResumeVersionId;
	if (!sentId) throw new Error("The application did not record its sent CV");
	const sentBefore = await api.resume.getVersion({ resumeId, versionId: sentId });
	let panel = await openDownloadDialog(page);
	await panel.getByRole("tab", { name: "History", exact: true }).click();
	const mixedName = "نسخة Synthetic Mixed " + "x".repeat(55);
	await panel.getByRole("textbox", { name: "Name this version" }).fill(mixedName);
	await panel.getByRole("button", { name: "Save", exact: true }).click();
	await expect(panel.getByRole("button", { name: new RegExp(`^${mixedName}`) })).toBeVisible();
	await page.reload();
	panel = await openDownloadDialog(page);
	await panel.getByRole("tab", { name: "History", exact: true }).click();
	await expect(panel.getByRole("button", { name: new RegExp(`^${mixedName}`) })).toBeVisible();
	await selectVersion(panel, "Original sent CV");
	await panel.getByRole("button", { name: "Restore this version", exact: true }).click();
	let confirmation = page.getByRole("alertdialog");
	await expect(confirmation).toContainText("Before restore");
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(data);
	await panel.getByRole("button", { name: "Restore this version", exact: true }).click();
	confirmation = page.getByRole("alertdialog");
	await confirmation.getByRole("button", { name: "Restore", exact: true }).click();
	await expect(panel.getByRole("button", { name: "Undo restore", exact: true })).toBeVisible();
	const restored = await api.resume.getById({ id: resumeId });
	const originalData = await api.resume.getVersion({ resumeId, versionId: original.id });
	expect(restored.data).toEqual(originalData.data);
	await panel.getByRole("button", { name: "Undo restore", exact: true }).click();
	await expect.poll(async () => (await api.resume.getById({ id: resumeId })).data).toEqual(data);
	expect((await api.resume.getVersion({ resumeId, versionId: sentId })).data).toEqual(sentBefore.data);
	expect((await api.applications.getById({ id: applicationId })).sentResumeVersionId).toBe(sentId);
});

test("a stale undo preserves newer server work and shows recovery", async ({ authPage: page }, info) => {
	await createSampleResumeFromDashboard(page, info);
	const { resumeId, api } = await seedVersions(page);
	const panel = await openDownloadDialog(page);
	await selectVersion(panel, "Original sent CV");
	await panel.getByRole("button", { name: "Restore this version", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();
	await expect(panel.getByRole("button", { name: "Undo restore", exact: true })).toBeVisible();
	const current = await api.resume.getById({ id: resumeId });
	const newer = structuredClone(current.data);
	newer.basics.name = "Newer work from another visit";
	await api.resume.update({ id: resumeId, data: newer, expectedUpdatedAt: current.updatedAt });
	await expect(page.getByText("Synced changes made in another tab.", { exact: true })).toBeVisible();
	await panel.getByRole("button", { name: "Undo restore", exact: true }).click();
	await expect(panel.getByRole("alert")).toContainText("Could not update version history");
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(newer);
	await panel.getByRole("tab", { name: "Download", exact: true }).click();
	const download = panel.getByRole("button", { name: "Download PDF", exact: true });
	await expect(download).toBeEnabled();
	const event = page.waitForEvent("download");
	await download.click();
	const path = await (await event).path();
	if (!path) throw new Error("The acknowledged PDF was not downloaded");
	expect(execFileSync("pdftotext", ["-enc", "UTF-8", path, "-"], { encoding: "utf8" })).toContain(newer.basics.name);
});

test("failed snapshots retain selection and offer retry and the current CV", async ({ authPage: page }, info) => {
	await createSampleResumeFromDashboard(page, info);
	await seedVersions(page);
	await page.route("**/api/rpc/resume/getVersion*", (route) => route.abort());
	const panel = await openDownloadDialog(page);
	await selectVersion(panel, "Original sent CV");
	await expect(page.getByText("Could not load this saved version", { exact: true })).toBeVisible();
	await expect(panel.getByRole("button", { name: /^Original sent CV/ })).toHaveAttribute("aria-pressed", "true");
	await page.unroute("**/api/rpc/resume/getVersion*");
	await page.getByRole("button", { name: "Try again", exact: true }).click();
	await expect(page.getByText("Could not load this saved version", { exact: true })).toHaveCount(0);
	await panel.getByRole("button", { name: "Back to current", exact: true }).click();
	await expect(panel.getByText(/read-only/)).toHaveCount(0);
});

test("history and restore failures retain current work and expose retry", async ({ authPage: page }, info) => {
	await createSampleResumeFromDashboard(page, info);
	const { resumeId, api, data } = await seedVersions(page);
	await page.route("**/api/rpc/resume/listVersions*", (route) => route.abort());
	const panel = await openDownloadDialog(page);
	await panel.getByRole("tab", { name: "History", exact: true }).click();
	await expect(panel.getByRole("alert")).toContainText("Couldn't load version history");
	await page.unroute("**/api/rpc/resume/listVersions*");
	await panel.getByRole("button", { name: "Try again", exact: true }).click();
	await selectVersion(panel, "Original sent CV");
	await page.route("**/api/rpc/resume/restoreVersion*", (route) => route.abort());
	await panel.getByRole("button", { name: "Restore this version", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Restore", exact: true }).click();
	await expect(panel.getByRole("alert")).toContainText("Could not update version history");
	await expect(panel.getByRole("button", { name: /^Original sent CV/ })).toHaveAttribute("aria-pressed", "true");
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(data);
	await page.unroute("**/api/rpc/resume/restoreVersion*");
	await panel.getByRole("button", { name: "Try again", exact: true }).click();
	await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
	expect((await api.resume.getById({ id: resumeId })).data).toEqual(data);
});

test("mobile preview and real Review preserve the filename, snapshot, and focus", async ({ authPage: page }, info) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await createSampleResumeFromDashboard(page, info);
	await seedVersions(page);
	const panel = await openDownloadDialog(page);
	await panel.getByRole("textbox", { name: "File name", exact: true }).fill("My Arabic-English CV");
	await panel.getByRole("button", { name: "Preview PDF", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "Export and history" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Back to panel", exact: true })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(panel.getByRole("button", { name: "Preview PDF", exact: true })).toBeFocused();
	await expect(panel.getByRole("textbox", { name: "File name", exact: true })).toHaveValue("My Arabic-English CV");
	await panel.getByRole("button", { name: "Review", exact: true }).click();
	await expect(panel).toHaveCount(0);
	await page.getByRole("button", { name: "Back to Download", exact: true }).click();
	await expect(panel.getByRole("button", { name: "Review", exact: true })).toBeFocused();
	await selectVersion(panel, "Original sent CV");
	await panel
		.getByRole("listitem")
		.filter({ has: page.getByRole("button", { name: /^Original sent CV/u }) })
		.getByRole("button", { name: "More actions", exact: true })
		.click();
	await expect(page.getByRole("menuitem", { name: "Rename…", exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(panel).toBeVisible();
	await panel.getByRole("button", { name: "Preview version", exact: true }).click();
	await page.getByRole("button", { name: "Back to panel", exact: true }).click();
	await expect(panel.getByRole("button", { name: "Preview version", exact: true })).toBeFocused();
	await expect(panel.getByRole("button", { name: /^Original sent CV/ })).toHaveAttribute("aria-pressed", "true");
	await panel.getByRole("tab", { name: "History", exact: true }).focus();
	for (let index = 0; index < 12; index++) {
		await page.keyboard.press("Tab");
		expect(await panel.evaluate((node) => node.contains(document.activeElement))).toBe(true);
	}
	await page.keyboard.press("Escape");
	await expect(panel).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeFocused();
});

for (const locale of ["en-US", "ar-SA"] as const) {
	for (const width of [1440, 390]) {
		test(`private export keyboard and direction at ${locale} ${width}`, async ({ authPage: page }, info) => {
			await page.setViewportSize({ width, height: 1000 });
			await createSampleResumeFromDashboard(page, info);
			await page.context().addCookies([{ name: "locale", value: locale, url: new URL(page.url()).origin }]);
			await page.reload();
			await settleScreen(page);
			const entry =
				width === 1440
					? locale === "ar-SA"
						? "المزيد من صيغ التحميل"
						: "More download formats"
					: locale === "ar-SA"
						? "تنزيل PDF"
						: "Download PDF";
			await page.getByRole("button", { name: entry, exact: true }).click();
			const panel = page.locator('[data-slot="editor-panel"]');
			const tabs = panel.getByRole("tab");
			await tabs.first().focus();
			await page.keyboard.press("End");
			await expect(tabs.last()).toBeFocused();
			await page.keyboard.press("Enter");
			await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
			await page.keyboard.press("Home");
			await expect(tabs.first()).toBeFocused();
			await page.keyboard.press("Space");
			await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
			await page.keyboard.press(locale === "ar-SA" ? "ArrowLeft" : "ArrowRight");
			await expect(tabs.last()).toBeFocused();
			await page.keyboard.press("Enter");
			await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
		});
	}
}

test("the letter sheet retains generic formats and named history", async ({ authPage: page }, info) => {
	await createSampleResumeFromDashboard(page, info);
	const api = variantClient(page);
	const letter = await api.coverLetters.create({
		name: "Synthetic letter export",
		documentLocale: "en-US",
		content: "<p>Synthetic cover letter.</p>",
	});
	await page.goto(`/builder/letter/${letter.id}`);
	await page.getByRole("button", { name: "Share", exact: true }).click();
	const sheet = page.getByRole("dialog");
	await expect(sheet.getByRole("radio", { name: /PDF/ })).toBeVisible();
	await sheet.getByRole("tab", { name: "History", exact: true }).click();
	await sheet.getByRole("textbox", { name: "Name this version" }).fill("Letter draft");
	await sheet.getByRole("button", { name: "Save", exact: true }).click();
	await expect(sheet.getByRole("button", { name: /^Letter draft/ })).toBeVisible();
});
