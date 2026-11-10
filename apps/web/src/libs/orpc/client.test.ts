import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getQueryClient } from "../query/client";
import { client, streamClient } from "./client";

let expired: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
	const browser = Object.assign(new EventTarget(), { location: { origin: "https://resume.test" } });
	expired = vi.fn();
	browser.addEventListener("master-cv:session-expired", expired);
	vi.stubGlobal("window", browser);
	vi.stubGlobal(
		"fetch",
		vi.fn(async () =>
			Response.json(
				{ json: { defined: false, code: "UNAUTHORIZED", status: 401, message: "Unauthorized" } },
				{ status: 401 },
			),
		),
	);
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("RPC session expiration", () => {
	it.each(["client", "streamClient"] as const)("notifies sign-in recovery for a direct %s request", async (name) => {
		const rpc = name === "client" ? client : streamClient;
		await expect(rpc.career.master.read({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(expired).toHaveBeenCalledTimes(1);
	});

	it("notifies once when the same unauthorized request also reaches the query cache", async () => {
		const queryClient = getQueryClient();
		queryClient.setQueryData(["auth", "session"], { user: { id: "synthetic-owner" } });
		queryClient.setQueryData(["resume", "list"], [{ id: "private-synthetic-resume" }]);
		await expect(
			queryClient.fetchQuery({
				queryKey: ["career", "master"],
				retry: false,
				queryFn: () => client.career.master.read({}),
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(expired).toHaveBeenCalledTimes(1);
		expect(queryClient.getQueryData(["resume", "list"])).toBeUndefined();
		expect(queryClient.getQueryData(["auth", "session"])).toBeNull();
	});
});
