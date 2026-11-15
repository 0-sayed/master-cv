import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createAuthenticatedContext } from "../fixtures/auth";
import { createAccount } from "../fixtures/data";
import { deleteE2EUser } from "../fixtures/db";
import { privacyDatabase } from "../fixtures/privacy";
import { expect, test } from "../fixtures/test";
test("owner picture is private and revocation precedes conditional delivery", async ({
	authPage: page,
	browser,
}, info) => {
	await page.goto("/dashboard/settings/account");
	const sharp = createRequire(resolve(process.cwd(), "apps/server/package.json"))("sharp");
	const file: Buffer = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#ffffff" } })
		.png()
		.toBuffer();
	await page
		.locator('input[type="file"]')
		.setInputFiles({ name: "synthetic-picture.png", mimeType: "image/png", buffer: file });
	const session = await (await page.request.get("/api/auth/get-session")).json();
	let key = "";
	await expect
		.poll(async () => {
			key = await privacyDatabase(
				async (pool) =>
					(
						await pool.query(
							"SELECT key FROM stored_file WHERE user_id=$1 AND purpose='picture' ORDER BY created_at DESC LIMIT 1",
							[session.user.id],
						)
					).rows[0]?.key ?? "",
			);
			return key;
		})
		.not.toBe("");
	const url = new URL(`/api/${key}`, page.url()).toString();
	const owner = await page.request.get(url);
	await expect(owner).toBeOK();
	expect(owner.headers()["cache-control"]).toContain("no-store");
	const anonymous = await browser.newContext();
	const foreignAccount = createAccount(info);
	try {
		expect((await anonymous.request.get(url)).ok()).toBe(false);
		const foreign = await createAuthenticatedContext(
			browser,
			anonymous.request,
			foreignAccount,
			new URL(page.url()).origin,
		);
		try {
			expect((await foreign.request.get(url)).ok()).toBe(false);
		} finally {
			await foreign.close();
		}
	} finally {
		await anonymous.close();
		await deleteE2EUser(foreignAccount);
	}
	await privacyDatabase(async (pool) => {
		await pool.query("UPDATE stored_file SET revoked_at=now() WHERE key=$1", [
			new URL(url).pathname.replace(/^\/api\//, ""),
		]);
	});
	expect(
		(await page.request.get(url, { headers: { "if-none-match": owner.headers().etag ?? "synthetic" } })).ok(),
	).toBe(false);
});
