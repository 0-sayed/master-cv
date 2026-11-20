import type { QueryClient } from "@tanstack/react-query";
import { authIdentity, sessionQueryKey } from "./auth/identity";
import { getSession, sessionRetryDelay } from "./auth/session";
import { getLocale, loadUiLocale } from "./locale";
import { client } from "./orpc/client";
import { getTheme } from "./theme";

export { sessionQueryKey } from "./auth/identity";
const flagsQueryKey = ["flags"] as const;

// Root beforeLoad runs on every navigation and every hover preload, so the network reads come from the query cache.
// A signed-in session is reused for a minute; a signed-out one is always re-checked, so signing in elsewhere shows up
// on the next navigation. Anything that signs in, signs out or edits the profile invalidates `sessionQueryKey` before
// calling `router.invalidate()`. Flags come from server env and only change on a restart.
type RootContext = {
	theme: ReturnType<typeof getTheme>;
	locale: ReturnType<typeof getLocale>;
	session: Awaited<ReturnType<typeof getSession>>;
	flags: Awaited<ReturnType<typeof client.flags.get>>;
};

export async function loadRootContext(queryClient: QueryClient): Promise<RootContext> {
	const theme = getTheme();
	const identity = authIdentity(queryClient);
	const generation = identity.snapshot().generation;

	const [sessionResult, flagsResult] = await Promise.allSettled([
		queryClient.query({
			queryKey: sessionQueryKey,
			queryFn: getSession,
			staleTime: (query) => (query.state.data ? 60_000 : 0),
			retry: 2,
			retryDelay: sessionRetryDelay,
		}),
		queryClient.query({ queryKey: flagsQueryKey, queryFn: () => client.flags.get(), staleTime: 5 * 60_000 }),
	]);
	if (identity.snapshot().generation !== generation) return loadRootContext(queryClient);
	if (flagsResult.status === "rejected") throw flagsResult.reason;
	let session: RootContext["session"];
	let acceptedGeneration = generation;
	if (sessionResult.status === "fulfilled") {
		session = sessionResult.value;
	} else {
		// Routing treats this as signed out, but storage remains bound to the last confirmed identity.
		if (!identity.markUnconfirmed(generation)) return loadRootContext(queryClient);
		session = null;
	}
	const flags = flagsResult.value;
	const locale = getLocale(session?.user.uiLocale);
	if (sessionResult.status === "fulfilled") {
		if (!identity.accept(session, acceptedGeneration)) return loadRootContext(queryClient);
		queryClient.setQueryData(sessionQueryKey, session);
	}
	queryClient.setQueryData(flagsQueryKey, flags);
	await loadUiLocale(locale);

	return { theme, locale, session, flags };
}
