import { privacyDatabase } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} replayed deletion proof shows recovery and accepts a new confirmation`, async ({
			authPage: page,
			account,
			baseURL,
		}, testInfo) => {
			if (!baseURL) throw new Error("Browser baseURL missing");
			await page.setViewportSize({ width, height: 900 });
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL }]);
			await page.goto("/dashboard/settings/delete-account");
			const confirm = page.getByRole("button", { name: /^(Confirm access|تأكيد الوصول)$/u });
			await confirm.click();
			const dialog = page.getByRole("dialog");
			await dialog.locator('input[type="password"]').fill(account.password);
			await dialog.locator('button[type="submit"]').click();
			await expect(dialog).toHaveCount(0);
			const session = await (await page.request.get("/api/auth/get-session")).json();
			// Model a token already consumed by another tab; submission and recovery stay in the real UI.
			const consumed = await privacyDatabase((pool) =>
				pool.query(
					"UPDATE account_action_proof SET consumed_at=now() WHERE user_id=$1 AND action='delete_account' AND token_hash IS NOT NULL AND consumed_at IS NULL RETURNING id",
					[session.user.id],
				),
			);
			expect(consumed.rowCount).toBe(1);
			await page.getByRole("checkbox").check();
			const remove = page.getByRole("button", { name: /^(Permanently delete my account|حذف حسابي نهائيًا)$/u });
			await remove.click();
			const alert = page.getByRole("alert");
			await expect(alert).toContainText(
				locale === "ar-SA" ? "لم يتأكد استلام طلب الحذف" : "Deletion request was not confirmed",
			);
			await expect(remove).toBeDisabled();
			await expect(confirm).toBeVisible();
			await page.screenshot({
				path: testInfo.outputPath(`${locale}-${width}-proof-replay-recovery.png`),
				animations: "disabled",
			});
			await confirm.click();
			await dialog.locator('input[type="password"]').fill(account.password);
			await dialog.locator('button[type="submit"]').click();
			await expect(dialog).toHaveCount(0);
			await expect(remove).toBeEnabled();
			expect((await (await page.request.get("/api/auth/get-session")).json()).user.id).toBe(session.user.id);
			expect(
				await privacyDatabase(
					async (pool) =>
						(
							await pool.query("SELECT count(*)::int AS n FROM account_deletion WHERE subject_user_id=$1", [
								session.user.id,
							])
						).rows[0].n,
				),
			).toBe(0);
		});
	}
}
