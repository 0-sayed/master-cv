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

/** Opens Export and history on its Download tab, from the ▾ next to Download PDF. */
export async function openDownloadDialog(page: Page) {
	await page.getByRole("button", { name: "More download formats", exact: true }).click();
	const sheet = page.getByRole("dialog", { name: "Export and history" });
	await expect(sheet.getByRole("tab", { name: "Download", exact: true })).toHaveAttribute("aria-selected", "true");
	return sheet;
}

/** Seeds a synthetic legacy public resume through the retained API; sharing controls stay gated. */
export async function makeResumePublic(page: Page) {
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	await expect(page.getByRole("button", { name: /^Share\b/ })).toHaveCount(0);
	const response = await page.request.put(`/api/openapi/resumes/${resumeId}`, {
		data: { isPublic: true, showDownloadButtons: true },
	});
	expect(response.ok()).toBe(true);
	const { slug } = (await response.json()) as { slug: string };
	const session = await page.request.get("/api/auth/get-session");
	expect(session.ok()).toBe(true);
	const { user } = (await session.json()) as { user: { username: string } };
	return new URL(`/${user.username}/${slug}`, page.url()).href;
}
