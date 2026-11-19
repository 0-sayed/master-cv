import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import { landingExample } from "./example";
import { renderPage } from "./prerender";
it.each(["ar-SA", "en-US"] as const)(
	"prerenders the balanced %s footer and shared language choices",
	async (locale) => {
		const { html } = await renderPage("home", locale);
		const footer = html.slice(html.indexOf("<footer"));
		expect(html.match(/<footer/g) ?? []).toHaveLength(1);
		expect(footer).toMatch(/^<footer[^>]*bg-sunken/);
		const product = locale === "ar-SA" ? "المنتج" : "Product";
		const support = locale === "ar-SA" ? "الدعم" : "Support";
		for (const label of [product, support]) {
			const group = footer.match(new RegExp(`<nav aria-label="${label}"[^>]*>([\\s\\S]*?)</nav>`))?.[1] ?? "";
			expect(group.match(/<a /g) ?? []).toHaveLength(2);
			if (label === support && locale === "en-US") expect(group).toContain(">FAQ</a>");
		}
		const productMarkup = footer.slice(
			footer.indexOf(`aria-label="${product}"`),
			footer.indexOf(`aria-label="${support}"`),
		);
		expect(productMarkup).not.toContain("#faq");
		for (const href of [
			`/?locale=${locale}#how-it-works`,
			`/?locale=${locale}#pricing`,
			`/?locale=${locale}#faq`,
			`/help?locale=${locale}`,
			`/privacy-and-terms?locale=${locale}&amp;tab=privacy`,
			`/privacy-and-terms?locale=${locale}&amp;tab=terms`,
		])
			expect(footer).toContain(`href="${href}"`);
		expect(footer).toContain(`href="/?locale=${locale}"`);
		expect(footer).toContain('role="group"');
		expect(footer.match(/aria-pressed="true"/g) ?? []).toHaveLength(1);
		expect(footer).not.toMatch(/Made in|صُنع|صنع في|github.com|rxresu.me/);
		expect(footer).toContain("grid-cols-2");
		const utilities = footer.slice(footer.indexOf("border-t"));
		expect(utilities).toContain("tab=privacy");
		expect(utilities).toContain("tab=terms");
	},
);
it.each(["legal-privacy", "legal-terms", "help"] as const)(
	"keeps compact content geometry without the landing invitation on %s",
	async (page) => {
		for (const locale of ["ar-SA", "en-US"] as const) {
			const { html } = await renderPage(page, locale);
			expect(html).not.toContain('id="cta-title"');
			const footer = html.slice(html.indexOf("<footer"));
			expect(footer).toMatch(/^<footer[^>]*bg-surface/);
			expect(footer).toContain("py-6");
			if (page !== "help") expect(footer).toContain('aria-pressed="true"');
		}
	},
);
it("prerenders known guest actions on Arabic help without a session request", async () => {
	const { html } = await renderPage("help", "ar-SA");
	expect(html).toContain('href="/auth/login');
	expect(html).toContain('href="/auth/register');
});
it.each(["ar-SA", "en-US"] as const)(
	"prerenders a single guest invitation after the complete FAQ in %s",
	async (locale) => {
		const { html } = await renderPage("home", locale);
		const closing = html.slice(html.lastIndexOf('<section aria-labelledby="cta-title"'), html.indexOf("</main>"));
		expect(closing.match(/<a /g) ?? []).toHaveLength(1);
		expect(closing).toContain("/auth/register");
		expect(html.indexOf('id="faq"')).toBeLessThan(html.indexOf('id="cta-title"'));
		expect(closing).not.toContain("landing.cta.body");
	},
);
it("renders the synthetic Arabic date range in chronological LTR order", async () => {
	const { html } = await renderPage("home", "ar-SA");
	expect(html).toMatch(/<bdi dir="ltr"[^>]*>2021 — 2024<\/bdi>/);
});
it("prerenders the product story, demos and honest pricing without JavaScript", async () => {
	vi.stubGlobal("__APP_VERSION__", "test");
	const { html } = await renderPage("home", "en-US");
	expect(html).toMatch(/<h1[^>]*>Your CV, as <span[^>]*>clear/);
	expect(html).toContain("Import your PDF, approve every suggestion");
	expect(html).toContain('id="how-it-works"');
	expect(html).toContain('href="/dashboard/review-guide?locale=en-US"');
	expect(html).not.toContain('href="/ats-checker');
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
	expect(html).not.toContain("Sirawise — Help and contact</h1>");
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
