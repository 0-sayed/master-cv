import { seedPrivacyAccount, privacyDatabase } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";
import { captureUiEvidence } from "../fixtures/ui-evidence";
test("restoring a formerly shared language copy keeps sharing off and history", async ({ authPage: page, account }) => {
	const fixture = await seedPrivacyAccount(
		{ locale: "en-US", state: "active", includeQueuedWork: false },
		{ page, password: account.password },
	);
	await privacyDatabase(async (pool) => {
		await pool.query(
			"INSERT INTO resume(id,user_id,name,slug,data) SELECT $2,user_id,'Synthetic base',$2,data FROM resume WHERE id=$1",
			[fixture.documentId, `${fixture.documentId}-base`],
		);
		await pool.query("UPDATE resume SET variant_kind='language',base_resume_id=$2 WHERE id=$1", [
			fixture.documentId,
			`${fixture.documentId}-base`,
		]);
		await pool.query("UPDATE resume SET trashed_at=now(),is_public=true,show_download_buttons=true WHERE id=$1", [
			fixture.documentId,
		]);
	});
	await page.goto("/dashboard/trash");
	const row = page.getByRole("row").filter({ hasText: "Synthetic lifecycle CV" });
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Restore", exact: true }).click();
	await expect(row).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Open", exact: true })).toBeVisible();

	const state = await privacyDatabase(
		async (pool) =>
			(
				await pool.query(
					"SELECT is_public,trashed_at,(SELECT count(*)::int FROM resume_version v WHERE v.resume_id=r.id) AS versions FROM resume r WHERE id=$1",
					[fixture.documentId],
				)
			).rows[0],
	);
	expect(state.is_public).toBe(false);
	expect(state.trashed_at).toBeNull();
	expect(state.versions).toBeGreaterThan(0);
	await page.reload();
	await expect(page.getByRole("row").filter({ hasText: "Synthetic lifecycle CV" })).toHaveCount(0);
	expect(
		await privacyDatabase(
			async (pool) =>
				(await pool.query("SELECT is_public,show_download_buttons FROM resume WHERE id=$1", [fixture.documentId]))
					.rows[0],
		),
	).toEqual({ is_public: false, show_download_buttons: false });
});

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} trash exposes restore and confirmed permanent deletion`, async ({
			authPage: page,
			account,
		}, info) => {
			const fixture = await seedPrivacyAccount(
				{ locale, state: "active", includeQueuedWork: false },
				{ page, password: account.password },
			);
			await privacyDatabase(async (pool) => {
				await pool.query("UPDATE resume SET trashed_at=now()-interval '28 days' WHERE id=$1", [fixture.documentId]);
			});
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/trash?locale=${locale}`);
			const en = locale === "en-US";
			const row = page.getByRole("row", { name: "Synthetic lifecycle CV", exact: true });
			await expect(row.getByRole("button", { name: en ? "Restore" : "استعادة", exact: true })).toBeVisible();
			await expect(row.getByText(en ? "Deletes in 2 days" : "يومان حتى الحذف", { exact: true })).toBeVisible();
			await expect(page.getByRole("columnheader", { name: "Application", exact: true })).toHaveCount(0);
			await captureUiEvidence(page, info, `trash-${locale}-${width}`, locale);
			await row.getByRole("button", { name: en ? "Delete forever" : "حذف نهائي", exact: true }).click();
			const dialog = page.getByRole("alertdialog");
			await expect(dialog).toContainText("Synthetic lifecycle CV");
			await captureUiEvidence(page, info, `trash-${locale}-${width}-confirm`, locale);
			await dialog
				.getByRole("button", { name: en ? "Keep in Trash" : "احتفظ بها في سلة المهملات", exact: true })
				.click();
			await expect(row).toBeVisible();
			await row.getByRole("checkbox").check();
			await page
				.getByRole("button", { name: en ? "Delete selected forever" : "حذف المحدد نهائيًا", exact: true })
				.click();
			await expect(dialog).toContainText("Synthetic lifecycle CV");
			await dialog.getByRole("button", { name: en ? "Delete forever" : "حذف نهائي", exact: true }).click();
			await expect(row).toHaveCount(0);
			await expect
				.poll(() =>
					privacyDatabase(
						async (pool) =>
							(await pool.query("SELECT count(*)::int AS n FROM resume WHERE id=$1", [fixture.documentId])).rows[0].n,
					),
				)
				.toBe(0);
		});
	}
}

test("timer records and purges expired trash without visiting trash", async ({ authPage: page, account }) => {
	const fixture = await seedPrivacyAccount(
		{ locale: "en-US", state: "active", includeQueuedWork: false },
		{ page, password: account.password },
	);
	await privacyDatabase(async (pool) => {
		await pool.query("UPDATE resume SET trashed_at=now()-interval '31 days' WHERE id=$1", [fixture.documentId]);
	});
	await page.goto("/help");
	await expect
		.poll(
			() =>
				privacyDatabase(
					async (pool) =>
						(
							await pool.query(
								"SELECT count(*)::int AS n FROM privacy_work WHERE user_id=$1 AND kind='purge_document' AND request_id=$2 AND status='complete' AND key LIKE 'trash:%'",
								[fixture.userId, fixture.documentId],
							)
						).rows[0].n,
				),
			{ timeout: 30000 },
		)
		.toBe(1);
	expect(
		await privacyDatabase(
			async (pool) =>
				(await pool.query("SELECT count(*)::int AS n FROM resume WHERE id=$1", [fixture.documentId])).rows[0].n,
		),
	).toBe(0);
});

for (const width of [1440, 800]) {
	test(`empty Trash remains a current navigation destination at ${width}`, async ({ authPage: page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto("/dashboard/trash");
		const link = page.locator('aside a[href="/dashboard/trash"]');
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute("aria-current", "page");
		await expect(link.locator('[data-slot="count-badge"]')).toHaveCount(0);
	});
}
