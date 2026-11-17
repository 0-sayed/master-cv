import { expect, test } from "../fixtures/test";
import { seedVariantReview, variantClient } from "../fixtures/variants";

test("a verified letter remains a proposal until explicit acceptance and survives reopening", async ({
	authPage: page,
}, info) => {
	const resumeId = await seedVariantReview(page, info);
	const api = variantClient(page);
	const source = await api.resume.getById({ id: resumeId });
	await api.career.jobTargets.saveAndSelect({
		resumeId,
		expectedUpdatedAt: new Date(source.updatedAt).toISOString(),
		role: "Engineer",
		employer: "Synthetic employer",
		text: "TypeScript required.",
	});
	const letter = await api.coverLetters.create({
		name: "Reviewed letter",
		resumeId,
		documentLocale: "en-US",
		content: "<p>My manual letter.</p>",
	});
	await page.goto(`/builder/letter/${letter.id}`);
	await page.getByRole("button", { name: "Review a job-specific letter", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Start review", exact: true }).click();
	await expect(page.getByRole("button", { name: "Accept proposal", exact: true })).toBeVisible();
	expect((await api.coverLetters.getById({ id: letter.id })).content).toBe(letter.content);
	await page.reload();
	await expect(page.getByRole("button", { name: "Accept proposal", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Accept proposal", exact: true }).click();
	await expect(page.getByText("Proposal saved as a letter version.", { exact: true })).toBeVisible();
	const saved = await api.coverLetters.getById({ id: letter.id });
	expect(saved.content).toContain("Built TypeScript services");
	expect(saved.revision).toBe(letter.revision + 1);
	await page.reload();
	await expect(page.getByText("Proposal saved as a letter version.", { exact: true })).toBeVisible();
	expect((await api.coverLetters.getById({ id: letter.id })).content).toBe(saved.content);
});

test("rejecting a letter proposal preserves authored content and its revision", async ({ authPage: page }, info) => {
	const resumeId = await seedVariantReview(page, info);
	const api = variantClient(page);
	const source = await api.resume.getById({ id: resumeId });
	await api.career.jobTargets.saveAndSelect({
		resumeId,
		expectedUpdatedAt: new Date(source.updatedAt).toISOString(),
		role: "Engineer",
		text: "TypeScript required.",
	});
	const letter = await api.coverLetters.create({
		name: "Rejected proposal",
		resumeId,
		documentLocale: "en-US",
		content: "<p>Keep this manual letter.</p>",
	});
	await page.goto(`/builder/letter/${letter.id}`);
	await page.getByRole("button", { name: "Review a job-specific letter", exact: true }).click();
	await page.getByRole("dialog").getByRole("button", { name: "Start review", exact: true }).click();
	await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
	await expect(page.getByText("Proposal rejected. Your letter is unchanged.", { exact: true })).toBeVisible();
	expect(await api.coverLetters.getById({ id: letter.id })).toMatchObject({
		content: letter.content,
		revision: letter.revision,
	});
});
