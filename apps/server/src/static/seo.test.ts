import { expect, it, vi } from "vite-plus/test";
vi.mock("@reactive-resume/env/server", () => ({ env: { APP_URL: "https://resume.example" } }));
import { handleLlms, handleRobots, handleSitemap } from "./seo";
it("advertises only this instance's sitemap", async () => {
	const text = await handleRobots().text();
	expect(text.match(/^Sitemap: .+$/gm)).toEqual(["Sitemap: https://resume.example/sitemap.xml"]);
});
it("describes available account capabilities without inherited offers or integration promises", async () => {
	const text = await handleLlms().text();
	expect(text).toContain("Qualified PDF");
	expect(text).toContain("[Source code](https://github.com/0-sayed/sirawise)");
	expect(text).toContain("account");
	expect(text).toContain("Public sharing remains subject to release approval.");
	expect(text).not.toContain("public sharing are unavailable");
	for (const claim of [
		"every feature",
		"funded by donations",
		"Word (DOCX),",
		"OpenRouter",
		"never uploaded",
		"public link or",
		"more than 50",
		"API reference",
		"MCP server guide",
	])
		expect(text).not.toContain(claim);
});
it("keeps drafts help and private documents outside the sitemap", async () => {
	const text = await handleSitemap().text();
	expect(text).toContain("<loc>https://resume.example/</loc>");
	for (const path of ["privacy-and-terms", "help", "auth", "dashboard", "builder"]) expect(text).not.toContain(path);
});

it("allows crawlers to read the retired ATS route response", async () => {
	expect(await handleRobots().text()).not.toContain("Disallow: /ats-checker");
});
