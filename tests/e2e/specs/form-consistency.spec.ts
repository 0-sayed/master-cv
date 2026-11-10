import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} resume and letter mobile navigation use readable shared type`, async ({ authPage: page }, info) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await createSampleResumeFromDashboard(page, info);
		const resumePath = new URL(page.url()).pathname;
		const created = await page.request.post("/api/openapi/cover-letters", { data: { name: "Mobile type guard" } });
		await expect(created).toBeOK();
		const letter = await created.json();
		for (const path of [resumePath, `/builder/letter/${letter.id}`]) {
			await page.goto(`${path}?locale=${locale}`);
			const navigation = page.getByRole("navigation", { name: locale === "ar-SA" ? "طرق عرض المحرر" : "Editor views" });
			await expect(navigation).toBeVisible();
			for (const control of await navigation.getByRole("button").all()) {
				expect(
					await control.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
				).toBeGreaterThanOrEqual(locale === "ar-SA" ? 14 : 12);
			}
		}
	});
}

for (const locale of ["ar-SA", "en-US"] as const) {
	test(`${locale} version name and Save use one height`, async ({ authPage: page, baseURL }, info) => {
		test.setTimeout(90_000);
		await createSampleResumeFromDashboard(page, info);
		await page.request.post("/api/auth/update-user", {
			headers: { origin: baseURL ?? "http://localhost:3030" },
			data: { uiLocale: locale },
		});
		await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
		await page.reload();
		await page.getByRole("button", { name: locale === "ar-SA" ? "سجل النسخ" : "History", exact: true }).click();
		const sheet = page.getByRole("dialog");
		const input = sheet.getByRole("textbox", { name: locale === "ar-SA" ? "اسم هذا الإصدار" : "Name this version" });
		await expect(input).toBeVisible();
		const button = input.locator("..").getByRole("button", { name: locale === "ar-SA" ? "حفظ" : "Save", exact: true });
		const inputBox = await input.boundingBox();
		const buttonBox = await button.boundingBox();
		if (!inputBox || !buttonBox) throw new Error("Version row missing");
		expect(Math.abs(inputBox.height - buttonBox.height)).toBeLessThanOrEqual(1);
		await expect(input).toHaveAttribute(
			"placeholder",
			locale === "ar-SA" ? "اسم الإصدار، مثل: نسخة التقديم" : "Version name, e.g. Application draft",
		);
	});
}
test("Arabic job link placeholder is LTR and mixed content selects its own direction", async ({
	authPage: page,
	baseURL,
}) => {
	await page.request.post("/api/auth/update-user", {
		headers: { origin: baseURL ?? "http://localhost:3030" },
		data: { uiLocale: "ar-SA" },
	});
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3030" }]);
	await page.goto("/dashboard/applications");
	await page.getByRole("button", { name: "حفظ الوظيفة", exact: true }).click();
	const field = page.getByPlaceholder("https://…");
	await expect(field).toBeVisible();
	await expect(field).toHaveAttribute("dir", "auto");
	expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
	expect(await field.evaluate((el) => getComputedStyle(el).textAlign)).toBe("start");
	await field.fill("مهندس برمجيات في الرياض");
	expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe("rtl");
	await field.fill("https://example.test/job");
	expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
});
test("career keeps its subtitle without the duplicate ownership footer", async ({ authPage: page }) => {
	await page.goto("/dashboard/career/information");
	await expect(page.getByRole("heading", { name: "Career information", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Add experience", exact: true })).toBeVisible();
	await expect(page.locator("main [role=status]")).toHaveCount(0);
});
test("Arabic account email and resume URL fields stay LTR", async ({ authPage: page, baseURL }, info) => {
	test.setTimeout(90_000);
	await page.request.post("/api/auth/update-user", {
		headers: { origin: baseURL ?? "http://localhost:3030" },
		data: { uiLocale: "ar-SA" },
	});
	await page.context().addCookies([{ name: "locale", value: "ar-SA", url: baseURL ?? "http://localhost:3030" }]);
	await page.goto("/dashboard/settings/account");
	await expect(page.locator('input[type="email"]')).toHaveAttribute("dir", "ltr");
	await createSampleResumeFromDashboard(page, info);
	await page.getByRole("tab", { name: /^كتابة$|^Write$/ }).click();
	for (const field of await page.locator('input[type="email"],input[type="tel"],input[inputmode="url"]').all()) {
		await expect(field).toHaveAttribute("dir", "ltr");
	}
	expect(await page.locator('input[inputmode="url"]').count()).toBeGreaterThan(0);
});

test("editor picture URL and adjacent visibility action share a height", async ({ authPage: page }, info) => {
	await createSampleResumeFromDashboard(page, info);
	await page.getByRole("tab", { name: "Write", exact: true }).click();
	await page.locator("#sidebar-picture").getByRole("button", { name: "Edit", exact: true }).click();
	const input = page.getByRole("textbox", { name: "URL", exact: true });
	await expect(input).toBeVisible();
	const action = input.locator("..").getByRole("button");
	const fieldBox = await input.boundingBox();
	const actionBox = await action.boundingBox();
	if (!fieldBox || !actionBox) throw new Error("Picture URL/action missing");
	expect(Math.abs(fieldBox.height - actionBox.height)).toBeLessThanOrEqual(1);
});
