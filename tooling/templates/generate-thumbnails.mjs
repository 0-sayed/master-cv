import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Wrap the existing production /templates/$ PDF preview. Never duplicate or modify its renderer.
const root = fileURLToPath(new URL("../..", import.meta.url));
const appURL = process.argv[process.argv.indexOf("--url") + 1];
if (!appURL || !/^https?:\/\/(?:localhost|127\.0\.0\.1):\d+$/u.test(appURL))
	throw new Error("Supply --url http://localhost:<port>");
const schema = await readFile(join(root, "packages/schema/src/templates.ts"), "utf8");
const templates = [...schema.slice(schema.indexOf("z.enum(["), schema.indexOf("]);")).matchAll(/"([a-z]+)"/gu)].map(
	(match) => match[1],
);
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome", headless: true });
const scratch = await mkdtemp(join(tmpdir(), "master-cv-previews-"));
try {
	for (const locale of ["ar-SA", "en-US"]) {
		const context = await browser.newContext();
		await context.addCookies([{ name: "locale", value: locale, url: appURL }]);
		const page = await context.newPage();
		for (const template of templates) {
			await page.goto(`${appURL}/templates/${template}.pdf?locale=${locale}`);
			await page.locator('iframe[src^="blob:"]').waitFor({ timeout: 120_000 });
			const bytes = await page.evaluate(async () => {
				await document.fonts.ready;
				const frame = document.querySelector("iframe");
				if (!frame) throw new Error("Preview missing");
				return Array.from(new Uint8Array(await (await fetch(frame.src.split("#")[0])).arrayBuffer()));
			});
			const suffix = locale === "en-US" ? "en-US" : "";
			const directory = join(root, "apps/web/public/templates");
			for (const format of ["pdf", "jpg", "thumb"]) await mkdir(join(directory, format, suffix), { recursive: true });
			const pdf = join(directory, "pdf", suffix, `${template}.pdf`);
			await writeFile(pdf, Buffer.from(bytes));
			const raster = join(scratch, `${template}-${locale}`);
			execFileSync("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1400", "-png", pdf, raster], { stdio: "pipe" });
			execFileSync("python3", [
				"-c",
				'from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert("RGB"); im.thumbnail((688,974),Image.LANCZOS); im.save(sys.argv[2],quality=88,optimize=True); im.thumbnail((344,487),Image.LANCZOS); im.save(sys.argv[3],quality=88,method=6)',
				`${raster}.png`,
				join(directory, "jpg", suffix, `${template}.jpg`),
				join(directory, "thumb", suffix, `${template}.webp`),
			]);
			console.log(`${locale} ${template}: PDF, JPG and WebP regenerated`);
		}
		await context.close();
	}
} finally {
	await browser.close();
	await rm(scratch, { recursive: true, force: true });
}
