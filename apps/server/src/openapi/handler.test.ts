import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("@reactive-resume/auth/config", () => ({
	auth: {
		api: { getSession: vi.fn().mockResolvedValue(null), verifyApiKey: vi.fn().mockResolvedValue({ valid: false }) },
	},
	verifyOAuthToken: vi.fn().mockRejectedValue(new Error("invalid token")),
	isCustomOAuthProviderEnabled: () => false,
}));
const { handleOpenApi, handleOpenApiDocument } = await import("./handler");
const request = (path: string, init?: RequestInit) =>
	handleOpenApi(new Request(`http://localhost:3000/api/openapi${path}`, init), "127.0.0.1");

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("REST boundary", () => {
	it("serves public configuration without authentication and marks it uncacheable", async () => {
		const response = await request("/flags");
		expect(response.status).toBe(200);
		expect(await response.json()).toHaveProperty("disableSignups");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
	it.each(["/resume/getRoot", "/storage/uploadFile", "/storage/deleteFile", "/missing"])(
		"does not expose internal or unknown routes: %s",
		async (path) => {
			const response = await request(path, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			expect(response.status).toBe(404);
			expect(await response.json()).toMatchObject({ code: "NOT_FOUND", status: 404 });
		},
	);
	it.each([
		"/resumes",
		"/applications",
		"/documents",
		"/cover-letters",
		"/resumes/private/exports/json",
		"/cover-letters/private/exports/pdf",
	])("rejects unauthenticated private reads: %s", async (path) => {
		const response = await request(path);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED", status: 401 });
	});
	it.each(["/ai-providers", "/agent/threads"])("withholds deferred private reads: %s", async (path) => {
		const response = await request(path);
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ code: "FORBIDDEN", message: "FEATURE_UNAVAILABLE" });
	});
	it("denies anonymous multipart PDF checks before decoding private content", async () => {
		const form = new FormData();
		form.set("file", new File(["not a PDF"], "resume.pdf", { type: "application/pdf" }));
		const response = await request("/pdf-checks", { method: "POST", body: form });
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			code: "UNAUTHORIZED",
			status: 401,
		});
	});
	it("returns the same JSON error envelope for malformed JSON", async () => {
		const response = await request("/resumes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{",
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ code: "BAD_REQUEST", status: 400 });
	});
});

it("retains the Sirawise discovery identity behind the HTTP release gate", async () => {
	const response = await handleOpenApiDocument();
	const spec = await response.json();
	expect(spec.info.title).toBe("Sirawise");
	expect(spec.info.contact).toEqual({ name: "Sirawise", url: "https://github.com/0-sayed/master-cv" });
	expect(spec.externalDocs.description).toBe("Upstream documentation");
});
