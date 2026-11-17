import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

test("letter cards preserve content languages, sent snapshots and keyboard actions", async ({ authPage: page }) => {
	await page.goto("/dashboard");
	const api = variantClient(page);
	const prefix = `E2E letter cards ${crypto.randomUUID()}`;
	const applicationId = await api.applications.create({ role: "Engineer", company: "Synthetic Company" });
	try {
		const arabic = await api.coverLetters.create({
			name: `${prefix} العربية`,
			documentLocale: "ar-SA",
			content: "<p>السلام عليكم، بنيت خدمات برمجية.</p>",
			applicationId,
		});
		const english = await api.coverLetters.create({
			name: `${prefix} English`,
			documentLocale: "en-US",
			content: "<p>Dear hiring team, I built TypeScript services.</p>",
		});
		await api.coverLetters.create({ name: `${prefix} blank`, documentLocale: "ar-SA", content: "" });
		const job = await api.applications.getById({ id: applicationId });
		await api.applications.update({
			id: applicationId,
			expectedUpdatedAt: job.updatedAt.toISOString(),
			status: "applied",
		});
		const sent = await api.applications.getById({ id: applicationId });
		if (!sent.sentCoverLetterVersionId) throw new Error("Sent snapshot missing");
		const frozen = await api.coverLetters.getVersion({ id: arabic.id, versionId: sent.sentCoverLetterVersionId });
		for (const locale of ["ar-SA", "en-US"])
			for (const width of [1440, 390])
				for (const theme of ["light", "dark"]) {
					await page.context().addCookies([
						{ name: "locale", value: locale, url: new URL(page.url()).origin },
						{ name: "theme", value: theme, url: new URL(page.url()).origin },
					]);
					await page.setViewportSize({ width, height: 1000 });
					await page.goto(`/dashboard?type=letter&locale=${locale}`);
					const cards = page.locator("article").filter({ has: page.locator('[data-slot="letter-thumbnail"]') });
					const sentCard = cards.filter({ has: page.getByRole("heading", { name: arabic.name, exact: true }) });
					const draftCard = cards.filter({ has: page.getByRole("heading", { name: english.name, exact: true }) });
					await expect(sentCard.locator('[data-slot="letter-badges"]')).toContainText("العربية");
					await expect(sentCard.locator('[data-slot="letter-badges"]')).toContainText(
						locale === "ar-SA" ? "مُرسَل" : "Sent",
					);
					await expect(sentCard.locator('[data-slot="letter-job"]')).toContainText("Engineer · Synthetic Company");
					await expect(sentCard.locator('[data-slot="stage-dot"]')).toBeVisible();
					await expect(sentCard.locator('[data-slot="letter-thumbnail"]')).toHaveAttribute("data-state", "ready", {
						timeout: 60000,
					});
					await expect(sentCard.locator('[data-slot="letter-thumbnail"]')).toHaveAttribute("lang", "ar-SA");
					await expect(draftCard.locator('[data-slot="letter-badges"]')).toContainText("English");
					await expect(draftCard.locator('[data-slot="letter-job"]')).toContainText(
						locale === "ar-SA" ? "غير مرتبط بوظيفة" : "Not linked",
					);
					const blank = cards.filter({ has: page.getByRole("heading", { name: `${prefix} blank`, exact: true }) });
					await blank.scrollIntoViewIfNeeded();
					await expect(blank.locator('[data-slot="letter-thumbnail"]')).toHaveAttribute("data-state", "empty");
					const menu = draftCard.getByRole("button", { name: /Options for|خيارات/ });
					await menu.focus();
					await page.keyboard.press("Enter");
					await expect(page.getByRole("menu")).toBeVisible();
					await page.keyboard.press("Escape");
					await expect(menu).toBeFocused();
					expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
				}
		expect(await api.coverLetters.getVersion({ id: arabic.id, versionId: sent.sentCoverLetterVersionId })).toEqual(
			frozen,
		);
	} finally {
		await api.applications.delete({ id: applicationId });
		const { items } = await api.coverLetters.list({ search: prefix });
		for (const letter of items) {
			await api.coverLetters.delete({ id: letter.id, expectedRevision: letter.revision });
			await api.documents.purge({ type: "letter", id: letter.id });
		}
	}
});
