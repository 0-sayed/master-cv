import { createSampleResumeFromDashboard, openDownloadDialog, openSidebarSection } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("retained API round-trips JSON and splits a legacy letter while JSON controls stay gated", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);

	const sheet = await openDownloadDialog(page);
	await expect(sheet.getByRole("radio", { name: /^JSON/ })).toHaveCount(0);
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	const response = await page.request.get(`/api/openapi/resumes/${resumeId}`);
	await expect(response).toBeOK();
	const { data: exportedData } = await response.json();

	// A name only this file carries, so a builder that opens anything but the imported resume fails.
	exportedData.basics.name = `Imported ${Date.now()}`;
	const imported = await page.request.post("/api/openapi/resumes/import", { data: { data: exportedData } });
	await expect(imported).toBeOK();
	await page.goto(`/builder/${await imported.json()}`);

	await openSidebarSection(page, "Basics");
	await expect(page.getByRole("textbox", { name: "Full name", exact: true })).toHaveValue(exportedData.basics.name);

	// A file from an older version, with the letter inside the resume.
	exportedData.customSections.push({
		id: "old-letter",
		type: "cover-letter",
		title: "Letter to Globex",
		icon: "",
		columns: 1,
		hidden: false,
		keepTogether: false,
		startOnNewPage: false,
		items: [{ id: "old-letter-item", hidden: false, recipient: "<p>Globex</p>", content: "<p>Dear Globex team,</p>" }],
	});
	exportedData.metadata.layout.pages.push({ fullWidth: true, main: ["old-letter"], sidebar: [] });
	const legacy = await page.request.post("/api/openapi/resumes/import", { data: { data: exportedData } });
	await expect(legacy).toBeOK();
	await page.goto(`/builder/${await legacy.json()}`);
	await expect(page.getByText("Dear Globex team,")).toHaveCount(0);

	await page.goto("/dashboard");
	await page.getByRole("tab", { name: /^Cover letters/ }).click();
	await expect(page.getByRole("heading", { name: /— Letter to Globex$/ })).toHaveCount(1);
});
