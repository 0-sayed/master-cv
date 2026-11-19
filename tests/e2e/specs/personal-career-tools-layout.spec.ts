import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { seedVariantReview, variantClient } from "../fixtures/variants";

for (const locale of ["ar-SA", "en-US"] as const)
	for (const width of [1440, 390]) {
		test(`${locale} at ${width}: personal tools preserve direction, content and responsive layout`, async ({
			authPage: page,
		}, info) => {
			test.setTimeout(120_000);
			await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
			const resumeId = await seedVariantReview(page, info);
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: new URL(page.url()).origin },
			});
			await page.context().addCookies([{ name: "locale", value: locale, url: new URL(page.url()).origin }]);
			const api = variantClient(page);
			const letter = await api.coverLetters.create({
				name: "خطاب مستقل / Independent letter",
				documentLocale: "ar-SA",
				resumeId,
				content: "<p>بنيت خدمات TypeScript. نص يدوي مستقل.</p>",
			});
			const englishLetter = await api.coverLetters.create({
				name: "Independent English letter",
				documentLocale: "en-US",
				resumeId,
				content: "<p>Independent English manual content.</p>",
			});
			const id = await api.applications.create({
				company: "شركة تجريبية / Synthetic Company",
				role: "مهندس / Engineer",
				resumeId,
				coverLetterId: letter.id,
				notes: "ملاحظات يدوية مستقلة",
			});
			const folder = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
			await mkdir(folder, { recursive: true });
			for (const [screen, path] of [
				["letters-list", "/dashboard?type=letter"],
				["letter", `/builder/letter/${letter.id}`],
				["english-letter", `/builder/letter/${englishLetter.id}`],
				["board", "/dashboard/applications?view=board"],
				["create-dialog", "/dashboard/applications?create=true"],
				["details", `/dashboard/applications?applicationId=${id}`],
			] as const) {
				await page.goto(path);
				await settleScreen(page);
				await page.evaluate(() => document.fonts.ready);
				if (screen === "letter" || screen === "english-letter")
					await page.locator('[data-slot="letter-review-composer"]').scrollIntoViewIfNeeded();
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
				).toBe(true);
				expect(await page.evaluate(() => document.fonts.status)).toBe("loaded");
				expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Arabic"'))).toBe(true);
				await page.screenshot({ path: join(folder, `${screen}-${locale}-${width}.png`), fullPage: true });
			}
			await page
				.locator(".record-header")
				.getByRole("button", { name: locale === "ar-SA" ? "المزيد من الإجراءات" : "More actions", exact: true })
				.click();
			await page.getByRole("menuitem").first().click();
			await settleScreen(page);
			const stage = locale === "ar-SA" ? "محفوظ" : "Saved";
			await expect(
				page.getByRole("dialog").getByRole("combobox", { name: locale === "ar-SA" ? "المرحلة" : "Stage", exact: true }),
			).toHaveText(stage);
			const dialogBox = await page.getByRole("dialog").boundingBox();
			expect(dialogBox).not.toBeNull();
			expect(dialogBox?.x).toBeGreaterThanOrEqual(0);
			expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(width + 1);
			await page.screenshot({ path: join(folder, `edit-dialog-${locale}-${width}.png`), fullPage: true });
			await page.keyboard.press("Escape");
			await page.goto("/dashboard?type=letter");
			await page.getByRole("button", { name: /^(New|جديد)$/u }).click();
			await expect(page).toHaveURL(/\/builder\/letter\/[^/?]+$/u);
			const createdId = new URL(page.url()).pathname.split("/").at(-1);
			expect(createdId).toBeTruthy();
			expect(createdId).not.toBe(letter.id);
			expect((await api.coverLetters.getById({ id: createdId ?? "" })).content).toBe("");
			expect((await api.coverLetters.getById({ id: englishLetter.id })).content).toBe(englishLetter.content);
			expect((await api.coverLetters.getById({ id: letter.id })).content).toBe(letter.content);
			expect((await api.applications.getById({ id })).notes).toBe("ملاحظات يدوية مستقلة");
		});
	}
