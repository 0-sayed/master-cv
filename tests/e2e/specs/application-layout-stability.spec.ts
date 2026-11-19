import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { variantClient } from "../fixtures/variants";

test("board drop targets use their own stage color for pointer and keyboard dragging", async ({ authPage: page }) => {
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.goto("/dashboard/applications");
	await variantClient(page).applications.create({ company: "Drag Company", role: "Drag Engineer" });
	await page.goto("/dashboard/applications?view=board&locale=en-US");
	const handle = page.getByRole("button", { name: "Move Drag Engineer at Drag Company" });
	await expect(handle).toBeVisible();
	await settleScreen(page);
	for (const dark of [false, true]) {
		await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
		for (const stage of ["applied", "screening", "interview", "offer"]) {
			await handle.scrollIntoViewIfNeeded();
			const start = await handle.boundingBox();
			const target = page.locator(`[data-stage="${stage}"]`);
			if (!start) throw new Error("Board drag handle is not visible");
			await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
			await page.mouse.down();
			await page.mouse.move(start.x + start.width / 2 + 10, start.y + start.height / 2 + 10, { steps: 3 });
			await expect(handle).toHaveAttribute("aria-pressed", "true");
			// Center the destination before measuring it so edge auto-scroll cannot move it away from the pointer.
			await target.evaluate((element) =>
				element.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" }),
			);
			const end = await target.boundingBox();
			if (!end) throw new Error("Board drag target is not visible");
			await page.mouse.move(end.x + end.width / 2, end.y + 40, { steps: 12 });
			await expect(target).toHaveAttribute("data-drop-active", "true");
			await expect(target.locator("..")).toHaveClass(/stage-drop-target/);
			await expect
				.poll(() =>
					target.locator("..").evaluate((element) => {
						const styles = getComputedStyle(element);
						const dot = element.querySelector("h2 span");
						return dot ? styles.outlineColor === getComputedStyle(dot).backgroundColor : false;
					}),
				)
				.toBe(true);
			await page.keyboard.press("Escape");
			await page.mouse.up();
			await expect(handle).not.toHaveAttribute("aria-pressed", "true");
		}
	}
	await handle.scrollIntoViewIfNeeded();
	await handle.focus();
	await page.keyboard.press("Space");
	await expect(page.locator('[data-drop-active="true"]')).toHaveCount(1);
	await expect(page.locator('[data-drop-active="true"]').locator("..")).toHaveClass(/stage-drop-target/);
	await page.keyboard.press("Escape");
	await expect(page.locator('[data-drop-active="true"]')).toHaveCount(0);
});

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [1440, 390]) {
		test(`${locale} at ${width}: an empty interview explains the required application`, async ({ authPage: page }) => {
			await page.setViewportSize({ width, height: 844 });
			await page.goto("/dashboard/applications");
			await variantClient(page).applications.create({ company: "Validation Company", role: "Validation Engineer" });
			await page.goto(`/dashboard/applications?view=calendar&locale=${locale}`);
			await page
				.locator(".calendar-agenda")
				.getByRole("button", { name: locale === "ar-SA" ? "جدولة المقابلة" : "Schedule interview", exact: true })
				.first()
				.click();
			const dialog = page.getByRole("dialog");
			const save = dialog.getByRole("button", {
				name: locale === "ar-SA" ? "احفظ المقابلة" : "Save interview",
				exact: true,
			});
			await expect(save).toBeEnabled();
			await save.click();
			await expect(dialog.getByRole("alert")).toContainText(
				locale === "ar-SA" ? "اختر طلب تقديم." : "Choose an application.",
			);
			await expect(dialog.getByRole("combobox").first()).toBeFocused();
			await expect(dialog.getByRole("combobox").first()).toHaveAttribute("aria-invalid", "true");
			const box = await dialog.boundingBox();
			if (!box) throw new Error("Interview dialog has no visible bounds");
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
			expect(await dialog.innerText()).not.toMatch(/[٠-٩۰-۹]/u);
		});
	}
	for (const width of [1920, 1440, 1280, 1024, 390]) {
		test(`${locale} at ${width}: application navigation keeps the content edges stable`, async ({ authPage: page }) => {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/dashboard/applications");
			const id = await variantClient(page).applications.create({ company: "Layout Company", role: "Layout Engineer" });
			await page.context().addCookies([{ name: "locale", value: locale, url: new URL(page.url()).origin }]);
			await page.request.post("/api/auth/update-user", {
				data: { uiLocale: locale },
				headers: { origin: new URL(page.url()).origin },
			});
			await page.goto(`/dashboard/applications?view=list&locale=${locale}`);
			await settleScreen(page);
			await expect(page.getByText("Layout Engineer", { exact: true })).toBeVisible();
			const samples = await page.evaluate(() => {
				const state = { active: true, values: [] as { x: number; width: number }[] };
				Object.assign(window, { applicationLayoutSamples: state });
				const sample = () => {
					const node = document.querySelector('[data-slot="dashboard-content"]');
					if (node) {
						const box = node.getBoundingClientRect();
						state.values.push({ x: box.x, width: box.width });
					}
					if (state.active) requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
				return true;
			});
			expect(samples).toBe(true);
			await page.getByText("Layout Engineer", { exact: true }).click();
			await expect(page).toHaveURL(new RegExp(`/dashboard/applications/${id}(?:\\?|$)`));
			await expect(page.getByRole("heading", { name: "Layout Engineer", exact: true })).toBeVisible();
			await page
				.getByRole("link", { name: locale === "ar-SA" ? "العودة إلى الطلبات" : "Back to applications" })
				.click();
			await settleScreen(page);
			const boxes = await page.evaluate(() => {
				const state = (
					window as unknown as { applicationLayoutSamples: { active: boolean; values: { x: number; width: number }[] } }
				).applicationLayoutSamples;
				state.active = false;
				return state.values;
			});
			expect(boxes.length).toBeGreaterThan(2);
			expect(Math.max(...boxes.map((b) => b.width)) - Math.min(...boxes.map((b) => b.width))).toBeLessThan(1);
			expect(Math.max(...boxes.map((b) => b.x)) - Math.min(...boxes.map((b) => b.x))).toBeLessThan(1);
		});
	}
}
