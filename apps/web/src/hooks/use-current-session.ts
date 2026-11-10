import type { AuthSession } from "@reactive-resume/auth/types";
import { useRouteContext } from "@tanstack/react-router";
import { useContext } from "react";
import { IdentitySessionContext } from "@/features/auth/identity-boundary";
import { authClient } from "@/libs/auth/client";

/** Root loading already resolved identity. Keep that snapshot until the live subscription has initialized. */
export function useCurrentSession(): AuthSession | null {
	const { session } = useRouteContext({ from: "__root__" });
	const live = authClient.useSession();
	const confirmed = useContext(IdentitySessionContext);
	return confirmed !== undefined ? confirmed : ((live.isPending ? session : live.data) as AuthSession | null);
}
