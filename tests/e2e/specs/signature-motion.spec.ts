import { createSampleResumeFromDashboard } from "../fixtures/resume";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const theme of ["light", "dark"] as const) {
		for (const reduced of [false, true]) {
			test(`${locale} ${theme} signature feedback ${reduced ? "reduced" : "animated"} stays local and finishes`, async ({
				authPage: page,
				baseURL,
			}, info) => {
				test.setTimeout(150_000);
				await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
				await page.setViewportSize({ width: 1440, height: 1024 });
				await expect(
					await page.request.post("/api/auth/update-user", {
						headers: { origin: baseURL },
						data: { uiLocale: locale },
					}),
				).toBeOK();
				await page.context().addCookies([
					{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3030" },
					{ name: "theme", value: theme, url: baseURL ?? "http://localhost:3030" },
				]);
				await page.goto("/dashboard");
				await settleScreen(page);
				if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
				else await expect(page.locator("html")).not.toHaveClass(/dark/);
				const mark = page.locator('[data-slot="brand-mark"]:visible').first();
				const before = await mark.boundingBox();
				if (!before) throw new Error("Brand mark missing");
				expect(before.width).toBe(before.height);
				const header = page.locator('[data-slot="dashboard-header-content"]');
				const headerBox = await header.boundingBox();
				await mark.locator("xpath=ancestor::a[1]").focus();
				if (!reduced) await expect(mark).toHaveAttribute("data-playing", "true");
				await page.waitForTimeout(180);
				expect(await mark.boundingBox()).toEqual(before);
				expect(await header.boundingBox()).toEqual(headerBox);
				await expect(mark).toHaveAttribute("data-playing", "false");
				expect(await mark.boundingBox()).toEqual(before);

				await createSampleResumeFromDashboard(page, info);
				await page.getByRole("tab", { name: locale === "ar-SA" ? "كتابة" : "Write", exact: true }).click();
				const name = page.getByRole("textbox", { name: locale === "ar-SA" ? "الاسم الكامل" : "Full name", exact: true });
				await expect(name).toBeVisible();
				await expect(page.locator('[data-slot="page-overlay"]').first()).toBeVisible({ timeout: 40_000 });
				const download = page
					.getByRole("button", { name: locale === "ar-SA" ? "تنزيل PDF" : "Download PDF", exact: true })
					.filter({ visible: true })
					.first();
				const toolbar = download.locator("xpath=ancestor::header[1]");
				const toolbarBox = await toolbar.boundingBox();
				await name.fill("Motion sample — سارة");
				await name.blur();
				const saveTick = page.locator('[role="status"] [data-slot="success-tick"]').first();
				await expect(saveTick).toBeVisible({ timeout: 15_000 });
				await expect(saveTick.locator("path")).toHaveCSS("stroke-dashoffset", /^0(?:px)?$/);
				await expect(saveTick.locator("path")).toHaveCSS("animation-name", reduced ? "none" : "signature-draw");
				const highlight = page.locator('[data-slot="preview-edit-highlight"][data-section-id="header"]').first();
				if (reduced) await expect(highlight).toBeHidden();
				else {
					await expect(highlight).toBeAttached({ timeout: 30_000 });
					const acknowledgedRegion = await highlight.elementHandle();
					await expect(highlight).toHaveCSS("opacity", "0");
					// An identical save echo must not discard the acknowledged preview region.
					expect(await acknowledgedRegion?.evaluate((element) => element.isConnected)).toBe(true);
				}
				expect(await toolbar.boundingBox()).toEqual(toolbarBox);

				const feedback = download.locator('[data-slot="action-feedback"]');
				const widths = await download.evaluate((button) => {
					const values: number[] = [];
					const start = performance.now();
					const sample = () => {
						values.push(button.clientWidth);
						if (performance.now() - start < 4500) requestAnimationFrame(sample);
					};
					sample();
					(window as unknown as { motionWidths: number[] }).motionWidths = values;
					return button.clientWidth;
				});
				await feedback.evaluate((element) => {
					const states = [element.getAttribute("data-state")];
					const finalOffsets: string[] = [];
					const sampleReducedFinal = () => {
						const path = element.querySelector('[data-slot="success-tick"] path');
						if (path && getComputedStyle(path).animationName === "none")
							finalOffsets.push(getComputedStyle(path).strokeDashoffset);
					};
					element.addEventListener("animationend", (event) => {
						if ((event as AnimationEvent).animationName === "signature-draw" && event.target instanceof SVGElement)
							finalOffsets.push(getComputedStyle(event.target).strokeDashoffset);
					});
					new MutationObserver(() => {
						states.push(element.getAttribute("data-state"));
						sampleReducedFinal();
					}).observe(element, {
						attributes: true,
						attributeFilter: ["data-state"],
						childList: true,
						subtree: true,
					});
					Object.assign(window, { motionStates: states, motionFinalOffsets: finalOffsets });
				});
				const file = page.waitForEvent("download");
				await download.click();
				const result = await file;
				expect(result.suggestedFilename()).toMatch(/\.pdf$/);
				await expect(feedback).toHaveAttribute("data-state", "ready");
				await expect(download.getByRole("status")).toHaveText(locale === "ar-SA" ? "ملف PDF جاهز" : "PDF ready");
				await expect(feedback).toHaveAttribute("data-state", "idle");
				const finalOffsets = await page.evaluate(
					() => (window as unknown as { motionFinalOffsets: string[] }).motionFinalOffsets,
				);
				expect(
					finalOffsets.some((offset) => /^0(?:px)?$/.test(offset)),
					"The tick actually reaches its final stroke before removal",
				).toBe(true);
				const measured = await page.evaluate(() => (window as unknown as { motionWidths: number[] }).motionWidths);
				expect(measured.every((width) => width === widths)).toBe(true);
				const states = await page.evaluate(
					() => (window as unknown as { motionStates: (string | null)[] }).motionStates,
				);
				expect(states).toEqual(expect.arrayContaining(["pending", "ready", "idle"]));
				expect(await toolbar.boundingBox()).toEqual(toolbarBox);

				await page.getByRole("tab", { name: locale === "ar-SA" ? "التصميم" : "Design", exact: true }).click();
				const thumbnail = page.locator('[data-slot="template-thumbnail"]').first();
				const card = thumbnail.locator("xpath=..");
				await expect(thumbnail.locator(".template-alternate")).toHaveAttribute("data-ready", "true");
				const cardBox = await card.boundingBox();
				const thumbBox = await thumbnail.boundingBox();
				if (!thumbBox) throw new Error("Template thumbnail missing");
				await card.focus();
				await expect(thumbnail.locator(".template-alternate")).toHaveCSS("opacity", "1");
				const activeBox = await thumbnail.boundingBox();
				if (!activeBox) throw new Error("Focused template missing");
				expect(activeBox.y - thumbBox.y).toBe(reduced ? 0 : -2);
				expect(await card.boundingBox()).toEqual(cardBox);
				await page.screenshot({ path: info.outputPath(`${locale}-${reduced ? "reduced" : "animated"}.png`) });
			});
		}
	}
}
