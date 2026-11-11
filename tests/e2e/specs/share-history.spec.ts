import { createSampleResumeFromDashboard, makeResumePublic } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("renames the public address and keeps the old one redirecting", async ({ browser, authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	const oldUrl = await makeResumePublic(page);
	const resumeId = new URL(page.url()).pathname.split("/")[2];
	const invalid = await page.request.put(`/api/openapi/resumes/${resumeId}`, { data: { slug: "not_valid!" } });
	expect(invalid.status()).toBe(400);
	const renamed = await page.request.put(`/api/openapi/resumes/${resumeId}`, { data: { slug: "renamed-address" } });
	await expect(renamed).toBeOK();
	expect((await renamed.json()).slug).toBe("renamed-address");

	const visitor = await browser.newPage();
	try {
		await visitor.goto(oldUrl);
		await visitor.waitForURL(/\/renamed-address$/);
		await expect(visitor.getByRole("heading", { level: 1 })).toBeVisible();
	} finally {
		await visitor.close();
	}
});
