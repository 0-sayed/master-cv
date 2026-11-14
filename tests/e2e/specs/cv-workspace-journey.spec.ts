import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { loginViaUi } from "../fixtures/auth";
import { seedExistingResume } from "../fixtures/existing-inventory";
import { createSampleResumeFromDashboard, openSidebarSection } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

test("history restore survives sign-out and fresh sign-in without changing the other language CV", async ({
	authPage: page,
	account,
	baseURL,
}) => {
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/u }).click();
	await expect(page).toHaveURL(/\/builder\//);
	await page.getByLabel("Full name", { exact: true }).fill("Original reviewed name");
	await expect(page).toHaveURL(/\/builder\//);
	const url = page.url();
	const id = new URL(url).pathname.split("/").at(-1);
	const otherId = await seedExistingResume(page, "Arabic isolation fixture", {
		...defaultResumeData,
		metadata: { ...defaultResumeData.metadata, page: { ...defaultResumeData.metadata.page, locale: "ar-SA" } },
	});
	const otherData = (await (await page.request.get(`/api/openapi/resumes/${otherId}`)).json()).data;
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Original reviewed name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("textbox", { name: "Name this version", exact: true }).fill("Before local change");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByRole("button", { name: /^Before local change/u })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.getByLabel("Full name", { exact: true }).fill("Latest CV-only name");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Latest CV-only name");
	await page.getByRole("button", { name: "History", exact: true }).click();
	await page.getByRole("button", { name: /^Before local change/u }).click();
	await page.getByRole("button", { name: "Restore this version", exact: true }).click();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Original reviewed name");
	await page.keyboard.press("Escape");
	expect((await (await page.request.get(`/api/openapi/resumes/${otherId}`)).json()).data).toEqual(otherData);
	expect(await (await page.request.get("/api/openapi/career/master")).json()).toEqual(master);
	const logout = await page.request.post("/api/auth/sign-out", {
		headers: { origin: baseURL ?? "http://localhost:3030" },
		data: {},
	});
	expect(logout.ok()).toBe(true);
	await page.goto(url);
	await expect(page).toHaveURL(/\/auth\/login/);
	await loginViaUi(page, account);
	await page.goto(url);
	await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Original reviewed name");
});

test("reusing confirmed master facts links the CV while local corrections preserve the master", async ({
	authPage: page,
}) => {
	await page.goto("/dashboard/career/information");
	await page.getByRole("button", { name: "Add skill", exact: true }).click();
	await page.locator('input[name="name"]').fill("Confirmed synthetic skill");
	await page.getByRole("button", { name: "Review changes", exact: true }).click();
	await page.getByRole("button", { name: "Confirm changes", exact: true }).click();
	await expect(page.getByRole("dialog")).not.toBeVisible();
	const master = await (await page.request.get("/api/openapi/career/master")).json();
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/u }).click();
	await expect(page).toHaveURL(/\/builder\//);
	await page.getByRole("button", { name: "Use confirmed career information", exact: true }).click();
	await expect(page.getByText("Confirmed synthetic skill", { exact: true })).toBeVisible();
	await page.getByLabel("Full name", { exact: true }).fill("Reused synthetic CV");
	await expect(page).toHaveURL(/\/builder\//);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	await expect
		.poll(
			async () =>
				(await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.sections.skills.items[0]?.name,
		)
		.toBe("Confirmed synthetic skill");
	const cv = await (await page.request.get(`/api/openapi/resumes/${id}`)).json();
	expect(cv.data.sections.skills.items[0].name).toBe("Confirmed synthetic skill");
	const linked = await (await page.request.get("/api/openapi/career/master")).json();
	expect(linked.facts).toEqual(master.facts);
	await expect
		.poll(async () =>
			(await (await page.request.get("/api/openapi/career/master")).json()).links.some(
				(link: { resumeId: string }) => link.resumeId === id,
			),
		)
		.toBe(true);
	await page.getByLabel("Full name", { exact: true }).fill("Local CV correction");
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.basics.name)
		.toBe("Local CV correction");
	expect((await (await page.request.get("/api/openapi/career/master")).json()).facts).toEqual(master.facts);
});

