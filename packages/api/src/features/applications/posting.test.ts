import { describe, expect, it, vi } from "vite-plus/test";
import { readPage, searchWeb } from "../web-access/service";
import { fetchJobPosting, htmlToText, readJobPosting, readOpenPosting, searchJobPostings } from "./posting";

vi.mock("../web-access/service", () => ({
	readPage: vi.fn(),
	searchWeb: vi.fn(),
}));

describe("htmlToText", () => {
	it.each(["&#x110000;", "&#999999999;", "&#xD800;", "&#0;"])("retains invalid numeric entity %s as text", (entity) => {
		expect(htmlToText(`<p>Role ${entity} description</p>`)).toBe(`Role ${entity} description`);
	});
	it("keeps the words and line breaks, and drops scripts, styles and entities", () => {
		const html =
			"<head><title>x</title></head><h1>Designer</h1><p>Figma &amp; research</p><script>alert(1)</script><ul><li>5+ years</li></ul>";
		expect(htmlToText(html)).toBe("Designer\nFigma & research\n5+ years");
	});
});

describe("readJobPosting", () => {
	it("does not select an arbitrary role from a multi-job page", () => {
		const html = `<script type="application/ld+json">${JSON.stringify([
			{ "@type": "JobPosting", title: "Designer" },
			{ "@type": "JobPosting", title: "Engineer" },
		])}</script>`;
		expect(readJobPosting(html)).toBeNull();
	});
	it("reads a JobPosting from the page's JSON-LD, including inside a graph", () => {
		const html = `<script type="application/ld+json">${JSON.stringify({
			"@graph": [
				{ "@type": "Organization", name: "Ignore" },
				{
					"@type": "JobPosting",
					title: "Senior Product Designer",
					hiringOrganization: { name: "Lumen Health" },
					jobLocation: {
						address: { addressLocality: "Berlin", addressCountry: "DE" },
					},
					description: "<p>Design calm tools.</p><ul><li>Figma</li></ul>",
				},
			],
		})}</script>`;

		expect(readJobPosting(html)).toEqual({
			role: "Senior Product Designer",
			company: "Lumen Health",
			location: "Berlin, DE",
			description: "Design calm tools.\nFigma",
			closesAt: "",
		});
	});
});

describe("readOpenPosting", () => {
	const posting = (fields: object = {}) => ({ "@type": "JobPosting", title: "Designer", ...fields });
	// null: not a role. A string: a role, with the company its address names when the page has no JobPosting data.
	it.each([
		["one posting", "https://lumen.example/careers/designer", [posting()], ""],
		["a list of postings", "https://lumen.example/careers", [posting(), posting({ title: "Engineer" })], null],
		["a closed posting", "https://lumen.example/careers/designer", [posting({ validThrough: "2020-01-01" })], null],
		["a careers page", "https://lumen.example/careers", [], null],
		["a Lever posting", "https://jobs.lever.co/lumen/0c5b9e8a-3f7e-4a43-9d36-0d4c1b1e2f3a", [], "lumen"],
		[
			"a LinkedIn posting",
			"https://www.linkedin.com/jobs/view/senior-designer-at-simple-club-4264843261",
			[],
			"simple club",
		],
	])("%s: %j", async (_name, url, postings, expected) => {
		vi.mocked(readPage).mockResolvedValue({
			requestedUrl: url,
			content: "Page text",
			html: postings.map((item) => `<script type="application/ld+json">${JSON.stringify(item)}</script>`).join(""),
			format: "text",
			retrievedAt: "2026-09-30T12:00:00.000Z",
			method: "builtin",
			truncated: false,
			completeness: "unknown",
		});
		expect((await readOpenPosting(url, { connection: null, userId: "user" }))?.company ?? null).toBe(expected);
	});
});

