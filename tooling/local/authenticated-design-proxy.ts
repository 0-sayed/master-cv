import { once } from "node:events";
import { createServer } from "node:http";

export async function startAuthenticatedDesignProxy(input: {
	targetOrigin: string;
	cookieHeader: string;
}): Promise<{ origin: string; close(): Promise<void> }> {
	const target = new URL(input.targetOrigin);
	if (
		target.protocol !== "http:" ||
		!["localhost", "127.0.0.1"].includes(target.hostname) ||
		target.username ||
		target.password ||
		target.pathname !== "/" ||
		target.search ||
		target.hash
	)
		throw new Error("Local origin required");
	let origin = "";
	const server = createServer(async (request, response) => {
		if (request.headers.host !== new URL(origin).host) {
			response.writeHead(403).end();
			return;
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.writeHead(405).end();
			return;
		}
		const destination = new URL(request.url ?? "/", target);
		if (destination.origin !== target.origin) {
			response.writeHead(403).end();
			return;
		}
		try {
			const upstream = await fetch(destination, {
				method: request.method,
				headers: { cookie: input.cookieHeader },
				redirect: "manual",
				signal: AbortSignal.timeout(30_000),
			});
			upstream.headers.forEach((value, key) => {
				let headerValue = value;
				if (["content-length", "content-encoding", "connection", "transfer-encoding", "set-cookie"].includes(key))
					return;
				if (key === "location") {
					const location = new URL(value, target);
					if (location.origin !== target.origin) return;
					headerValue = `${origin}${location.pathname}${location.search}${location.hash}`;
				}
				response.setHeader(key, headerValue);
			});
			response.writeHead(upstream.status);
			response.end(request.method === "HEAD" ? undefined : Buffer.from(await upstream.arrayBuffer()));
		} catch {
			if (!response.headersSent) response.writeHead(502);
			response.end();
		}
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing design proxy address");
	origin = `http://127.0.0.1:${address.port}`;
	return {
		origin,
		close: async () => {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		},
	};
}
