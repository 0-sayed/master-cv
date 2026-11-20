import { describe, expect, it, vi } from "vite-plus/test";
import { getSession, sessionRetryDelay } from "./session";
import { recordSessionRetryAfter } from "./session-retry";

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
	authClient: {
		getSession: getSessionMock,
	},
}));

describe("getSession", () => {
	it("returns session data on successful fetch", async () => {
		const mockSession = { user: { id: "user-1", name: "Alice" }, session: { id: "sess-1" } };
		getSessionMock.mockResolvedValueOnce({ data: mockSession, error: null });

		const result = await getSession();
		expect(result).toEqual(mockSession);
	});

	it("returns null when no session is present (data is null)", async () => {
		getSessionMock.mockResolvedValueOnce({ data: null, error: null });

		const result = await getSession();
		expect(result).toBeNull();
	});

	it("returns null when session is explicitly unauthorized (HTTP 401)", async () => {
		getSessionMock.mockResolvedValueOnce({ data: null, error: { status: 401, message: "Unauthorized" } });

		const result = await getSession();
		expect(result).toBeNull();
	});

	it("throws on rate-limited responses (HTTP 429)", async () => {
		getSessionMock.mockResolvedValueOnce({
			data: null,
			error: { status: 429, message: "Too many requests. Please try again later." },
		});

		await expect(getSession()).rejects.toThrow("Too many requests. Please try again later.");
	});
	it("carries the server x-retry-after delay into query backoff", async () => {
		getSessionMock.mockImplementationOnce(async () => {
			recordSessionRetryAfter("4");
			return { data: null, error: { status: 429, message: "Too many requests." } };
		});

		await expect(getSession()).rejects.toMatchObject({ status: 429, retryAfterMs: 4_000 });
	});

	it("throws on server errors (HTTP 500)", async () => {
		getSessionMock.mockResolvedValueOnce({
			data: null,
			error: { status: 500, message: "Internal server error" },
		});

		await expect(getSession()).rejects.toThrow("Internal server error");
	});

	it("throws on transient network errors", async () => {
		getSessionMock.mockResolvedValueOnce({
			data: null,
			error: { message: "Failed to fetch" },
		});

		await expect(getSession()).rejects.toThrow("Failed to fetch");
	});
});

describe("sessionRetryDelay", () => {
	it("uses the server retry-after value when present", () => {
		expect(sessionRetryDelay(2, Object.assign(new Error("Too many requests"), { retryAfterMs: 4_000 }))).toBe(4_000);
	});
	it("uses capped exponential backoff when no server delay exists", () => {
		expect(sessionRetryDelay(1, new Error("Session unavailable"))).toBe(1_000);
		expect(sessionRetryDelay(10, new Error("Session unavailable"))).toBe(30_000);
	});
});
