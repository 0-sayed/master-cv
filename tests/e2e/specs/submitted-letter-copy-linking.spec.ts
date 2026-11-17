import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width}: a submitted letter opens an editable copy that can target the same job`, async ({
			authPage: page,
		}, info) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto("/dashboard");
			const origin = new URL(page.url()).origin;
			await expect(
				await page.request.post("/api/auth/update-user", { headers: { origin }, data: { uiLocale: locale } }),
			).toBeOK();
			await page.context().addCookies([{ name: "locale", value: locale, url: origin }]);
			const api = variantClient(page);
			const fixtureName = `E2E submitted letter ${crypto.randomUUID()}`;
			const company = `Synthetic Submitted Job ${crypto.randomUUID()}`;
			const applicationId = await api.applications.create({ company, role: "Engineer" });
			try {
				const original = await api.coverLetters.create({
					name: fixtureName,
					applicationId,
					content: "<p>Original submitted content.</p>",
					recipientCompany: "Manual recipient",
				});
				const pending = await api.applications.getById({ id: applicationId });
				await api.applications.update({
					id: applicationId,
					expectedUpdatedAt: pending.updatedAt.toISOString(),
					status: "applied",
				});
				const submitted = await api.applications.getById({ id: applicationId });
				if (!submitted.sentCoverLetterVersionId)
					throw new Error("Application did not preserve a submitted letter version");
				const sentInput = { id: original.id, versionId: submitted.sentCoverLetterVersionId };
				const sent = await api.coverLetters.getVersion(sentInput);
				const jobChooser = page
					.getByRole("combobox", { name: /^(Link job application|ربط طلب الوظيفة)$/ })
					.and(page.locator("button"));
				const choose = async (name: string) => {
					await jobChooser.click();
					await page.getByRole("option").filter({ hasText: name }).click();
					await expect(jobChooser).toHaveAttribute("aria-expanded", "false");
				};
				await page.goto(`/builder/letter/${original.id}`);
				await choose(company);
				await expect(page.getByRole("listbox")).toHaveCount(0);
				expect(await api.coverLetters.getById({ id: original.id })).toEqual(original);
				await choose(locale === "ar-SA" ? "لا يوجد طلب وظيفة" : "No application");
				await expect(
					page.getByText(/^(Could not save the cover-letter change|تعذّر حفظ التغيير في خطاب التقديم)$/),
				).toBeVisible();
				await expect(
					page.getByText(
						locale === "ar-SA"
							? "يبقى الخطاب المُرسَل دون تغيير. أنشئ نسخة لفتح مسودة قابلة للتحرير وغير مرتبطة بطلب. يمكنك ربط المسودة بأي طلب وظيفة."
							: "The submitted letter stays unchanged. Create a copy to open an unlinked, editable draft. You can link the draft to any application.",
						{ exact: true },
					),
				).toBeVisible();
				await settleScreen(page);
				await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar-SA" ? "rtl" : "ltr");
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
				await page.screenshot({ path: info.outputPath("submitted-letter-recovery.png"), fullPage: true });
				await page.getByRole("button", { name: /^(Create a copy|إنشاء نسخة)$/ }).click();
				await page.waitForURL(
					(url) => url.pathname.startsWith("/builder/letter/") && !url.pathname.endsWith(original.id),
				);
				const copyId = new URL(page.url()).pathname.replace("/builder/letter/", "");
				expect(await api.coverLetters.getById({ id: copyId })).toMatchObject({
					sourceApplicationId: null,
					isLocked: false,
					revision: 1,
				});
				await choose(company);
				await expect
					.poll(() => api.coverLetters.getById({ id: copyId }))
					.toMatchObject({ sourceApplicationId: applicationId, revision: 2 });
				await choose(company);
				await expect(page.getByRole("listbox")).toHaveCount(0);
				expect((await api.coverLetters.getById({ id: copyId })).revision).toBe(2);
				const body = page.locator(
					'#letter-body-editor [contenteditable="true"], #letter-body-editor[contenteditable="true"]',
				);
				await body.fill("Editable copy content.");
				await expect
					.poll(async () => (await api.coverLetters.getById({ id: copyId })).content)
					.toContain("Editable copy content.");
				await page.reload();
				await expect(body).toContainText("Editable copy content.");
				expect(await api.applications.getById({ id: applicationId })).toMatchObject({
					coverLetterId: original.id,
					sentCoverLetterVersionId: sentInput.versionId,
				});
				expect(await api.coverLetters.getVersion(sentInput)).toEqual(sent);
				await expect(
					page.getByText(/^(Could not save the cover-letter change|تعذّر حفظ التغيير في خطاب التقديم)$/),
				).toHaveCount(0);
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
				await settleScreen(page);
				await page.screenshot({ path: info.outputPath("linked-editable-copy.png"), fullPage: true });
			} finally {
				await api.applications.delete({ id: applicationId });
				const { items } = await api.coverLetters.list({ search: fixtureName });
				for (const letter of items) {
					await api.coverLetters.delete({ id: letter.id, expectedRevision: letter.revision });
					await api.documents.purge({ type: "letter", id: letter.id });
				}
			}
		});
	}
}
