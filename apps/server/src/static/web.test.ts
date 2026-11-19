import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	env: { APP_URL: "https://rxresu.me", ROOT_RESUME_ID: undefined as string | undefined },
	serveStatic: vi.fn(() => vi.fn()),
	getPublicResumeSocialMeta: vi.fn(),
	getSession: vi.fn(),
}));

vi.mock("@reactive-resume/auth/config", () => ({ auth: { api: { getSession: mocks.getSession } } }));

vi.mock("@reactive-resume/api/features/resume/social-meta", () => ({
	getPublicResumeSocialMeta: mocks.getPublicResumeSocialMeta,
}));

vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => true),
}));

vi.mock("node:fs/promises", () => ({
	default: {
		readFile: vi.fn(),
	},
}));

vi.mock("@hono/node-server/serve-static", () => ({
	serveStatic: mocks.serveStatic,
}));

vi.mock("@reactive-resume/env/server", () => ({
	env: mocks.env,
}));

const { handleWebApp } = await import("./web");

describe("web app fallback classification", () => {
	it.each(["GET", "HEAD"])("permanently redirects legacy review links on %s", async (method) => {
		const response = await handleWebApp(
			new Request("https://rxresu.me/dashboard/ats-guide?rule=MISSING_EMAIL&locale=ar-SA#rule-MISSING_EMAIL", {
				method,
			}),
		);
		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe(
			"/dashboard/review-guide?rule=MISSING_EMAIL&locale=ar-SA#rule-MISSING_EMAIL",
		);
		expect(await response.text()).toBe("");
	});
	it.each(["GET", "HEAD"])("redirects the retired checker to an account entry point (%s)", async (method) => {
		const response = await handleWebApp(new Request("https://sirawise.io/ats-checker?locale=ar-SA", { method }));
		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe("/auth/login?callbackURL=%2Fdashboard&locale=ar-SA");
		expect(await response.text()).toBe("");
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.env.APP_URL = "https://rxresu.me";
		mocks.env.ROOT_RESUME_ID = undefined;
		vi.mocked(fs.readFile).mockResolvedValue("<html>app</html>");
		mocks.getPublicResumeSocialMeta.mockResolvedValue(null);
		mocks.getSession.mockResolvedValue(null);
	});

	it.each(["http://127.0.0.1:23100", "https://sirawise.io"])(
		"keeps the configured origin and localized brand at %s",
		async (origin) => {
			mocks.env.APP_URL = origin;
			vi.mocked(fs.readFile).mockResolvedValue(
				"<html><head><title>Sirawise</title></head><body>Local fixture</body></html>",
			);
			for (const [locale, brand] of [
				["ar-SA", "سيراوايز"],
				["en-US", "Sirawise"],
			]) {
				const html = await (await handleWebApp(new Request(`${origin}/?locale=${locale}`))).text();
				expect(html).toContain(`property="og:site_name" content="${brand}"`);
				expect(html).toContain(`"name":"${brand}"`);
				expect(html).toContain(`href="${origin}/`);
				expect(html).not.toContain("Master CV");
			}
		},
	);

	it.each([
		["en-US", "ar-SA"],
		["ar-SA", "en-US"],
	])("prerenders the saved %s account preference ahead of a %s cookie", async (saved, cookie) => {
		mocks.getSession.mockResolvedValue({ user: { uiLocale: saved } });
		vi.mocked(fs.readFile).mockImplementation((path) => {
			const locale = String(path).match(/dist-prerender\/home\/(.+)\.html$/)?.[1];
			return Promise.resolve(`<html><head></head><body>${locale ?? "shell"}</body></html>`);
		});
		const response = await handleWebApp(
			new Request("https://example.com/", {
				headers: {
					cookie: `session_token=synthetic; locale=${cookie}`,
					"x-api-key": "synthetic",
					authorization: "Bearer synthetic",
				},
			}),
		);
		expect(await response.text()).toContain(`<body>${saved}</body>`);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		const call = mocks.getSession.mock.calls[0];
		assert.ok(call);
		const sessionHeaders = call[0].headers as Headers;
		expect(sessionHeaders.get("x-api-key")).toBeNull();
		expect(sessionHeaders.get("authorization")).toBeNull();
	});

	it.each(["/privacy-and-terms?tab=terms", "/help"])(
		"serves localized public HTML and noindex for %s",
		async (path) => {
			const read = vi.fn(
				async (filename: string) =>
					`<html lang="ar-SA" dir="rtl"><head><title>عنوان</title><meta name="description" content="وصف"></head><body>${filename.includes("legal-terms") ? "terms draft" : "help form"}</body></html>`,
			);
			const response = await handleWebApp(new Request(`https://example.com${path}`), read);
			expect(response.status).toBe(200);
			expect(response.headers.get("x-robots-tag")).toBe("noindex, follow");
			const html = await response.text();
			expect(html).toContain('lang="ar-SA"');
			expect(html).toContain('property="og:title" content="عنوان"');
			expect(
				read.mock.calls.some(([filename]) =>
					filename.includes(path.startsWith("/help") ? "/help/ar-SA.html" : "/legal-terms/ar-SA.html"),
				),
			).toBe(true);
		},
	);
	it("fails closed when required localized public HTML is missing", async () => {
		const response = await handleWebApp(new Request("https://example.com/"), async (path) => {
			if (path.includes("dist-prerender")) throw new Error("missing");
			return "<html>shell</html>";
		});
		expect(response.status).toBe(503);
		expect(await response.text()).not.toContain("free and open-source");
	});
	it.each(["/", "/help", "/privacy-and-terms?tab=terms"])(
		"HEAD matches localized GET cache headers and missing-artifact status for %s",
		async (path) => {
			mocks.getSession.mockResolvedValue({ user: { uiLocale: "en-US" } });
			const url = `https://example.com${path}`;
			const headers = { cookie: "session_token=synthetic; locale=ar-SA" };
			const get = await handleWebApp(new Request(url, { headers }));
			const head = await handleWebApp(new Request(url, { method: "HEAD", headers }));
			expect(head.status).toBe(get.status);
			expect([...head.headers]).toEqual([...get.headers]);
			expect(await head.text()).toBe("");
			mocks.getSession.mockResolvedValue(null);
			const missing = await handleWebApp(new Request(url, { method: "HEAD" }), async (filename) => {
				if (filename.includes("dist-prerender")) throw new Error("missing");
				return "<html>shell</html>";
			});
			expect(missing.status).toBe(503);
			expect(missing.headers.get("cache-control")).toBe("no-store");
			expect(await missing.text()).toBe("");
		},
	);
	it("injects canonical metadata and structured data into tracking-parameter root requests only", async () => {
		vi.mocked(fs.readFile).mockResolvedValue(`
			<!doctype html>
			<html>
				<head>
					<title>Sirawise — A free and open-source resume builder</title>
					<meta data-public-seo property="og:site_name" content="Sirawise">
					<meta name="twitter:title" content="Sirawise">
					<meta
						name="description"
						content="Sirawise is a free and open-source resume builder that makes it easy to create, update, and share your resume."
					>
				</head>
				<body><div id="app"></div></body>
			</html>
		`);

		const response = await handleWebApp(new Request("http://server.internal/?utm_source=search"));
		const html = await response.text();

		expect(html).toContain('<link data-public-seo rel="canonical" href="https://rxresu.me/">');
		expect(html).toContain('<meta data-public-seo property="og:url" content="https://rxresu.me/">');
		expect(html).toContain('<script data-public-seo type="application/ld+json">');
		expect(html).toContain(
			'<meta data-public-seo property="og:description" content="Sirawise is a free and open-source resume builder that makes it easy to create, update, and share your resume.">',
		);
		expect(html).not.toContain("amruth@rxresu.me");
		expect(html.match(/property="og:site_name"/g)).toHaveLength(1);
		expect(html.match(/name="twitter:title"/g)).toHaveLength(1);
		expect(html).toContain("https://github.com/0-sayed/master-cv");
		expect(html).not.toContain("utm_source");

		const dashboardResponse = await handleWebApp(new Request("https://example.com/dashboard"));
		expect(await dashboardResponse.text()).not.toContain('rel="canonical"');
	});

	it("serves the homepage prerendered in the requested or saved locale, with hreflang alternates", async () => {
		vi.mocked(fs.readFile).mockImplementation((path) => {
			const locale = String(path).match(/dist-prerender\/home\/(.+)\.html$/)?.[1];
			return Promise.resolve(`<html><head></head><body><div id="app">${locale ?? "shell"}</div></body></html>`);
		});

		const english = await handleWebApp(new Request("https://example.com/?locale=en-US"));
		const html = await english.text();
		expect(html).toContain('<div id="app">en-US</div>');
		expect(html).toContain('<link data-public-seo rel="canonical" href="https://rxresu.me/?locale=en-US">');
		expect(html).toContain('<link data-public-seo rel="alternate" hreflang="x-default" href="https://rxresu.me/">');
		expect(english.headers.get("Vary")).toBe("Cookie");

		const saved = new Request("https://example.com/", { headers: { cookie: "theme=dark; locale=ar-SA" } });
		const savedHtml = await (await handleWebApp(saved)).text();
		expect(savedHtml).toContain('<div id="app">ar-SA</div>');
		expect(savedHtml).toContain('<link data-public-seo rel="canonical" href="https://rxresu.me/">');

		// Only known locales name a file, so the parameter can't point anywhere else.
		const unknown = await handleWebApp(new Request("https://example.com/?locale=../../index"));
		expect(await unknown.text()).toContain('<div id="app">ar-SA</div>');
	});

	describe("retired public ATS route", () => {
		it("redirects crawlers to the authenticated workspace entry", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(
				'<html><head><title>Sirawise</title></head><body><div id="app"></div></body></html>',
			);
			const response = await handleWebApp(new Request("https://example.com/ats-checker"));
			expect(response.status).toBe(308);
			expect(response.headers.get("Location")).toBe("/auth/login?callbackURL=%2Fdashboard");
			expect(await response.text()).toBe("");
		});
	});

	describe("public resume social cards", () => {
		const shell = `<html><head><title>Sirawise — A free and open-source resume builder</title><meta name="description" content="Marketing copy."></head><body></body></html>`;

		it("escapes user-authored values so resume content cannot break out of the attribute", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(shell);
			mocks.getPublicResumeSocialMeta.mockResolvedValue({
				name: 'Jane" onload="alert(1)',
				title: "<script>alert(1)</script>",
				description: 'Ends with " and & ampersand',
				template: "azurill",
			});

			const html = await (await handleWebApp(new Request("https://example.com/jane/resume"))).text();

			expect(html).not.toContain("<script>alert(1)</script>");
			expect(html).not.toContain('onload="alert(1)');
			expect(html).toContain('<meta property="og:title" content="&lt;script&gt;alert(1)&lt;/script&gt;">');
			expect(html).toContain('content="Ends with &quot; and &amp; ampersand"');
		});

		it("keeps replacement patterns in resume text literal", async () => {
			vi.mocked(fs.readFile).mockResolvedValue(shell);
			mocks.getPublicResumeSocialMeta.mockResolvedValue({
				name: "Jane $& $' Doe",
				title: "Jane Doe",
				description: "Costs $$ and $` nothing",
				template: "azurill",
			});

			const html = await (await handleWebApp(new Request("https://example.com/jane/resume"))).text();

			expect(html).toContain("<title>Jane $&amp; $&#39; Doe — Sirawise</title>");
			expect(html).toContain('<meta name="description" content="Costs $$ and $` nothing">');
		});
	});

	it.each(["/", "/alice/resume"])("sets framing and report-only CSP security headers on %s", async (pathname) => {
		const response = await handleWebApp(new Request(`https://example.com${pathname}`));

		expect(response.status).toBe(200);
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'none'");
	});

	it.each([
		"/auth/login",
		"/dashboard",
		"/builder/resume-1",
		"/agent",
		"/templates",
		"/templates/azurill.pdf",
		"/help",
		"/deletion-requested",
		"/email-change",
	])("serves noindex shell for known app prefix %s", async (pathname) => {
		const response = await handleWebApp(new Request(`https://example.com${pathname}`));

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
		expect(response.headers.get("X-Robots-Tag")).toBe("noindex, follow");
		expect(await response.text()).toBe("<html>app</html>");
	});
});

describe("configured root shell", () => {
	it("uses configured canonical root without leaking ID or marketing metadata", async () => {
		mocks.env.ROOT_RESUME_ID = "private-or-missing-id";
		vi.mocked(fs.readFile).mockResolvedValue(
			'<html><head><title>Marketing title</title><meta name="description" content="Marketing copy."></head><body></body></html>',
		);
		const html = await (
			await handleWebApp(
				new Request("https://attacker.example/?id=other", {
					headers: { host: "attacker.example", "x-forwarded-host": "evil.example" },
				}),
			)
		).text();
		expect(html).toContain('<link rel="canonical" href="https://rxresu.me/" data-root-resume-shell>');
		expect(html).toContain('<meta name="robots" content="noindex, follow" data-root-resume-shell>');
		expect(html).not.toMatch(/private-or-missing-id|attacker|evil|Marketing|application\/ld\+json|timelapse/);
	});
});
