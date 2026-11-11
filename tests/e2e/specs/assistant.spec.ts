import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("unapproved assistant and provider setup stay hidden and cannot change the saved CV", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	const response = await page.request.get(`/api/openapi/resumes/${resumeId}`);
	await expect(response).toBeOK();
	const saved = await response.json();
	await page.goto(`/builder/${resumeId}?assistant=true`);
	await expect(page.getByRole("button", { name: "Assistant", exact: true })).toHaveCount(0);
	await expect(page.getByRole("region", { name: "Assistant", exact: true })).toHaveCount(0);
	await expect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
	await expect(page.getByLabel("Message the assistant", { exact: true })).toHaveCount(0);
	await page.reload();
	const reloaded = await page.request.get(`/api/openapi/resumes/${resumeId}`);
	await expect(reloaded).toBeOK();
	expect((await reloaded.json()).data).toEqual(saved.data);
});
