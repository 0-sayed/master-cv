import { afterEach, expect, it, vi } from "vite-plus/test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requestObservability, handleHttpError } from "./observability";

afterEach(() => vi.restoreAllMocks());

it("preserves deliberate client-error responses and their headers", async () => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const app = new Hono();
	app.use("*", requestObservability);
	app.onError(handleHttpError);
	app.get("/", () => {
		throw new HTTPException(401, {
			res: new Response("Login required", { status: 401, headers: { "WWW-Authenticate": "Bearer" } }),
		});
	});
	const response = await app.request("/");
	expect(response.status).toBe(401);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(response.headers.get("x-request-id")).toBeTruthy();
	expect(await response.text()).toBe("Login required");
});

it("returns normalized correlation IDs and logs only safe request metadata", async () => {
	const log = vi.spyOn(console, "info").mockImplementation(() => {});
	const app = new Hono();
	app.use("*", requestObservability);
	app.post("/private", (c) => c.text("saved"));
	const response = await app.request("/private?token=private-token", {
		method: "POST",
		headers: { "x-request-id": "safe-request_123", authorization: "Bearer private-token" },
		body: "private CV text",
	});
	expect(response.headers.get("x-request-id")).toBe("safe-request_123");
	expect(response.status).toBe(200);
	const entry = JSON.parse(String(log.mock.calls[0]?.[0]));
	expect(entry).toMatchObject({ event: "http_request", requestId: "safe-request_123", method: "POST", status: 200 });
	expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-token|private CV|private\?/);
});

it.each(["too long".repeat(30), "unsafe,request", "<script>"])("replaces invalid inbound IDs: %s", async (id) => {
	vi.spyOn(console, "info").mockImplementation(() => {});
	const app = new Hono();
	app.use("*", requestObservability);
	app.get("/", (c) => c.text("ok"));
	const response = await app.request("/", { headers: { "x-request-id": id } });
	expect(response.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
});

it("keeps unexpected exception details out of responses and server logs", async () => {
	const info = vi.spyOn(console, "info").mockImplementation(() => {});
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	const app = new Hono();
	app.use("*", requestObservability);
	app.onError(handleHttpError);
	app.get("/", () => {
		throw new Error("private CV and secret-token");
	});
	const response = await app.request("/");
	expect(response.status).toBe(500);
	expect(await response.text()).not.toMatch(/private CV|secret-token/);
	expect([...info.mock.calls, ...error.mock.calls].flat().map(String).join(" ")).not.toMatch(/private CV|secret-token/);
});
