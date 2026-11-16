import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import { landingExample } from "./example";
import { renderPage } from "./prerender";
it("prerenders the product story, demos and honest pricing without JavaScript", async () => {
	vi.stubGlobal("__APP_VERSION__", "test");
	const { html } = await renderPage("home", "en-US");
	expect(html).toMatch(/<h1[^>]*>Your CV, as <span[^>]*>clear/);
	expect(html).toContain("Import your PDF, approve every suggestion");
	expect(html).toContain('id="how-it-works"');
	expect(html).toContain("Abdullah Alqahtani");
	expect(html).toContain("Prepare monthly financial reports.");
	for (const text of [
		"Add your facts",
		"Review the changes",
		"Download your PDF",
		"No invention. Just clarity.",
		"Accept",
		"Suggested wording",
		"A CV screening systems can read",
		"PDF readability",
		"Selectable text, not an image",
		"Will my CV pass ATS?",
		"No tool can promise that.",
		"Evidence found",
		"Show in CV",
		"Senior Accountant",
		"HR Specialist",
		"Sales Supervisor",
		"Your data stays under your control",
		"Questions, answered",
		"Do you guarantee that I will get the job?",
		"Do you add achievements I did not provide?",
	])
		expect(html).toContain(text);
	// Closed answers stay in the HTML, findable before hydration.
	expect(html).toContain("Word downloads are not available.");
	expect(html).toContain("Word files are not supported.");
	// Pricing shows what is free today and the paid plan only as coming soon: no price, currency or payment name.
	expect(html).toContain('id="pricing"');
	expect(html).toContain("Coming soon");
	expect(html).toContain("Price and details will be announced.");
	expect(html).not.toMatch(/\bper month\b|\bSAR\b|ريال|شهريًا|Moyasar|ميسر|testimonial|GitHub stars/i);
	// ATS is described by what is checked, never as a score, pass rate or guarantee.
	expect(html).not.toMatch(/ATS score|pass rate|guaranteed to pass|100% ATS/i);
	// The audience is everyone in Saudi Arabia: no software-engineering sample content.
	expect(html).not.toMatch(/React|TypeScript|Front-end|web forms/);
	expect(html).not.toContain("data-scene=");
	// Reveal is armed only by script after hydration; prerendered sections never start hidden.
	expect(html).not.toContain("landing-reveal-armed");
	expect(html).not.toContain("data-revealed");
});
it("prerenders the same signed-out help title and navigation as the client", async () => {
	const { html } = await renderPage("help", "en-US");
	expect(html).toMatch(/<h1[^>]*>Help and contact<\/h1>/);
	expect(html).toContain("Back to home");
	expect(html).not.toContain("Master CV — Help and contact</h1>");
});
it.each([
	["ar-SA", "الصياغة المقترحة", "النسخة الإنجليزية"],
	["en-US", "Suggested wording", "English version"],
] as const)(
	"keeps mock labels in the %s interface language and CV text in its own language",
	async (locale, suggested, english) => {
		const { html } = await renderPage("home", locale);
		expect(html).toContain(suggested);
		expect(html).toContain(english);
		// The interface-language CV appears in the mocks; the bilingual example always opens on Arabic.
		for (const cv of [landingExample[locale === "ar-SA" ? "ar" : "en"], landingExample.ar]) {
			expect(html).toContain(`lang="${cv.lang}" dir="${cv.dir}"`);
			expect(html).toContain(cv.name);
		}
		expect(html).toMatch(/data-example-language="ar"/);
	},
);
it.each(["home", "legal-privacy", "legal-terms"] as const)(
	"shows no visible upstream credit on %s, while the repository keeps the MIT license",
	async (page) => {
		for (const locale of ["ar-SA", "en-US"] as const) {
			const { html } = await renderPage(page, locale);
			expect(html).not.toContain("data-upstream-credit");
			expect(html).not.toContain("Amruth Pillai");
			expect(html).toContain("© ");
		}
		// Owner decision 2026-11-15: the footer credit is gone; the MIT notice stays with the source.
		const license = await readFile(new URL("../../../../../LICENSE", import.meta.url), "utf8");
		expect(license).toMatch(/^MIT License/);
	},
);
