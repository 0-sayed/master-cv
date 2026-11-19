import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

test("an application keeps the selected CV version through refresh and a recorded applied stage", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/applications");
	const response = await page.request.post("/api/openapi/resumes", {
		data: { name: "Application CV", tags: [], withSampleData: true },
	});
	await expect(response).toBeOK();
	const resumeId = (await response.json()) as string;
	const api = variantClient(page);
	const first = await api.resume.createVersion({ resumeId, name: "CV for this application" });
	const id = await api.applications.create({ company: "Synthetic Company", role: "Engineer", resumeId });
	const letter = await api.coverLetters.create({
		name: "Application cover letter",
		documentLocale: "en-US",
		applicationId: id,
	});
	await page.goto(`/dashboard/applications/${id}?locale=en-US`);
	await page.getByRole("button", { name: "Manage documents" }).click();
	const picker = page.getByLabel("CV version", { exact: true });
	await expect(picker).toBeEnabled();
	await picker.selectOption(first.id);
	await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
	await expect.poll(async () => (await api.applications.getById({ id })).selectedResumeVersionId).toBe(first.id);
	const currentResume = await api.resume.getById({ id: resumeId });
	const edited = structuredClone(currentResume.data);
	edited.basics.name = "Later current document content";
	await expect(
		await page.request.put(`/api/openapi/resumes/${resumeId}`, {
			data: { data: edited, expectedUpdatedAt: currentResume.updatedAt.toISOString() },
		}),
	).toBeOK();
	await api.resume.createVersion({ resumeId, name: "Later CV" });
	await page.reload();
	await page.getByRole("button", { name: "Manage documents" }).click();
	await expect(picker).toHaveValue(first.id);
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	const current = await api.applications.getById({ id });
	await api.applications.update({
		id,
		expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
		status: "applied",
	});
	await page.reload();
	await page.getByRole("button", { name: "Manage documents" }).click();
	await expect(picker).toBeDisabled();
	const sent = (await api.applications.getById({ id })).sentResumeVersionId;
	expect(sent).not.toBeNull();
	expect(sent).not.toBe(first.id);
	if (!sent) throw new Error("The application did not record a sent snapshot");
	const selected = await api.resume.getVersion({ resumeId, versionId: first.id });
	const recorded = await api.resume.getVersion({ resumeId, versionId: sent });
	expect(recorded.data).toEqual(selected.data);
	expect(recorded.data).not.toEqual(edited);
	const applied = await api.applications.getById({ id });
	if (!applied.sentCoverLetterVersionId) throw new Error("The linked letter did not record a sent snapshot");
	const sentLetter = await api.coverLetters.getVersion({ id: letter.id, versionId: applied.sentCoverLetterVersionId });
	await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: new URL(page.url()).origin }]);
	await page.reload();
	expect((await api.resume.getVersion({ resumeId, versionId: sent })).data).toEqual(recorded.data);
	expect(
		(await api.coverLetters.getVersion({ id: letter.id, versionId: applied.sentCoverLetterVersionId })).data,
	).toEqual(sentLetter.data);
});
