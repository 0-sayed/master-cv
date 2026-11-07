import type { ErrorHandler, MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";
import { HTTPException } from "hono/http-exception";

export const handleHttpError: ErrorHandler = (error, c) => {
	if (error instanceof HTTPException && error.status < 500) return error.getResponse();
	return c.text("Internal Server Error", 500);
};

export const requestObservability: MiddlewareHandler = async (c, next) => {
	const incoming = c.req.header("x-request-id")?.trim();
	const requestId = incoming && /^[a-z0-9][a-z0-9._:-]{0,63}$/i.test(incoming) ? incoming : randomUUID();
	const started = performance.now();
	await next();
	c.header("X-Request-ID", requestId);
	// Deliberately omit URLs, headers, bodies and error objects: they may contain CVs or credentials.
	console.info(
		JSON.stringify({
			event: "http_request",
			requestId,
			method: c.req.method,
			status: c.res.status,
			durationMs: Math.round(performance.now() - started),
		}),
	);
};