test("entry hover reveals its reorder handle", async ({ authPage: page }, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	await openSidebarSection(page, "Experience");
	const entry = page.locator("[data-entry-id]").first();
	await entry.hover();
	await expect(entry.getByRole("button", { name: /^Reorder / })).toHaveCSS("opacity", "1");
});

test("ignored writing notes can be restored after reloading on mobile", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/dashboard");
	await page.getByRole("button", { name: "New CV", exact: true }).click();
	await page.getByRole("button", { name: /^Write from scratch/u }).click();
	await expect(page).toHaveURL(/\/builder\//);
	const id = new URL(page.url()).pathname.split("/").at(-1);
	await page
		.getByRole("navigation", { name: "Editor views" })
		.getByRole("button", { name: "Check", exact: true })
		.click();
	const key = "MISSING_EMAIL:/basics/email";
	const note = page.locator(`[data-issue-card="${key}"]`);
	await note.getByRole("button", { name: "Keep as is", exact: true }).click();
	await expect
		.poll(
			async () =>
				(await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.metadata.check?.ignored ?? [],
		)
		.toContain(key);
	await page.reload();
	await page
		.getByRole("navigation", { name: "Editor views" })
		.getByRole("button", { name: "Check", exact: true })
		.click();
	await expect(note).not.toBeVisible();
	await page.getByRole("button", { name: "Show again (1)", exact: true }).click();
	await expect(note).toBeVisible();
	await expect
		.poll(async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data.metadata.check.ignored)
		.toHaveLength(0);
});

for (const locale of ["en-US", "ar-SA"] as const) {
	test(`mobile page fixes require visible approval (${locale})`, async ({ authPage: page, baseURL }, testInfo) => {
		const ar = locale === "ar-SA";
		await page.setViewportSize({ width: 390, height: 844 });
		await page.request.post("/api/auth/update-user", {
			headers: { origin: baseURL ?? "http://localhost:3030" },
			data: { uiLocale: locale },
		});
		const created = await page.request.post("/api/openapi/resumes", {
			data: { name: "Synthetic mobile fix", tags: [], locale: "en-US", withSampleData: false },
		});
		expect(created.ok()).toBe(true);
		const id = await created.json();
		const read = async () => (await (await page.request.get(`/api/openapi/resumes/${id}`)).json()).data;
		const data = await read();
		data.basics.name = "Synthetic approval author";
		data.basics.website.url = "example.com";
		expect((await page.request.put(`/api/openapi/resumes/${id}`, { data: { data } })).ok()).toBe(true);
		await page.goto(`/builder/${id}?locale=${locale}`);
		await page
			.getByRole("navigation", { name: ar ? "طرق عرض المحرر" : "Editor views" })
			.getByRole("button", { name: ar ? "فحص" : "Check", exact: true })
			.click();
		const issue = page.locator('[data-issue-card="MALFORMED_URL:/basics/website/url"]');
		await issue.getByRole("button", { name: ar ? "عرض على الصفحة" : "Show on page", exact: true }).click();
		await page.getByRole("button", { name: /https:\/\/example.com/ }).click();
		const dialog = page.getByRole("dialog", { name: ar ? "راجع هذا التغيير" : "Review this change", exact: true });
		await expect(dialog.getByText("example.com", { exact: true })).toBeVisible();
		await expect(dialog.getByText("https://example.com", { exact: true })).toBeVisible();
		expect((await read()).basics.website.url).toBe("example.com");
		await settleScreen(page);
		await page.screenshot({ path: testInfo.outputPath("mobile-fix-review.png") });
		await dialog.getByRole("button", { name: ar ? "إلغاء" : "Cancel", exact: true }).click();
		await expect(dialog).not.toBeVisible();
		expect((await read()).basics.website.url).toBe("example.com");
		await issue.getByRole("button", { name: ar ? "عرض على الصفحة" : "Show on page", exact: true }).click();
		await page.getByRole("button", { name: /https:\/\/example.com/ }).click();
		await dialog.getByRole("button", { name: ar ? "قبول التغيير" : "Accept change", exact: true }).click();
		await expect(dialog).not.toBeVisible();
		await expect.poll(async () => (await read()).basics.website.url).toBe("https://example.com");
	});
}
