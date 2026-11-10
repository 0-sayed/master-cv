import { createSampleResumeFromDashboard, makeResumePublic } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("password-protects a public resume and unlocks it as a visitor", async ({ browser, authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	const publicUrl = await makeResumePublic(page);

	const password = "e2e-secret-42";
	const requirePassword = page.getByRole("switch", { name: "Require a password" });
	await requirePassword.click();
	const dialog = page.getByRole("dialog", { name: "Protect your resume with a password" });
	await dialog.getByLabel("Password", { exact: true }).fill(password);
	await dialog.getByLabel("Confirm Password", { exact: true }).fill("different-password");
	await dialog.getByRole("button", { name: "Set Password" }).click();
	await expect(dialog.getByRole("alert")).toHaveText("Passwords do not match.");
	await dialog.getByLabel("Confirm Password", { exact: true }).fill(password);
	await dialog.getByRole("button", { name: "Set Password" }).click();
	await expect(requirePassword).toBeChecked();

	const anonymous = await browser.newPage();
	try {
		// This scenario asserts English controls; a fresh visitor otherwise defaults to Arabic.
		await anonymous.context().addCookies([{ name: "locale", value: "en-US", url: publicUrl }]);
		// Anonymous visitors hit the password gate first
		await anonymous.goto(publicUrl);
		await anonymous.waitForURL(/\/auth\/resume-password/);
		const sharedEndpoint = `/api/openapi/resumes${new URL(publicUrl).pathname}`;
		expect((await anonymous.request.get(sharedEndpoint)).status()).toBe(401);
		expect(
			(
				await anonymous.request.post(`${sharedEndpoint}/password/verify`, { data: { password: "wrong-password" } })
			).status(),
		).toBe(401);
		expect((await anonymous.request.post(`${sharedEndpoint}/statistics/download`, { data: {} })).status()).toBe(401);

		await anonymous.getByLabel("Password", { exact: true }).fill(password);
		await anonymous.getByRole("button", { name: "Unlock" }).click();

		// The correct password reveals the actual resume
		await expect(anonymous.getByRole("button", { name: "Download PDF" }).first()).toBeVisible();
		expect((await anonymous.request.get(sharedEndpoint)).status()).toBe(200);
		const resumeId = new URL(page.url()).pathname.split("/")[2];
		const changed = await page.request.put(`/api/openapi/resumes/${resumeId}/password`, {
			data: { password: "changed-synthetic-password" },
		});
		expect(changed.ok()).toBe(true);
		// A cookie granted for the old hash must not unlock the changed password.
		expect((await anonymous.request.get(sharedEndpoint)).status()).toBe(401);
	} finally {
		await anonymous.close();
	}
});
