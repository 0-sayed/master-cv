import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { settleScreen } from "../fixtures/screen";
import { expect, test } from "../fixtures/test";
import { seedVariantReview, variantClient } from "../fixtures/variants";

async function detect(output: string) {
	return new Promise<number>((resolve, reject) => {
		const { IMPECCABLE_BIN: executable, ...env } = process.env;
		const child = spawn(executable ?? "impeccable", ["detect", "--json", "--cdp", "9333"], {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => child.kill("SIGTERM"), 60_000);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("close", (code) => {
			clearTimeout(timeout);
			void Promise.all([writeFile(output, stdout), writeFile(`${output}.stderr`, stderr)]).then(
				() => resolve(code ?? 1),
				reject,
			);
		});
	});
}

async function launchDetectorBrowser() {
	// Refuse an occupied port. Only this job's temporary headless browser is authorized.
	await new Promise<void>((resolve, reject) => {
		const probe = createServer();
		probe.once("error", reject);
		probe.listen(9333, "127.0.0.1", () => probe.close((error) => (error ? reject(error) : resolve())));
	});
	const profile = await mkdtemp(join(tmpdir(), "personal-tools-detector-"));
	try {
		const context = await chromium.launchPersistentContext(profile, {
			headless: true,
			args: ["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9333"],
		});
		context.setDefaultTimeout(30_000);
		return { context, profile };
	} catch (error) {
		await rm(profile, { recursive: true, force: true });
		throw error;
	}
}

test("reports authenticated personal tool design findings without changing saved data", async ({ authPage }, info) => {
	test.setTimeout(900_000);
	const resumeId = await seedVariantReview(authPage, info);
	const api = variantClient(authPage);
	const letter = await api.coverLetters.create({ name: "Synthetic letter", documentLocale: "ar-SA", resumeId });
	const englishLetter = await api.coverLetters.create({
		name: "Synthetic English letter",
		documentLocale: "en-US",
		resumeId,
	});
	const applicationId = await api.applications.create({ company: "Synthetic company", role: "Engineer", resumeId });
	const folder = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
	await mkdir(folder, { recursive: true });
	const { context, profile } = await launchDetectorBrowser();
	try {
		await context.addCookies(await authPage.context().cookies());
		const page = context.pages()[0] ?? (await context.newPage());
		const origin = new URL(authPage.url()).origin;
		for (const locale of ["ar-SA", "en-US"]) {
			await context.request.post(`${origin}/api/auth/update-user`, {
				data: { uiLocale: locale },
				headers: { origin },
			});
			await context.addCookies([{ name: "locale", value: locale, url: origin }]);
			for (const width of [1440, 390]) {
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				for (const [name, path] of [
					["letters-list", "/dashboard?type=letter"],
					["letter", `/builder/letter/${letter.id}`],
					["english-letter", `/builder/letter/${englishLetter.id}`],
					["board", "/dashboard/applications?view=board"],
					["create-dialog", "/dashboard/applications?create=true"],
					["details", `/dashboard/applications?applicationId=${applicationId}`],
				] as const) {
					await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
					await settleScreen(page);
					if (name === "letter" || name === "english-letter")
						await page.locator('[data-slot="letter-review-composer"]').scrollIntoViewIfNeeded();
					if (name === "details" || name === "create-dialog") await expect(page.getByRole("dialog")).toBeVisible();
					await expect(page.locator("html")).toHaveAttribute("lang", locale);
					const output = join(folder, `detector-${name}-${locale}-${width}.json`);
					const code = await detect(output);
					expect([0, 2], `${name}/${locale}/${width}: detector must complete`).toContain(code);
					await page.screenshot({ path: output.replace(/\.json$/u, ".png"), fullPage: true });
					if (name === "details") {
						await page.getByRole("dialog").locator('button[aria-haspopup="menu"]').first().click();
						await page.getByRole("menuitem").first().click();
						await settleScreen(page);
						const editOutput = join(folder, `detector-edit-dialog-${locale}-${width}.json`);
						expect([0, 2]).toContain(await detect(editOutput));
						await page.screenshot({ path: editOutput.replace(/\.json$/u, ".png"), fullPage: true });
					}
				}
			}
		}
		expect((await api.coverLetters.getById({ id: letter.id })).content).toBe(letter.content);
		expect((await api.coverLetters.getById({ id: englishLetter.id })).content).toBe(englishLetter.content);
	} finally {
		await context.close();
		await rm(profile, { recursive: true, force: true });
	}
});

test("reports letter consent and proposal layouts in both interface languages", async ({ authPage }, info) => {
	test.setTimeout(600_000);
	const resumeId = await seedVariantReview(authPage, info);
	const api = variantClient(authPage);
	const source = await api.resume.getById({ id: resumeId });
	await api.career.jobTargets.saveAndSelect({
		resumeId,
		expectedUpdatedAt: new Date(source.updatedAt).toISOString(),
		role: "Engineer",
		text: "TypeScript required.",
	});
	const folder = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
	await mkdir(folder, { recursive: true });
	const { context, profile } = await launchDetectorBrowser();
	try {
		await context.addCookies(await authPage.context().cookies());
		const page = context.pages()[0] ?? (await context.newPage());
		const origin = new URL(authPage.url()).origin;
		for (const locale of ["ar-SA", "en-US"] as const) {
			await context.request.post(`${origin}/api/auth/update-user`, { data: { uiLocale: locale }, headers: { origin } });
			await context.addCookies([{ name: "locale", value: locale, url: origin }]);
			for (const width of [1440, 390]) {
				const letter = await api.coverLetters.create({
					name: "Synthetic reviewed letter",
					documentLocale: locale,
					resumeId,
					content: "<p>Independent manual letter.</p>",
				});
				await page.setViewportSize({ width, height: width === 390 ? 844 : 1024 });
				await page.goto(`${origin}/builder/letter/${letter.id}`, { waitUntil: "domcontentloaded" });
				await settleScreen(page);
				await page
					.getByRole("button", {
						name: locale === "ar-SA" ? "مراجعة خطاب مخصص للوظيفة" : "Review a job-specific letter",
						exact: true,
					})
					.click();
				await expect(page.getByRole("dialog")).toBeVisible();
				await settleScreen(page);
				const consentOutput = join(folder, `detector-letter-consent-${locale}-${width}.json`);
				expect([0, 2]).toContain(await detect(consentOutput));
				await page.screenshot({ path: consentOutput.replace(/\.json$/u, ".png"), fullPage: true });
				await page
					.getByRole("dialog")
					.getByRole("button", { name: locale === "ar-SA" ? "بدء المراجعة" : "Start review", exact: true })
					.click();
				const accept = page.getByRole("button", {
					name: locale === "ar-SA" ? "قبول المقترح" : "Accept proposal",
					exact: true,
				});
				await expect(accept).toBeVisible();
				await accept.scrollIntoViewIfNeeded();
				await settleScreen(page);
				const proposalOutput = join(folder, `detector-letter-proposal-${locale}-${width}.json`);
				expect([0, 2]).toContain(await detect(proposalOutput));
				await page.screenshot({ path: proposalOutput.replace(/\.json$/u, ".png"), fullPage: true });
				expect(
					await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
				).toBe(true);
				expect((await api.coverLetters.getById({ id: letter.id })).content).toBe(letter.content);
			}
		}
	} finally {
		await context.close();
		await rm(profile, { recursive: true, force: true });
	}
});
