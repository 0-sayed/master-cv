import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	auth: {},
	env: {
		APP_URL: "https://sirawise.io",
	},
}));

vi.mock("@better-auth/oauth-provider", () => ({
	oauthProviderAuthServerMetadata: vi.fn(() => vi.fn(() => Response.json({}))),
	oauthProviderOpenIdConfigMetadata: vi.fn(() => vi.fn(() => Response.json({}))),
}));

vi.mock("@reactive-resume/auth/config", () => ({
	auth: mocks.auth,
}));

vi.mock("@reactive-resume/env/server", () => ({
	env: mocks.env,
}));

vi.mock("@reactive-resume/mcp/server-card", () => ({
	buildMcpServerCard: vi.fn(() => ({})),
}));

vi.mock("../app-version", () => ({
	appVersion: "test",
}));

describe("handleOAuthProtectedResource", () => {
	it("advertises the mounted auth issuer as the authorization server", async () => {
		const { handleOAuthProtectedResource } = await import("./metadata");

		const response = await handleOAuthProtectedResource();

		await expect(response.json()).resolves.toMatchObject({
			resource: "https://sirawise.io",
			authorization_servers: ["https://sirawise.io/api/auth"],
		});
	});
});

describe("handleMcpServerCard", () => {
	it("advertises the connect URL and OAuth authorization server", async () => {
		const { handleMcpServerCard } = await import("./metadata");

		const response = handleMcpServerCard();

		await expect(response.json()).resolves.toMatchObject({
			url: "https://sirawise.io/mcp",
			authentication: { type: "oauth2", authorization_server: "https://sirawise.io/api/auth" },
		});
	});
});

describe("handleIntegrations", () => {
	it("serves a cacheable v3 document whose surfaces reference declared credentials", async () => {
		const { handleIntegrations } = await import("./metadata");

		const response = handleIntegrations();
		const document = await response.json();

		expect(response.headers.get("Content-Type")).toBe("application/json");
		expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
		expect(document).toMatchObject({ version: 3 });
		expect(document.surfaces.map((surface: { type: string; url: string }) => [surface.type, surface.url])).toEqual([
			["http", "https://sirawise.io/api/openapi"],
			["mcp", "https://sirawise.io/mcp"],
		]);

		const source = "https://sirawise.io/.well-known/integrations.json";
		for (const surface of document.surfaces) {
			expect(surface).not.toHaveProperty("docs");
			expect(surface.basis).toEqual({ via: "declared", source });
			for (const entry of surface.auth.entries) {
				expect(entry.basis).toEqual({ via: "declared", source });
				for (const use of entry.use) expect(Object.keys(document.credentials)).toContain(use.id);
			}
		}
	});
});

describe("handleApiCatalog", () => {
	it("serves an RFC 9727 linkset for the REST API and MCP server", async () => {
		const { handleApiCatalog } = await import("./metadata");

		const response = handleApiCatalog();
		const catalog = await response.json();

		expect(response.headers.get("Content-Type")).toContain("application/linkset+json");
		expect(catalog.linkset.map((link: { anchor: string }) => link.anchor)).toEqual([
			"https://sirawise.io/api/openapi",
			"https://sirawise.io/mcp",
		]);
		expect(catalog.linkset[0]["service-desc"][0].href).toBe("https://sirawise.io/openapi.json");
		for (const service of catalog.linkset) expect(service).not.toHaveProperty("service-doc");
		expect(await handleApiCatalog({ head: true }).text()).toBe("");
	});
});
