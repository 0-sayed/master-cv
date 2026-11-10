import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const platform of ["MacIntel", "Win32"]) {
		test(`${locale} ${platform} editor reorder hints isolate real Alt shortcuts`, async ({
			authPage: page,
			baseURL,
		}, info) => {
			await page.addInitScript((value) => Object.defineProperty(navigator, "platform", { value }), platform);
			await expect(
				await page.request.post("/api/auth/update-user", { headers: { origin: baseURL }, data: { uiLocale: locale } }),
			).toBeOK();
			await page.context().addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" }]);
			await page.setViewportSize({ width: 1440, height: 1024 });
			await createSampleResumeFromDashboard(page, info);
			await page.getByRole("tab", { name: locale === "ar-SA" ? "كتابة" : "Write", exact: true }).click();
			const hint = page.getByText(locale === "ar-SA" ? /اسحب أو اضغط/ : /Drag or press/);
			await expect(hint).toBeVisible();
			const keys = hint.locator("kbd");
			await expect(keys).toHaveText(platform === "MacIntel" ? "⌥ + ↑/↓" : "Alt + ↑/↓");
			await expect(keys).toHaveAttribute("dir", "ltr");
			await expect(keys).toHaveCSS("unicode-bidi", "isolate");
			if (locale === "ar-SA")
				expect(await hint.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
					14,
				);
			const rows = page.locator('[id^="sidebar-"][data-section-id]');
			const before = await rows.evaluateAll((elements) => elements.map((el) => el.getAttribute("data-section-id")));
			expect(before.length).toBeGreaterThan(1);
			const originalId = before[0];
			if (!originalId) throw new Error("First outline section missing");
			const first = rows
				.filter({ has: page.locator("button[aria-expanded]") })
				.and(page.locator(`[data-section-id="${originalId}"]`));
			const title = first.locator("button[aria-expanded]").first();
			await title.focus();
			await page.keyboard.press("Alt+ArrowDown");
			await expect(rows.nth(1)).toHaveAttribute("data-section-id", before[0] ?? "");
			await title.focus();
			await page.keyboard.press("Alt+ArrowUp");
			await expect(rows.first()).toHaveAttribute("data-section-id", before[0] ?? "");
			await settleScreen(page);
			await page.screenshot({ path: info.outputPath(`${locale}-${platform}-editor.png`) });
		});
	}
}