describe("posting retrieval", () => {
	it("rejects a board search page instead of sending its many roles for extraction", async () => {
		vi.mocked(readPage).mockResolvedValue({
			requestedUrl: "https://www.linkedin.com/jobs/search/",
			content: "Many jobs",
			format: "text",
			retrievedAt: "2026-10-08T12:00:00Z",
			method: "builtin",
			truncated: false,
			completeness: "unknown",
		});
		await expect(
			fetchJobPosting("https://www.linkedin.com/jobs/search/", { userId: "user", connection: null }),
		).rejects.toMatchObject({ reason: "not-a-page" });
	});
	it("omits aggregate search results while preserving individual postings", async () => {
		vi.mocked(searchWeb).mockResolvedValue([
			{ url: "https://www.linkedin.com/jobs/search/?keywords=designer", title: "Designer jobs" },
			{ url: "https://jobs.lever.co/acme", title: "Acme roles" },
			{ url: "https://board.example/designer", title: "100 Designer Jobs in Berlin" },
			{ url: "https://www.linkedin.com/jobs/view/123456", title: "Designer at Acme" },
		]);
		expect(await searchJobPostings("designer", { userId: "user", connection: null })).toEqual([
			{ url: "https://www.linkedin.com/jobs/view/123456", title: "Designer at Acme", description: "" },
		]);
	});
	it.each(["broken JSON", { "@graph": { unrelated: true } }, { "@graph": "not an array" }, null])(
		"preserves retrieved text when page metadata is malformed: %j",
		async (metadata) => {
			vi.mocked(readPage).mockResolvedValue({
				requestedUrl: "https://jobs.example.com/role",
				content: "Designer\nWork on accessible products.",
				html: `<h1>Designer</h1><p>Work on accessible products.</p><script type="application/ld+json">${typeof metadata === "string" ? metadata : JSON.stringify(metadata)}</script>`,
				format: "text",
				retrievedAt: "2026-09-30T12:00:00.000Z",
				method: "builtin",
				truncated: false,
				completeness: "unknown",
			});
			expect(
				await fetchJobPosting("https://jobs.example.com/role", {
					userId: "user",
					connection: null,
				}),
			).toMatchObject({
				page: null,
				text: "Designer\nWork on accessible products.",
				source: {
					method: "builtin",
					truncated: false,
					completeness: "unknown",
				},
			});
		},
	);

	it("retains page fields and marks a bounded structured description as incomplete", async () => {
		vi.mocked(readPage).mockResolvedValue({
			requestedUrl: "https://jobs.example.com/role",
			content: "Other page content",
			html: `<script type="application/ld+json">${JSON.stringify({
				"@type": "JobPosting",
				title: "Designer",
				hiringOrganization: { name: "Example" },
				description: `<p>${"x".repeat(20_001)}</p>`,
			})}</script>`,
			format: "markdown",
			retrievedAt: "2026-09-30T12:00:00.000Z",
			method: "firecrawl",
			truncated: false,
			completeness: "unknown",
		});
		const result = await fetchJobPosting("https://jobs.example.com/role", {
			userId: "user",
			connection: null,
		});
		expect(result.page).toMatchObject({ role: "Designer", company: "Example" });
		expect(result.text).toHaveLength(20_000);
		expect(result.source).toMatchObject({
			method: "firecrawl",
			format: "text",
			truncated: true,
			completeness: "incomplete",
		});
		expect(result.source).not.toHaveProperty("html");
		expect(result.source).not.toHaveProperty("content");
	});

	it("applies job query intent only in Applications and maps the existing result contract", async () => {
		vi.mocked(searchWeb).mockResolvedValue([
			{
				url: "https://jobs.example.com/role",
				title: "Designer",
				snippet: "Berlin",
			},
		]);
		const context = { userId: "user", connection: null };
		expect(await searchJobPostings("designer Berlin", context)).toEqual([
			{
				url: "https://jobs.example.com/role",
				title: "Designer",
				description: "Berlin",
			},
		]);
		expect(searchWeb).toHaveBeenCalledWith("designer Berlin job posting", context);
	});
});

describe("job page content", () => {
	const context = { userId: "synthetic-user", connection: null };
	const page = (html: string, content = htmlToText(html)) => {
		vi.mocked(readPage).mockResolvedValue({
			requestedUrl: "https://www.linkedin.com/jobs/view/123456",
			html,
			content,
			format: "text",
			method: "builtin",
			truncated: false,
			retrievedAt: "2026-11-15T12:00:00Z",
			completeness: "unknown",
		});
	};
	it("reads structured job descriptions even beside a login form", async () => {
		page(
			`<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "Engineer", description: "Build accessible tools" })}</script><form><input type="password"><label>Email or phone</label></form>`,
		);
		expect((await fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context)).text).toBe(
			"Build accessible tools",
		);
	});
	it("recognizes chrome markers in later class tokens", async () => {
		page(
			'<html><body><main><nav class="layout navigation">Unrelated chrome</nav><section class="layout show-more-less-html__markup">Build accessible tools</section></main></body></html>',
		);
		expect((await fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context)).text).toBe(
			"Build accessible tools",
		);
	});
	it("preserves retrieved text when HTML is unavailable", async () => {
		page("", "Engineer\nBuild accessible tools");
		expect((await fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context)).text).toBe(
			"Engineer\nBuild accessible tools",
		);
	});
	it("rejects a synthetic sign-in wall even when a role teaser is present", async () => {
		page(`<html><body><a>Skip to main content</a><main><h1>Product Engineer</h1>
			<p>Example Learning</p><p>Riyadh, Saudi Arabia</p>
			<h2>Join or sign in to find your next job</h2><form>
			<label>Email or phone</label><input><label>Password</label><input type="password">
			<button>Sign in</button></form><p>New to LinkedIn? Join now</p></main></body></html>`);
		await expect(fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context)).rejects.toMatchObject({
			reason: "auth",
		});
	});
	it.each(["<main></main>", "<main><h1>Just a moment</h1><p>Verify you are human</p></main>"])(
		"rejects an empty or bot-blocked page: %s",
		async (html) => {
			page(html);
			await expect(fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context)).rejects.toThrow();
		},
	);
	it("extracts only the job content and editable fields from a synthetic public page", async () => {
		page(`<html><body><nav>Home Jobs Sign in</nav><main>
			<h1>Product Engineer</h1><a class="topcard__org-name-link">Example Learning</a>
			<span class="topcard__flavor--bullet">Riyadh, Saudi Arabia</span>
			<section class="show-more-less-html__markup"><h2>About this job</h2>
			<p>Build accessible learning tools with TypeScript and help students learn.</p>
			<ul><li>Work with designers to deliver reliable interfaces.</li></ul></section>
			<form><label>Password</label><button>Sign in</button></form>
			<aside>People also viewed other jobs</aside></main><footer>Privacy Cookies</footer></body></html>`);
		const result = await fetchJobPosting("https://www.linkedin.com/jobs/view/123456", context);
		expect(result.page).toMatchObject({
			role: "Product Engineer",
			company: "Example Learning",
			location: "Riyadh, Saudi Arabia",
		});
		expect(result.text).toContain("Build accessible learning tools");
		expect(result.text).not.toMatch(/Password|Sign in|Home|People also|Privacy|Cookies/);
	});
});
