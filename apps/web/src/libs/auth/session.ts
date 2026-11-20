// SPA session lookup. This stays in apps/web because @reactive-resume/auth is server-only.

import type { AuthSession } from "@reactive-resume/auth/types";
import { authClient } from "./client";

type SessionError = Error & { status?: number; retryAfterMs?: number };

export function sessionRetryDelay(failureCount: number, error: unknown) {
	const retryAfterMs = (error as SessionError | null)?.retryAfterMs;
	if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)) return retryAfterMs;
	return Math.min(1_000 * 2 ** Math.max(0, failureCount - 1), 30_000);
}

export const getSession = async (): Promise<AuthSession | null> => {
	const { data, error } = await authClient.getSession();
	if (error) {
		// HTTP 401 explicitly denotes an unauthenticated state or expired session.
		if (error.status === 401) return null;
		// For transient errors (e.g. 429 Too Many Requests, 5xx server/DB errors, network drops),
		// throw so callers can differentiate between unauthenticated and transient failures.
		const retryAfterMs = (error as typeof error & { retryAfterMs?: number }).retryAfterMs;
		throw Object.assign(new Error(error.message || `Session check failed with status ${error.status}`), {
			status: error.status,
			...(retryAfterMs === undefined ? {} : { retryAfterMs }),
		}) satisfies SessionError;
	}
	return (data as AuthSession) ?? null;
};
