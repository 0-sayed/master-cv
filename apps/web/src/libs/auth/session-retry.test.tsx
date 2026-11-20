// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetModules();
});
const limited = (seconds: string) =>
	Response.json({ message: "Too many requests" }, { status: 429, headers: { "x-retry-after": seconds } });

it("keeps retry headers on their own overlapping session errors", async () => {
	const pending: Array<(response: Response) => void> = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
	);
	const { getSession } = await import("./session");
	const calls = Promise.allSettled([getSession(), getSession()]);
	await waitFor(() => expect(pending).toHaveLength(2));
	pending[0]?.(limited("4"));
	pending[1]?.(limited("9"));
	const results = await calls;
	expect(results[0]).toMatchObject({ status: "rejected", reason: { status: 429, retryAfterMs: 4000 } });
	expect(results[1]).toMatchObject({ status: "rejected", reason: { status: 429, retryAfterMs: 9000 } });
});
it("carries retry headers into the reactive session hook error", async () => {
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue(limited("7")));
	const { authClient } = await import("./client");
	function Session() {
		const value = authClient.useSession();
		return <p>{JSON.stringify(value.error)}</p>;
	}
	render(<Session />);
	await waitFor(() => expect(screen.getByText(/retryAfterMs/)).toHaveTextContent('"retryAfterMs":7000'));
});
