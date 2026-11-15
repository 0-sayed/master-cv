import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { capturedPrivacyNotice } from "../fixtures/mail";
import { seedPrivacyAccount, privacyDatabase } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";
import { captureUiEvidence } from "../fixtures/ui-evidence";
// Inspect the ZIP with the same installed codec used by the account archive owner.
const { unzipSync, strFromU8 } = createRequire(resolve(process.cwd(), "packages/api/package.json"))("fflate") as {
	unzipSync(bytes: Uint8Array): Record<string, Uint8Array>;
	strFromU8(bytes: Uint8Array): string;
};
test("private archive downloads with actual revision and attachment bytes", async ({ authPage: page, account }) => {
	const fixture = await seedPrivacyAccount(
		{ locale: "en-US", state: "export_ready", includeQueuedWork: false },
		{ page, password: account.password },
	);
	await page.reload();
	await expect(page.locator("#data-export").getByRole("status")).toContainText("Your data copy is ready");
	await expect(page.getByText(/Available until/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Request a copy of my data" })).toHaveCount(0);
	const pending = page.waitForEvent("download");
	await page.getByRole("link", { name: "Download copy", exact: true }).click();
	const download = await pending;
	const path = await download.path();
	if (!path) throw new Error("Archive download absent");
	const entries = unzipSync(await readFile(path));
	const json = entries["account.json"];
	const attachment = entries["files/originals/sentinel.txt"];
	if (!json || !attachment) throw new Error("Required archive entries absent");
	expect(strFromU8(json)).toContain("SYNTHETIC_REVISION_SENTINEL");
	expect(strFromU8(attachment)).toBe("SYNTHETIC_ATTACHMENT_SENTINEL");
	expect(strFromU8(json)).not.toContain(account.password);
	expect(strFromU8(json)).not.toContain("approvedTokenHash");
	await capturedPrivacyNotice(account.email, "export_ready", "en-US");
	expect(
		(
			await page.request.get(`/api/privacy/exports/${fixture.requestId}`, {
				headers: { authorization: "Bearer synthetic" },
			})
		).ok(),
	).toBe(false);
});

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} ${width} privacy groups storage, export and final danger zone`, async ({
			authPage: page,
			account,
		}, info) => {
			test.setTimeout(60000);
			await seedPrivacyAccount(
				{ locale, state: "active", includeQueuedWork: false },
				{ page, password: account.password },
			);
			await page.setViewportSize({ width, height: 1024 });
			await page.goto(`/dashboard/settings/privacy?locale=${locale}`);
			const en = locale === "en-US";
			await expect(
				page.getByText(en ? "No data copy requested yet" : "لم تطلب نسخة من بياناتك بعد", { exact: true }),
			).toBeVisible();
			await expect(page.getByText(/owner approval|اعتماد المالك/)).toHaveCount(0);
			const storage = page.getByRole("region", { name: en ? "What we store" : "ما نحفظه" });
			await expect(storage.getByRole("button")).toHaveCount(4);
			const category = storage.getByRole("button", { name: en ? "Your account" : "حسابك", exact: true });
			await expect(category).toHaveAttribute("aria-expanded", "false");
			await category.click();
			await expect(category).toHaveAttribute("aria-expanded", "true");
			await category.click();
			await expect(
				storage.getByRole("link", { name: en ? "Privacy policy and help" : "سياسة الخصوصية والمساعدة" }),
			).toHaveAttribute("href", "/help");
			const danger = page.locator("main").getByRole("region").last();
			await expect(danger.getByRole("heading")).toHaveText(en ? "Delete account" : "حذف الحساب");
			await danger.getByRole("link", { name: en ? "Download your data first" : "تنزيل بياناتك أولًا" }).click();
			await expect(page).toHaveURL(/#data-export$/);
			const evidence = await captureUiEvidence(page, info, `privacy-${locale}-${width}-none`, locale);
			if (width === 1440) {
				await page.goto(`/dashboard/settings/account?locale=${locale}`);
				const peer = await captureUiEvidence(page, info, `settings-account-${locale}-${width}`, locale);
				expect(evidence.content?.x).toBeCloseTo(peer.content?.x ?? -1, 0);
				expect(evidence.content?.width).toBeCloseTo(peer.content?.width ?? -1, 0);
				expect(evidence.sidebar?.width).toBeCloseTo(peer.sidebar?.width ?? -1, 0);
				expect(evidence.header?.x).toBeCloseTo(evidence.content?.x ?? -1, 0);
			}
			await page.goto(`/dashboard/settings/privacy?locale=${locale}`);
			await page
				.getByRole("button", { name: en ? "Request a copy of my data" : "طلب نسخة من بياناتي", exact: true })
				.click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await captureUiEvidence(page, info, `privacy-${locale}-${width}-proof`, locale);
			await page.getByLabel(en ? "Password" : "كلمة المرور", { exact: true }).fill(account.password);
			await page.getByRole("button", { name: en ? "Confirm access" : "تأكيد الوصول", exact: true }).click();
			await expect(page.getByRole("link", { name: en ? "Download copy" : "تنزيل النسخة", exact: true })).toBeVisible({
				timeout: 30000,
			});
			await expect(
				page.getByRole("button", { name: en ? "Request a copy of my data" : "طلب نسخة من بياناتي", exact: true }),
			).toHaveCount(0);
			await expect(page.locator('[data-slot="toast-description"]')).toHaveText(
				en ? "Your data copy is ready" : "نسخة بياناتك جاهزة",
			);
			// The mobile sheet button shares the toast position; leave it so hover does not pause dismissal.
			await page.mouse.move(0, 0);
			await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
			await captureUiEvidence(page, info, `privacy-${locale}-${width}-ready`, locale);
			await capturedPrivacyNotice(account.email, "export_ready", locale);
		});
	}
}

test("offline export mail remains retryable and sends after recovery", async ({ authPage: page, account }) => {
	const directory = process.env.E2E_MAIL_DIRECTORY;
	if (!directory) throw new Error("Runner mail sink required");
	await writeFile(resolve(directory, "transport-state"), "offline");
	try {
		const fixture = await seedPrivacyAccount(
			{ locale: "en-US", state: "export_ready", includeQueuedWork: false },
			{ page, password: account.password },
		);
		await expect
			.poll(
				() =>
					privacyDatabase(
						async (pool) =>
							(
								await pool.query(
									"SELECT count(*)::int AS n FROM privacy_work WHERE user_id=$1 AND kind='send_notice' AND status='retry'",
									[fixture.userId],
								)
							).rows[0].n,
					),
				{ timeout: 30000 },
			)
			.toBeGreaterThan(0);
		await writeFile(resolve(directory, "transport-state"), "online");
		await privacyDatabase(async (pool) => {
			await pool.query(
				"UPDATE privacy_work SET due_at=now() WHERE user_id=$1 AND kind='send_notice' AND status='retry'",
				[fixture.userId],
			);
		});
		await capturedPrivacyNotice(account.email, "export_ready", "en-US");
	} finally {
		await writeFile(resolve(directory, "transport-state"), "online");
	}
});
test("proof only reviews; accepted deletion signs out and reaches public receipt", async ({
	authPage: page,
	account,
}) => {
	const fixture = await seedPrivacyAccount(
		{ locale: "en-US", state: "active", includeQueuedWork: true },
		{ page, password: account.password },
	);
	await page.goto("/dashboard/settings/delete-account");
	await page.getByRole("button", { name: "Confirm access", exact: true }).click();
	await page.getByLabel("Password", { exact: true }).fill(account.password);
	await page.getByRole("button", { name: "Confirm access", exact: true }).click();
	await expect(page.getByText("Access confirmed", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Permanently delete my account" })).toBeDisabled();
	expect((await page.request.get("/api/auth/get-session")).ok()).toBe(true);
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Permanently delete my account" }).click();
	await expect(page).toHaveURL(/\/deletion-requested$/);
	await page.reload();
	await expect(page.getByText("Access confirmed", { exact: true })).toHaveCount(0);
	// The held synthetic worker prevents early completion; its lease is released explicitly.
	await expect
		.poll(
			() =>
				privacyDatabase(
					async (pool) =>
						(
							await pool.query(
								"SELECT count(*)::int AS n FROM ai_operation WHERE user_id=$1 AND state='cancel_requested'",
								[fixture.userId],
							)
						).rows[0].n,
				),
			{ timeout: 30000 },
		)
		.toBe(1);
	const rejected = await page.request.post("/api/openapi/resumes", {
		data: { name: "LATE_SYNTHETIC_RESULT", tags: [], withSampleData: false },
	});
	expect(rejected.ok()).toBe(false);
	await privacyDatabase(async (pool) => {
		await pool.query("UPDATE ai_operation SET lease_until=now()-interval '1 second' WHERE user_id=$1", [
			fixture.userId,
		]);
		await pool.query("UPDATE privacy_work SET due_at=now() WHERE user_id=$1 AND kind='delete_account'", [
			fixture.userId,
		]);
	});
	await expect
		.poll(
			() =>
				privacyDatabase(
					async (pool) =>
						(await pool.query('SELECT count(*)::int AS count FROM "user" WHERE id=$1', [fixture.userId])).rows[0].count,
				),
			{ timeout: 30000 },
		)
		.toBe(0);
	await capturedPrivacyNotice(account.email, "deletion_received", "en-US");
	await capturedPrivacyNotice(account.email, "deletion_complete", "en-US");
});
