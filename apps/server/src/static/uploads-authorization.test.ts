import { beforeEach, expect, it, vi } from "vite-plus/test";
const dependencies = vi.hoisted(() => ({ read: vi.fn(), authentication: vi.fn(), authorize: vi.fn() }));
vi.mock("@reactive-resume/api/features/storage", () => ({
	getStorageService: () => ({ read: dependencies.read }),
	inferContentType: () => "image/png",
	authorizeOwnedFile: dependencies.authorize,
}));
vi.mock("@reactive-resume/api/context", () => ({
	resolveAuthenticationFromRequestHeaders: dependencies.authentication,
}));
const { handleUpload } = await import("./uploads");
beforeEach(() => {
	dependencies.read
		.mockReset()
		.mockResolvedValue({ data: new Uint8Array([1]), size: 1, contentType: "image/png", etag: '"one"' });
	dependencies.authentication.mockReset().mockResolvedValue(null);
	dependencies.authorize.mockReset().mockResolvedValue({ id: "file", generation: 1 });
});
it("anonymous_picture_path_is_not_public", async () => {
	const response = await handleUpload(new Request("http://localhost/api/uploads/alice/pictures/a.png"));
	expect(response.status).toBe(404);
	expect(dependencies.read).not.toHaveBeenCalled();
});
it("wrong_owner_or_revoked_picture_never_reads_bytes", async () => {
	dependencies.authentication.mockResolvedValue({ user: { id: "bob" }, permissions: ["read"] });
	expect((await handleUpload(new Request("http://localhost/api/uploads/alice/pictures/a.png"))).status).toBe(404);
	expect(dependencies.read).not.toHaveBeenCalled();
	dependencies.authentication.mockResolvedValue({ user: { id: "alice" }, permissions: ["read"] });
	dependencies.authorize.mockRejectedValue(new Error("revoked"));
	expect((await handleUpload(new Request("http://localhost/api/uploads/alice/pictures/a.png"))).status).toBe(404);
	expect(dependencies.read).not.toHaveBeenCalled();
});
it("private_conditional_request_never_public_304", async () => {
	dependencies.authentication.mockResolvedValue({ user: { id: "alice" }, permissions: ["read"] });
	const response = await handleUpload(
		new Request("http://localhost/api/uploads/alice/pictures/a.png", { headers: { "If-None-Match": '"one"' } }),
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
