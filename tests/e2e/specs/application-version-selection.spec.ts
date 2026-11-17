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
	await page.goto(`/dashboard/applications?applicationId=${id}`);
	const picker = page.getByLabel("CV version", { exact: true });
	await expect(picker).toBeEnabled();
	await picker.selectOption(first.id);
	await expect.poll(async () => (await api.applications.getById({ id })).selectedResumeVersionId).toBe(first.id);
	await api.resume.createVersion({ resumeId, name: "Later CV" });
	await page.reload();
	await expect(picker).toHaveValue(first.id);
	const current = await api.applications.getById({ id });
	await api.applications.update({
		id,
		expectedUpdatedAt: new Date(current.updatedAt).toISOString(),
		status: "applied",
	});
	await page.reload();
	await expect(picker).toBeDisabled();
	const sent = (await api.applications.getById({ id })).sentResumeVersionId;
	expect(sent).not.toBeNull();
	expect(sent).not.toBe(first.id);
});
