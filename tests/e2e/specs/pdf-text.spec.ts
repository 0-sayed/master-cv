import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
// @boundaries-ignore shared test-only critical-fact comparator
import { compareQualification } from "../../../tooling/document-qualification/compare";
// @boundaries-ignore shared test-only independent readers
import { extractQualificationPdf } from "../../../tooling/document-qualification/extract";
// @boundaries-ignore shared test-only qualification fixtures, never bundled into the app
import { qualificationFixtures } from "../../../tooling/document-qualification/fixtures";
import { expect, test } from "../fixtures/test";

for (const locale of ["en-US", "ar-SA"])
	for (const width of [1440, 390])
		test(`T001 ${locale} ${width}px public checker keeps file processing private`, async ({ page }, testInfo) => {
			await page.context().addCookies([{ name: "locale", value: locale, url: String(testInfo.project.use.baseURL) }]);
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/ats-checker");
			await expect(page.locator('input[type="file"]')).toHaveCount(0);
			await expect(page.locator(".score-ring")).toHaveCount(0);
			await expect(
				page.getByRole("link", {
					name: locale === "ar-SA" ? "فتح مساحة العمل الخاصة" : "Open private workspace",
					exact: true,
				}),
			).toHaveAttribute("href", "/auth/login");
			await page.screenshot({ path: testInfo.outputPath("private-checker.png"), fullPage: true });
		});

