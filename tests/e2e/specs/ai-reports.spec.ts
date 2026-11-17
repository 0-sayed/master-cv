import { createRequire } from "node:module";
import { resolve } from "node:path";
import { privacyDatabase, seedPrivacyAccount } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";

const { unzipSync, strFromU8 } = createRequire(resolve(process.cwd(), "packages/api/package.json"))("fflate") as {
	unzipSync(bytes: Uint8Array): Record<string, Uint8Array>;
	strFromU8(bytes: Uint8Array): string;
};

test("stores a private AI report, exports it, and deletes it only after account confirmation", async ({
	authPage: page,
	browser,
	account,
}) => {
	const sent = await page.request.post("/api/openapi/ai/content-reports", {
		data: {
			source: "assistant",
			reason: "dangerous",
			content: "Fictional unsafe generated content",
			note: "Fictional safety test",
		},
	});
	await expect(sent).toBeOK();
	const receipt = await sent.json();
	const fixture = await seedPrivacyAccount(
		{ locale: "en-US", state: "export_ready", includeQueuedWork: false },
		{ page, password: account.password },
	);
	const path = `/api/privacy/exports/${fixture.requestId}`;
	const exported = await page.request.get(path);
	await expect(exported).toBeOK();
	const json = unzipSync(await exported.body())["account.json"];
	if (!json) throw new Error("Account archive absent");
	expect(strFromU8(json)).toContain(receipt.id);
	expect(strFromU8(json)).toContain("Fictional unsafe generated content");
	const anonymous = await browser.newContext({ baseURL: new URL(page.url()).origin });
	try {
		expect((await anonymous.request.get(path)).status()).toBe(401);
	} finally {
		await anonymous.close();
	}
	await page.goto("/dashboard/settings/delete-account");
	await expect(page.getByRole("button", { name: "Permanently delete my account", exact: true })).toBeDisabled();
	await page.getByRole("link", { name: "Cancel", exact: true }).click();
	await expect(await page.request.get(path)).toBeOK();
	await page.goto("/dashboard/settings/delete-account");
	await page.getByRole("button", { name: "Confirm access", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Password", { exact: true }).fill(account.password);
	await dialog.getByRole("button", { name: "Confirm access", exact: true }).click();
	await expect(dialog).not.toBeVisible();
	await page.getByRole("checkbox").check();
	await page.getByRole("button", { name: "Permanently delete my account", exact: true }).click();
	await page.waitForURL("/deletion-requested");
	let queue: unknown = null;
	try {
		await expect
			.poll(
				() =>
					privacyDatabase(async (pool) => {
						const count = (await pool.query("SELECT id FROM ai_content_report WHERE user_id=$1", [fixture.userId]))
							.rowCount;
						queue = (
							await pool.query(
								"SELECT now() AS observed_at, kind, status, attempts, due_at, lease_until, failure_code FROM privacy_work WHERE user_id=$1 ORDER BY created_at",
								[fixture.userId],
							)
						).rows;
						return count;
					}),
				{ timeout: 30000 },
			)
			.toBe(0);
	} finally {
		await test
			.info()
			.attach("deletion-queue-state", { body: JSON.stringify(queue, null, 2), contentType: "application/json" });
	}
});
