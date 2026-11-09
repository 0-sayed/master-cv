import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const width of [390, 1440]) {
		test.describe(`${locale} ${width} brand fidelity`, () => {
			test.beforeEach(async ({ page, context, baseURL }) => {
				await context.addCookies([{ name: "locale", value: locale, url: baseURL ?? "http://localhost:3000" }]);
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				await page.goto("/auth/login");
				await settleScreen(page);
			});

			test("header mark has square rendered geometry", async ({ page }) => {
				const mark = page.locator('header img[src^="/master-cv/"]:visible');
				await expect(mark).toBeVisible();
				const box = await mark.boundingBox();
				if (!box) throw new Error("Brand mark has no rendered box");
				expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
				expect(box.width).toBeCloseTo(32, 0);
				await mark.evaluate(async (element) => {
					if (element instanceof HTMLImageElement) await element.decode();
				});
				const inkRatio = await mark.evaluate((element) => {
					if (!(element instanceof HTMLImageElement)) throw new Error("Brand mark is not an image");
					const canvas = document.createElement("canvas");
					canvas.width = 32;
					canvas.height = 32;
					const context = canvas.getContext("2d");
					if (!context) throw new Error("Canvas unavailable for visible brand geometry");
					context.drawImage(element, 0, 0, 32, 32);
					const pixels = context.getImageData(0, 0, 32, 32).data;
					const xs: number[] = [];
					const ys: number[] = [];
					for (let y = 0; y < 32; y++)
						for (let x = 0; x < 32; x++)
							if ((pixels[(y * 32 + x) * 4 + 3] ?? 0) > 127) {
								xs.push(x);
								ys.push(y);
							}
					return (Math.max(...xs) - Math.min(...xs) + 1) / (Math.max(...ys) - Math.min(...ys) + 1);
				});
				// The C/check ink is slightly wider than tall, never flattened into an ellipse.
				expect(inkRatio).toBeGreaterThanOrEqual(0.95);
				expect(inkRatio).toBeLessThanOrEqual(1.2);
				// The SVG itself must preserve the square coordinate system as well.
				const source = await mark.getAttribute("src");
				const svg = await (await page.request.get(source ?? "")).text();
				expect(svg).not.toContain('preserveAspectRatio="none"');
				for (const path of [
					"/auth/register",
					"/auth/verify-email",
					"/auth/forgot-password",
					"/auth/reset-password?token=synthetic-geometry",
					"/auth/missing-fidelity-route/root-page",
				]) {
					await page.goto(path);
					if (path === "/auth/missing-fidelity-route/root-page") {
						const notFoundTitle = page.locator('[data-slot="alert-title"]');
						await expect(notFoundTitle).toHaveText(
							locale === "en-US" ? "We couldn't find that page" : "لم نتمكن من العثور على تلك الصفحة",
						);
						await expect(notFoundTitle).toBeVisible();
					}
					await settleScreen(page);
					for (const dark of [false, true]) {
						await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
						const marks = page.locator('img[src^="/master-cv/"]:visible');
						await expect(marks.first()).toBeVisible();
						expect(await marks.count()).toBeGreaterThan(0);
						for (const image of await marks.all()) {
							const rendered = await image.boundingBox();
							if (!rendered) throw new Error("Brand mark has no rendered box");
							expect(Math.abs(rendered.width - rendered.height)).toBeLessThanOrEqual(1);
							await expect(image).toHaveCSS("transform", "none");
						}
					}
				}
			});

			test("header contains the visible wordmark", async ({ page }) => {
				await expect(page.locator("header").getByText("Master CV", { exact: true })).toBeVisible();
			});

			test("embedded password eye stays on the left and preserves its value", async ({ page }) => {
				const label = page.locator('label[for="login-password"]');
				await expect(label).toHaveCSS("font-size", "14px");
				await expect(label).toHaveCSS("line-height", "22px");
				await expect(label).toHaveCSS("font-weight", "600");
				const input = page.locator('input[name="password"]');
				const toggle = page.getByRole("button", { name: /(?:Show|Hide) password|(?:إظهار|إخفاء) كلمة المرور/ });
				await input.fill("Synthetic-visibility-123");
				const inputBox = await input.boundingBox();
				const eyeBox = await toggle.boundingBox();
				if (!inputBox || !eyeBox) throw new Error("Password control has no rendered box");
				expect(eyeBox.x - inputBox.x).toBeLessThan(5);
				expect(eyeBox.width).toBeCloseTo(44, 0);
				await toggle.click();
				await expect(input).toHaveAttribute("type", "text");
				await expect(input).toHaveValue("Synthetic-visibility-123");
				await expect(toggle).toHaveAttribute("aria-pressed", "true");
				await toggle.click();
				await expect(input).toHaveAttribute("type", "password");
				await expect(input).toHaveValue("Synthetic-visibility-123");
			});

			test("language control matches its viewport variant", async ({ page }) => {
				const control = page.getByRole("button", { name: /Switch interface|تغيير الواجهة/ });
				const styles = await control.evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						background: style.backgroundColor,
						border: style.borderTopColor,
						borderWidth: style.borderTopWidth,
						radius: style.borderRadius,
					};
				});
				expect(styles.background).not.toMatch(/transparent|rgba\([^)]*,\s*0\)/);
				expect(styles.border).not.toMatch(/transparent|rgba\([^)]*,\s*0\)/);
				expect(styles.borderWidth).toBe("1px");
				expect(styles.radius).toBe("8px");
				const box = await control.boundingBox();
				if (!box) throw new Error("Language control has no rendered box");
				expect(box.height).toBeCloseTo(width === 390 ? 48 : 44, 0);
				if (width === 390) {
					expect(box.width).toBeCloseTo(52, 0);
					await expect(control.locator("svg")).toBeHidden();
				} else {
					await expect(control.locator("svg")).toBeVisible();
					const globe = await control.locator("svg").boundingBox();
					expect(globe?.width).toBeCloseTo(18, 0);
				}
			});

			if (width === 1440) {
				test("story panel contains no brand logo", async ({ page }) => {
					const story = page.locator("section").filter({ has: page.locator("h2") });
					await expect(story).toBeVisible();
					await expect(story.locator('img[src^="/master-cv/"]')).toHaveCount(0);
					const storyBox = await story.boundingBox();
					const formBox = await page.locator("main").boundingBox();
					if (!storyBox || !formBox) throw new Error("Auth columns have no rendered boxes");
					expect(storyBox.x < formBox.x).toBe(locale === "ar-SA");
					if (locale === "en-US") await expect(story.locator("h2")).toHaveCSS("font-family", /Noto Serif/);
				});
			} else {
				test("mobile top bar is a 64px bordered surface", async ({ page }) => {
					const header = page.locator("header");
					expect((await header.boundingBox())?.height).toBeCloseTo(64, 0);
					await expect(header).toHaveCSS("border-bottom-width", "1px");
				});
			}
		});
	}
}

test("workspace icon-only marks stay square without duplicate wordmarks", async ({ authPage }) => {
	for (const width of [1440, 768, 390]) {
		await authPage.setViewportSize({ width, height: 1024 });
		for (const path of ["/dashboard", "/dashboard/career/information"]) {
			await authPage.goto(path);
			await settleScreen(authPage);
			const marks = authPage.locator('img[src^="/master-cv/"]:visible');
			await expect(marks.first()).toBeVisible();
			expect(await marks.count()).toBeGreaterThan(0);
			for (const mark of await marks.all()) {
				const box = await mark.boundingBox();
				if (!box) throw new Error("Brand mark has no rendered box");
				expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);
			}
			if (width === 1440)
				await expect(authPage.getByRole("complementary").getByText("Master CV", { exact: true })).toBeVisible();
		}
	}
});
