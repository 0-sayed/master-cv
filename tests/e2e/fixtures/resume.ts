import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import { createResumeName } from "./data";

/**
 * Creates a sample resume named after the test and opens it in the editor. It goes through the API: the JSON import
 * spec covers the New dialog, and every other spec just needs a resume.
 */
export async function createSampleResumeFromDashboard(page: Page, testInfo: TestInfo) {
	const resumeName = createResumeName(testInfo);

	const response = await page.request.post("/api/openapi/resumes", {
		data: { name: resumeName, tags: [], withSampleData: true },
	});
	expect(response.ok()).toBe(true);
	const resumeId = (await response.json()) as string;

	await page.goto(`/builder/${resumeId}`);
	await page.waitForURL(/\/builder\/.+/);
	await expect(page.getByRole("button", { name: /^(Download PDF|تنزيل PDF)$/u })).toBeVisible();

	return resumeName;
}

export async function openSidebarSection(page: Page, title: string) {
	// Write: the Basics card is open by default; every other section is an outline row that opens on click.
	await page.getByRole("tab", { name: "Write", exact: true }).click();
	if (title === "Basics") {
		await expect(page.getByRole("textbox", { name: "Full name", exact: true })).toBeVisible();
		return;
	}
	// A custom section can share a built-in's title (the sample has two "Experience" sections); prefer the built-in.
	const builtIn = page.locator(`#sidebar-${title.toLowerCase()}`).getByRole("button", { name: title, exact: true });
	const row = (await builtIn.count()) > 0 ? builtIn : page.getByRole("button", { name: title, exact: true }).first();
	await row.scrollIntoViewIfNeeded();
	if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
	await expect(row).toHaveAttribute("aria-expanded", "true");
}

/** Opens the editor panel on desktop and the full-screen sheet on smaller screens. */
export async function openDownloadDialog(page: Page) {
	const phone = await page.evaluate(() => window.matchMedia("(max-width: 639px)").matches);
	await page.getByRole("button", { name: phone ? "Download PDF" : "More download formats", exact: true }).click();
	const sheet = page
		.getByRole("complementary", { name: "Export and history" })
		.or(page.getByRole("dialog", { name: "Export and history" }));
	await expect(sheet.getByRole("tab", { name: "Download", exact: true })).toHaveAttribute("aria-selected", "true");
	return sheet;
}

/** Seeds a synthetic legacy public resume through the retained API; sharing controls stay gated. */
export async function makeResumePublic(page: Page) {
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	await expect(page.getByRole("button", { name: /^Share\b/ })).toHaveCount(0);
	// A deliberate publish uses the current saved revision, as owner review actions do.
	const current = await page.request.get(`/api/openapi/resumes/${resumeId}`);
	await expect(current).toBeOK();
	const { updatedAt } = (await current.json()) as { updatedAt: string };
	const response = await page.request.put(`/api/openapi/resumes/${resumeId}`, {
		data: { isPublic: true, showDownloadButtons: true, expectedUpdatedAt: updatedAt },
	});
	expect(response.ok()).toBe(true);
	const { slug } = (await response.json()) as { slug: string };
	const session = await page.request.get("/api/auth/get-session");
	expect(session.ok()).toBe(true);
	const { user } = (await session.json()) as { user: { username: string } };
	return new URL(`/${user.username}/${slug}`, page.url()).href;
}
