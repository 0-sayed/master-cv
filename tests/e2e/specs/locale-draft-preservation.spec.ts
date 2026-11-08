import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { expect, test } from "../fixtures/test";

test("switches the real builder without remounting or adding a save while an edit is pending", async ({
	authPage: page,
}, testInfo) => {
	await createSampleResumeFromDashboard(page, testInfo);
	const resumeId = new URL(page.url()).pathname.split("/").at(-1);
	const getSavedData = async () => {
		const response = await page.request.get(`/api/openapi/resumes/${resumeId}`);
		expect(response.ok()).toBe(true);
		return (await response.json()).data;
	};
	const originalData = await getSavedData();
	let saves = 0;
	let release: () => void = () => {};
	let reached: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		reached = resolve;
	});
	await page.route("**/api/rpc/resume/update", async (route) => {
		saves++;
		reached();
		await held;
		await route.continue();
	});
	const input = page.getByRole("textbox", { name: "Full name", exact: true });
	await input.fill("سيرة Synthetic Draft 123");
	await started;
	await input.evaluate((element) => element.setAttribute("data-locale-preservation", "mounted"));
	const snapshot = () =>
		page.evaluate(() => ({
			drafts: Object.fromEntries(
				Object.entries(localStorage).filter(([key]) => key.startsWith("reactive-resume:unsaved:")),
			),
		}));
	const before = await snapshot();
	const navigations: string[] = [];
	page.on("request", (request) => {
		if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations.push(request.url());
	});
	try {
		await page.getByRole("button", { name: "Switch interface to Arabic" }).click();
		await expect(page.locator("html")).toHaveAttribute("lang", "ar-SA");
		await page.getByRole("button", { name: "تغيير الواجهة إلى الإنجليزية" }).click();
		await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
		expect(await input.inputValue()).toBe("سيرة Synthetic Draft 123");
		const after = await snapshot();
		await expect(input).toHaveAttribute("data-locale-preservation", "mounted");
		expect(after).toEqual(before);
		expect(saves).toBe(1);
		expect(navigations).toEqual([]);
		// The held update has not reached persistence; switching itself cannot alter the saved CV.
		expect(await getSavedData()).toEqual(originalData);
	} finally {
		release();
	}
	await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
	expect(await getSavedData()).toEqual({
		...originalData,
		basics: { ...originalData.basics, name: "سيرة Synthetic Draft 123" },
	});
	// Switching must retain the editor's own undo/redo history, not just the displayed input value.
	await page.keyboard.press("ControlOrMeta+z");
	await expect(input).toHaveValue(originalData.basics.name);
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(input).toHaveValue("سيرة Synthetic Draft 123");
	await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("textbox", { name: "Full name", exact: true })).toHaveValue("سيرة Synthetic Draft 123");
});

for (const initialLocale of ["en-US", "ar-SA"] as const) {
	test(`a pending ${initialLocale} switch preserves an open dialog's unsaved value and focus`, async ({
		authPage: page,
	}) => {
		await page.goto(`/dashboard?locale=${initialLocale}`);
		let release: () => void = () => {};
		let reached: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			reached = resolve;
		});
		await page.route("**/api/auth/update-user", async (route) => {
			const response = await route.fetch();
			reached();
			await held;
			await route.fulfill({ response });
		});
		const arabic = initialLocale === "ar-SA";
		await page
			.getByRole("button", { name: arabic ? "تغيير الواجهة إلى الإنجليزية" : "Switch interface to Arabic" })
			.click();
		await started;
		try {
			await page.locator('button[aria-keyshortcuts="N"]').first().click();
			const dialog = page.getByRole("dialog");
			await expect(dialog).toBeVisible();
			await dialog
				.getByRole("button", {
					name: arabic ? "انسخ السيرة الذاتية للحصول على وظيفة" : "Copy a resume for a job",
					exact: false,
				})
				.click();
			const input = dialog.getByRole("textbox");
			await input.fill("مسودة Unsaved Draft ٠١٢");
			await input.evaluate((element) => {
				element.setAttribute("data-dialog-preservation", "mounted");
				(element as HTMLInputElement).setSelectionRange(3, 8);
			});
			release();
			await expect(page.locator("html")).toHaveAttribute("lang", arabic ? "en-US" : "ar-SA");
			await expect(dialog).toBeVisible();
			await expect(input).toHaveAttribute("data-dialog-preservation", "mounted");
			await expect(input).toHaveValue("مسودة Unsaved Draft ٠١٢");
			await expect(input).toBeFocused();
			expect(
				await input.evaluate((element) => [
					(element as HTMLInputElement).selectionStart,
					(element as HTMLInputElement).selectionEnd,
				]),
			).toEqual([3, 8]);
			expect(await dialog.evaluate((element) => getComputedStyle(element).direction)).toBe(arabic ? "ltr" : "rtl");
			await page.keyboard.press("Escape");
			await expect(dialog).not.toBeVisible();
		} finally {
			release();
		}
	});
}
