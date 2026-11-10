import type { AuthSession } from "@reactive-resume/auth/types";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { getGlobalBroadcastChannel } from "better-auth/client";
import { createContext, useEffect, useSyncExternalStore } from "react";
import { useDocumentWebMcpTools } from "@/features/documents/webmcp";
import { authClient } from "@/libs/auth/client";
import { authIdentity } from "@/libs/auth/identity";
export const IdentitySessionContext = createContext<AuthSession | null | undefined>(undefined);
type IdentityBoundaryProps = { queryClient: QueryClient; session: AuthSession | null; children: ReactNode };
/** Router and reactive auth share one generation. A different/unknown owner never renders the old subtree. */
export function IdentityBoundary({ queryClient, session, children }: IdentityBoundaryProps) {
	const identity = authIdentity(queryClient);
	const state = useSyncExternalStore(identity.subscribe, identity.snapshot);
	const live = authClient.useSession();
	const { refetch } = live;
	const router = useRouter();
	const routeOwner = session?.user.id ?? null;
	const liveOwner = live.data?.user.id ?? null;
	const mismatched = !live.isPending && !live.error && liveOwner !== routeOwner;
	useEffect(() => {
		if (!mismatched) return;
		identity.check();
		// An expired RPC may update the router before Better Auth observes the cookie change.
		void refetch().finally(() => router.invalidate());
	}, [mismatched, identity, router, refetch]);
	useEffect(
		() =>
			getGlobalBroadcastChannel().subscribe(() => {
				// Better Auth's cross-tab signal precedes its async session fetch. Hide private content immediately.
				identity.check();
				void router.invalidate();
			}),
		[identity, router],
	);
	useDocumentWebMcpTools(
		state.status === "confirmed" && !mismatched && state.session !== null && state.session?.user.id === routeOwner,
	);
	if (state.status === "checking" || mismatched || state.session?.user.id !== session?.user.id) return null;
	const confirmed =
		!live.isPending && !live.error && liveOwner === routeOwner ? (live.data as AuthSession | null) : state.session;
	return (
		<IdentitySessionContext.Provider key={state.generation} value={confirmed}>
			{children}
		</IdentitySessionContext.Provider>
	);
}