for (const documentLanguage of ["ar", "en"] as const)
	for (const width of [1440, 390]) {
		test(`T001 ${documentLanguage} document survives UI locale switches and ${width}px browser download`, async ({
			authPage: page,
		}, testInfo) => {
			test.setTimeout(180_000);
			const diagnostics: { kind: string; message: string }[] = [];
			page.on("pageerror", (error) => diagnostics.push({ kind: "pageerror", message: error.message }));
			page.on("console", (message) => {
				if (message.type() === "error" || message.type() === "warning")
					diagnostics.push({ kind: message.type(), message: message.text() });
			});
			page.on("requestfailed", (request) =>
				diagnostics.push({
					kind: "requestfailed",
					message: `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
				}),
			);
			await page.setViewportSize({ width, height: 1000 });
			const fixture = qualificationFixtures().find((item) => item.language === documentLanguage);
			assert(fixture);
			const browserGold = structuredClone(fixture.gold);
			if (documentLanguage === "ar") {
				// D33 Round 16 accepts extracted RTL endpoint order; retain every fact, entry and other order check.
				browserGold.order = browserGold.order.filter(
					([start, end]) => !(start.endsWith("-start") && end === start.replace(/-start$/u, "-end")),
				);
			}
			const phoneFact = fixture.gold.fields.find((field) => field.id === "phone");
			assert(phoneFact);
			const created = await page.request.post("/api/openapi/resumes", {
				data: { name: `T001 ${testInfo.testId}`, tags: [] },
			});
			expect(created.ok()).toBe(true);
			const id = (await created.json()) as string;
			expect((await page.request.put(`/api/openapi/resumes/${id}`, { data: { data: fixture.data } })).ok()).toBe(true);
			const evidence = [];
			for (const uiLocale of ["en-US", "ar-SA"]) {
				await page
					.context()
					.addCookies([{ name: "locale", value: uiLocale, url: String(testInfo.project.use.baseURL) }]);
				await page.goto(`/builder/${id}`);
				await expect(page.locator("html")).toHaveAttribute("dir", uiLocale === "ar-SA" ? "rtl" : "ltr");
				await page.evaluate(() => document.fonts.ready);
				const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
				await page
					.getByRole("button", { name: uiLocale === "ar-SA" ? "تنزيل PDF" : "Download PDF", exact: true })
					.click();
				if (width === 390) {
					await page
						.getByRole("dialog")
						.getByRole("button", { name: uiLocale === "ar-SA" ? "تحميل PDF" : "Download PDF", exact: true })
						.click();
				}
				const download = await downloadPromise;
				expect(await download.failure()).toBeNull();
				const path = testInfo.outputPath(`${uiLocale}.pdf`);
				await download.saveAs(path);
				const bytes = await readFile(path);
				const readers = await extractQualificationPdf(bytes);
				// A leading + must remain attached in each independent reader, including RTL contact rows.
				for (const reader of readers.filter((item) => item.reader !== "poppler-layout")) {
					expect(reader.status, reader.reader).toBe("complete");
					expect(reader.text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, ""), reader.reader).toContain(phoneFact.value);
				}
				const compared = readers.map((reader) => ({
					...reader,
					comparison: reader.status === "complete" ? compareQualification(browserGold, reader.text) : null,
				}));
				const response = await page.request.get(`/api/openapi/resumes/${id}`);
				expect(response.ok()).toBe(true);
				const saved = await response.json();
				expect(saved.data.basics).toEqual(fixture.data.basics);
				expect(saved.data.sections).toEqual(fixture.data.sections);
				expect(saved.data.metadata.page.locale).toBe(fixture.data.metadata.page.locale);
				await page.screenshot({ path: testInfo.outputPath(`${uiLocale}.png`), fullPage: true });
				evidence.push({
					uiLocale,
					documentLocale: saved.data.metadata.page.locale,
					width,
					sha256: createHash("sha256").update(bytes).digest("hex"),
					readers: compared,
				});
			}
			await writeFile(testInfo.outputPath("qualification.json"), JSON.stringify(evidence, null, 2));
			await writeFile(testInfo.outputPath("browser-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
			expect(diagnostics.filter((item) => item.kind === "pageerror")).toEqual([]);
			expect(
				evidence.flatMap((run) =>
					run.readers
						.filter(
							(reader) =>
								reader.reader !== "poppler-layout" && (reader.status !== "complete" || !reader.comparison?.passed),
						)
						.map((reader) => ({
							ui: run.uiLocale,
							reader: reader.reader,
							missing: reader.comparison?.missing,
							associations: reader.comparison?.associationFailures,
						})),
				),
			).toEqual([]);
		});
	}

test("browser PDF downloads preserve shaped scripts and name unsupported text without blocking", async ({
	authPage: page,
}, testInfo) => {
	test.setTimeout(180_000);
	const created = await page.request.post("/api/openapi/resumes", {
		data: { name: `PDF ${testInfo.testId}`, tags: [] },
	});
	expect(created.ok()).toBe(true);
	const id = (await created.json()) as string;
	const response = await page.request.get(`/api/openapi/resumes/${id}`);
	expect(response.ok()).toBe(true);
	const { data } = await response.json();
	data.picture.hidden = true;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["summary"], sidebar: [] }];
	for (const [text, font, locale] of [
		["שלום עולם ניסיון עבודה", "Noto Sans Hebrew", "he-IL"],
		["مرحبا بالعالم مهندس برمجيات", "Noto Sans Arabic", "ar-SA"],
		["नमस्ते दुनिया अनुभव कौशल", "Noto Sans Devanagari", "hi-IN"],
		["Hello 💻 engineer 🚀 coding 😀", "Noto Sans", "en-US"],
	] as const) {
		data.summary.content = `<p>${text}</p>`;
		data.metadata.page.locale = locale;
		data.metadata.typography.body.fontFamily = font;
		data.metadata.typography.heading.fontFamily = font;
		const updated = await page.request.put(`/api/openapi/resumes/${id}`, { data: { data } });
		expect(updated.ok()).toBe(true);
		await page.goto(`/builder/${id}`);
		const downloaded = page.waitForEvent("download", { timeout: 60_000 });
		await page.getByRole("button", { name: "Download PDF", exact: true }).click();
		const download = await downloaded;
		expect(await download.failure()).toBeNull();
		const path = await download.path();
		if (!path) throw new Error("Browser did not save the PDF");
		// Read logical text, including /ActualText for shaped clusters, from the browser's downloaded file.
		const extracted = execFileSync("pdftotext", ["-enc", "UTF-8", path, "-"], { encoding: "utf8" });
		expect(extracted.replace(/[\u202A-\u202E]/g, "").replace(/\s+/g, " ")).toContain(text);
	}
	data.summary.content = "<p>Unsupported \u{10FFFF}</p>";
	expect((await page.request.put(`/api/openapi/resumes/${id}`, { data: { data } })).ok()).toBe(true);
	await page.goto(`/builder/${id}`);
	// A character no font can draw prints as "?": the preview renders and names it, and the download still saves.
	const textLoss = page.getByText(/can't display .*\(U\+10FFFF\)/);
	await expect(textLoss).toHaveCount(1);
	const lossyDownload = page.waitForEvent("download", { timeout: 60_000 });
	await page.getByRole("button", { name: "Download PDF", exact: true }).click();
	expect(await (await lossyDownload).failure()).toBeNull();
	await expect(textLoss).toHaveCount(2);
	const exported = await page.request.get(`/api/openapi/resumes/${id}/pdf`);
	expect(exported.status()).toBe(200);
	expect(exported.headers()["content-type"]).toContain("application/pdf");
});
