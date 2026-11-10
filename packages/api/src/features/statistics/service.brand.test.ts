import { beforeEach, expect, test, vi } from "vite-plus/test";

vi.mock("@reactive-resume/db/client", () => ({ db: {} }));
vi.mock("@reactive-resume/db/schema", () => ({}));

beforeEach(() => {
	vi.resetModules();
	vi.unstubAllGlobals();
});

test("the displayed GitHub stars belong to the Master CV repository", async () => {
	const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ stargazers_count: 7 })));
	vi.stubGlobal("fetch", fetch);
	const { statisticsService } = await import("./service");
	expect(await statisticsService.github.getStarCount()).toBe(7);
	expect(fetch).toHaveBeenCalledWith("https://api.github.com/repos/0-sayed/master-cv", expect.any(Object));
});

test("an unavailable repository never displays inherited upstream stars", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
	const { statisticsService } = await import("./service");
	expect(await statisticsService.github.getStarCount()).toBe(0);
});
