import type { AuthSession } from "@reactive-resume/auth/types";
import type { QueryClient } from "@tanstack/react-query";
import { browserStorage, storageKey, clearPersonalStorage, invalidatePersonalRequests } from "../browser-storage";
export const sessionQueryKey = ["auth", "session"] as const;
type IdentityState =
	| { status: "confirmed"; generation: number; session: AuthSession | null }
	| { status: "checking"; generation: number; previousOwnerId: string | null };
const identities = new WeakMap<QueryClient, ReturnType<typeof createIdentity>>();
function createIdentity(client: QueryClient) {
	const cached = client.getQueryData<AuthSession | null>(sessionQueryKey);
	let previousOwnerId: string | null = null;
	try {
		// A suspended tab can miss the broadcast while another tab changes the shared local owner.
		previousOwnerId =
			browserStorage.session.getItem(storageKey("identityOwner")) ??
			browserStorage.local.getItem(storageKey("identityOwner"));
	} catch {
		/* Storage may be unavailable. */
	}
	let state: IdentityState =
		cached !== undefined
			? { status: "confirmed", generation: 0, session: cached }
			: { status: "checking", generation: 0, previousOwnerId };

	const listeners = new Set<() => void>();
	const publish = (next: IdentityState) => {
		state = next;
		for (const notify of listeners) notify();
	};
	const owner = () => (state.status === "confirmed" ? (state.session?.user.id ?? null) : state.previousOwnerId);
	return {
		snapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		check: () => {
			const previousOwnerId = owner();
			invalidatePersonalRequests();
			void client.cancelQueries();
			client.clear();
			publish({ status: "checking", generation: state.generation + 1, previousOwnerId });
		},
		accept: (session: AuthSession | null, expectedGeneration = state.generation) => {
			if (expectedGeneration !== state.generation) return false;
			const previous = owner();
			const changed = previous !== (session?.user.id ?? null);
			if (changed) {
				void client.cancelQueries();
				clearPersonalStorage();
				client.clear();
			}
			try {
				for (const storage of [browserStorage.local, browserStorage.session]) {
					if (session) storage.setItem(storageKey("identityOwner"), session.user.id);
					else storage.removeItem(storageKey("identityOwner"));
				}
			} catch {
				/* Storage may be unavailable. */
			}
			publish({ status: "confirmed", generation: state.generation + (changed ? 1 : 0), session });
			return true;
		},
	};
}
export function authIdentity(client: QueryClient) {
	let identity = identities.get(client);
	if (!identity) {
		identity = createIdentity(client);
		identities.set(client, identity);
	}
	return identity;
}
