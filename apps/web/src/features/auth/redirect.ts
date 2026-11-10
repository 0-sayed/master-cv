import z from "zod";

// oxlint-disable-next-line no-control-regex -- Reject URL parser whitespace and control-character normalization.
const unsafeCallbackCharacters = /[\\\u0000-\u0020\u007f]/;

function safeCallbackURL(value: unknown): string | undefined {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return;
	if (unsafeCallbackCharacters.test(value)) return;

	try {
		const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0] ?? "");
		if (pathname.startsWith("//") || unsafeCallbackCharacters.test(pathname)) return;
		const url = new URL(value, "https://callback.invalid");
		if (url.origin !== "https://callback.invalid") return;
		return value;
	} catch {
		return;
	}
}

export function verificationCallback(email: string, callbackURL: unknown) {
	const search = new URLSearchParams({ email, done: "true" });
	const callback = safeCallbackURL(callbackURL);
	if (callback) search.set("callbackURL", callback);
	return `/auth/verify-email?${search}`;
}

export const authSearchSchema = z.object({
	reason: z.enum(["sessionExpired", "passwordChanged", "verificationExpired"]).optional().catch(undefined),
	callbackURL: z.unknown().transform(safeCallbackURL).optional(),
	reauthenticate: z.boolean().optional().catch(undefined),
});

export function getAuthRedirectOptions(value: unknown) {
	const callbackURL = safeCallbackURL(value);
	// OAuth callbacks are server endpoints; they must run through a document request.
	const isServerCallback = callbackURL !== undefined && callbackURL.startsWith("/api/");
	return { href: callbackURL ?? "/dashboard", reloadDocument: isServerCallback, replace: true } as const;
}

export function getOAuthSignInOptions(callback: unknown) {
	const callbackURL = safeCallbackURL(callback);
	if (!callbackURL) return {};
	const url = new URL(callbackURL, "https://callback.invalid");
	if (url.pathname !== "/api/auth/oauth" || !url.searchParams.has("sig")) return {};
	return { oauth_query: url.search.slice(1) };
}

export function getOAuthCreationOptions(callback: unknown) {
	const options = getOAuthSignInOptions(callback);
	if (!options.oauth_query) return;
	if (!new URLSearchParams(options.oauth_query).get("prompt")?.split(/\s+/).includes("create")) return;
	return { created: true as const, oauth_query: options.oauth_query };
}

export function isOAuthRedirect(data: unknown) {
	return (
		typeof data === "object" &&
		data !== null &&
		"redirect" in data &&
		data.redirect === true &&
		"url" in data &&
		typeof data.url === "string"
	);
}

export function getOAuthPasskeyOptions(callbackURL: unknown) {
	const oauthOptions = getOAuthSignInOptions(callbackURL);
	return {
		fetchOptions: {
			onRequest(context: { body?: unknown }) {
				if (!oauthOptions.oauth_query) return;
				// The passkey client forwards fetchOptions, but drops extra top-level fields.
				const body: unknown = typeof context.body === "string" ? JSON.parse(context.body) : context.body;
				if (body && typeof body === "object") context.body = JSON.stringify({ ...body, ...oauthOptions });
			},
		},
	};
}

export const verificationSearchSchema = z.object({
	email: z.email().optional().catch(undefined),
	done: z
		.union([z.literal(true), z.literal("true")])
		.transform(() => true)
		.optional()
		.catch(undefined),
	error: z.enum(["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"]).optional().catch(undefined),
});
