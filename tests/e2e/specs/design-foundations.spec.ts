import { test, expect } from "@playwright/test";

for (const locale of ["ar-SA", "en-US"] as const) {
	for (const dark of [false, true]) {
		test(`${locale} ${dark ? "dark" : "light"} foundations`, async ({ page }) => {
			await page.goto(`/?locale=${locale}`);
			await expect(page.locator("html")).toHaveAttribute("lang", locale);
			const tokens = await page.evaluate(async (dark) => {
				document.documentElement.classList.toggle("dark", dark);
				await document.fonts.ready;
				const styles = getComputedStyle(document.documentElement);
				return Object.fromEntries(
					["bg", "surface", "line-2", "paper", "paper-ink"].map((name) => {
						const value = styles.getPropertyValue(`--${name}`).trim().toUpperCase();
						return [
							name,
							value.length === 4
								? `#${value
										.slice(1)
										.split("")
										.map((digit) => digit + digit)
										.join("")}`
								: value,
						];
					}),
				);
			}, dark);
			expect(tokens).toEqual(
				dark
					? { bg: "#100F0C", surface: "#1A1915", "line-2": "#848279", paper: "#FFFFFF", "paper-ink": "#20231F" }
					: { bg: "#F1F0EB", surface: "#FAF9F6", "line-2": "#8A8982", paper: "#FFFFFF", "paper-ink": "#20231F" },
			);
			const family = locale === "ar-SA" ? "Noto Sans Arabic" : "Noto Sans";
			for (const weight of [400, 500, 600]) {
				expect(
					await page.evaluate(
						async ({ family, weight }) =>
							(
								await document.fonts.load(
									`${weight} 16px "${family}"`,
									family === "Noto Sans Arabic" ? "سيرة" : "Resume",
								)
							).length,
						{ family, weight },
					),
				).toBeGreaterThan(0);
			}
			expect(
				await page.evaluate(async () => (await document.fonts.load('500 24px "Noto Serif"')).length),
			).toBeGreaterThan(0);
			expect(await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toContain(family);
			const contrast = await page.evaluate(() => {
				const style = getComputedStyle(document.documentElement);
				const luminance = (name: string) => {
					const raw = style.getPropertyValue(`--${name}`).trim().slice(1);
					const hex =
						raw.length === 3
							? raw
									.split("")
									.map((digit) => digit + digit)
									.join("")
							: raw;
					const channel = (offset: number) => {
						const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
						return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
					};
					return channel(0) * 0.2126 + channel(2) * 0.7152 + channel(4) * 0.0722;
				};
				return [
					["ink", "surface", 4.5],
					["ink-2", "surface", 4.5],
					["ink-3", "surface", 4.5],
					["on-accent", "accent", 4.5],
					["on-danger", "danger", 4.5],
					["line-2", "raised", 3],
					["line-2", "bg", 3],
				].map(([first, second, minimum]) => {
					const values = [luminance(String(first)), luminance(String(second))];
					return {
						pair: `${first}/${second}`,
						ratio: (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05),
						minimum: Number(minimum),
					};
				});
			});
			for (const pair of contrast) expect(pair.ratio, pair.pair).toBeGreaterThanOrEqual(pair.minimum);
		});
	}
}

test("a failed Arabic font stays operable and cannot qualify as a loaded required face", async ({ page }) => {
	await page.route("**/fonts/noto-sans-arabic/**", (route) => route.abort());
	await page.goto("/auth/login?locale=ar-SA");
	await expect(page.locator("html")).toHaveAttribute("lang", "ar-SA");
	const input = page.getByRole("textbox").first();
	await input.fill("synthetic@example.test");
	await expect(input).toHaveValue("synthetic@example.test");
	const requiredFace = await page.evaluate(async () => {
		try {
			return (await document.fonts.load('400 16px "Noto Sans Arabic"', "سيرة")).length > 0;
		} catch {
			return false;
		}
	});
	expect(requiredFace).toBe(false);
});
