import { privacyDatabase } from "../fixtures/privacy";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
test("anonymous support persists a receipt and retains failed submissions", async ({ page }) => {
	await page.goto("/help");
	await settleScreen(page);
	await page.getByLabel("Your email", { exact: true }).fill("support-fixture@example.test");
	await page.getByLabel("Your message", { exact: true }).fill("Synthetic support lifecycle message");
	await page.route("**/api/rpc/privacy/support", (route) => route.abort());
	await page.getByRole("button", { name: "Send message", exact: true }).click();
	await expect(page.getByRole("alert")).toBeVisible();
	await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("Synthetic support lifecycle message");
	await page.unroute("**/api/rpc/privacy/support");
	await page.getByRole("button", { name: "Send message", exact: true }).click();
	await expect(page.getByText("Message received", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Your message was received and saved. This receipt does not mean the request is resolved.", {
			exact: true,
		}),
	).toBeVisible();
	expect(
		await privacyDatabase(
			async (pool) =>
				(
					await pool.query("SELECT count(*)::int AS count FROM support_request WHERE email=$1 AND message=$2", [
						"support-fixture@example.test",
						"Synthetic support lifecycle message",
					])
				).rows[0].count,
		),
	).toBe(1);
	await page.getByRole("button", { name: "Send another message" }).click();
	await expect(page.getByLabel("Your message", { exact: true })).toHaveValue("");
});
