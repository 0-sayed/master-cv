import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useUiLocale } from "@/features/locale/provider";
import { authClient } from "@/libs/auth/client";
import { authIdentity, sessionQueryKey } from "@/libs/auth/identity";
import { getSession } from "@/libs/auth/session";
import { clearPersonalStorage } from "@/libs/browser-storage";

/** Leave private UI before revoking access, so its pending requests cannot report an expired session. */
export function useSignOut() {
	const queryClient = useQueryClient();
	const router = useRouter();
	const { locale } = useUiLocale();
	return async () => {
		const identity = authIdentity(queryClient);
		identity.check();
		try {
			const result = await authClient.signOut();
			if (result.error) throw result.error;
		} catch (error) {
			// Confirm identity independently: an unrelated loader failure must not leave private UI in checking.
			const session = await getSession().catch(() => null);
			identity.accept(session);
			queryClient.setQueryData(sessionQueryKey, session);
			if (!session)
				await router.navigate({ to: "/auth/login", search: { locale }, replace: true }).catch(() => undefined);
			await router.invalidate().catch(() => undefined);
			throw error;
		}
		clearPersonalStorage();
		identity.accept(null);
		queryClient.clear();
		queryClient.setQueryData(sessionQueryKey, null);
		await router.navigate({ to: "/auth/login", search: { locale }, replace: true });
		await router.invalidate();
	};
}
