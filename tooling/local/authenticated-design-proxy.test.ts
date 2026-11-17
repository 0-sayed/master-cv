import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it } from "vite-plus/test";
import { startAuthenticatedDesignProxy } from "./authenticated-design-proxy";

it("forwards only local read requests with the supplied synthetic session", async () => {
	const target = createServer((request, response) => {
		response.end(JSON.stringify({ cookie: request.headers.cookie, path: request.url }));
	});
	target.listen(0, "127.0.0.1");
	await once(target, "listening");
	const address = target.address();
	if (!address || typeof address === "string") throw new Error("Missing test address");
	const proxy = await startAuthenticatedDesignProxy({
		targetOrigin: `http://127.0.0.1:${address.port}`,
		cookieHeader: "session=synthetic",
	});
	try {
		const response = await fetch(`${proxy.origin}/screen?language=ar`, { headers: { cookie: "foreign=ignored" } });
		expect(await response.json()).toEqual({ cookie: "session=synthetic", path: "/screen?language=ar" });
		expect((await fetch(proxy.origin, { method: "POST" })).status).toBe(405);
	} finally {
		await proxy.close();
		target.closeAllConnections();
		await new Promise<void>((resolve) => target.close(() => resolve()));
	}
});

it.each(["https://example.com", "http://127.0.0.1:3030/path", "http://user@localhost:3030"])(
	"rejects a target outside the fixed local origin: %s",
	async (targetOrigin) => {
		await expect(startAuthenticatedDesignProxy({ targetOrigin, cookieHeader: "session=synthetic" })).rejects.toThrow(
			"Local origin required",
		);
	},
);
