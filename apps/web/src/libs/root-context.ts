import type { QueryClient } from "@tanstack/react-query";
import { authIdentity, sessionQueryKey } from "./auth/identity";
import { getSession } from "./auth/session";
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

	let session: RootContext["session"];
	let flags: RootContext["flags"];
	try {
		[session, flags] = await Promise.all([
			queryClient.query({
				queryKey: sessionQueryKey,
				queryFn: getSession,
				staleTime: (query) => (query.state.data ? 60_000 : 0),
			}),
			queryClient.query({ queryKey: flagsQueryKey, queryFn: () => client.flags.get(), staleTime: 5 * 60_000 }),
		]);
	} catch (error) {
		// A sign-in or cross-tab check can cancel a concurrent hover/navigation read.
		// Resolve the current generation rather than sending expected cancellation to the route error boundary.
		if (identity.snapshot().generation !== generation) return loadRootContext(queryClient);
		identity.check();
		throw error;
	}
	const locale = getLocale(session?.user.uiLocale);
	if (!identity.accept(session, generation)) return loadRootContext(queryClient);
	queryClient.setQueryData(sessionQueryKey, session);
	queryClient.setQueryData(flagsQueryKey, flags);
	await loadUiLocale(locale);

	return { theme, locale, session, flags };
}
