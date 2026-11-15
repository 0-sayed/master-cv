import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/libs/orpc/client";

export function accountSecurityQueryOptions() {
	return orpc.privacy.security.queryOptions();
}
export function useAccountSecurity() {
	const query = useQuery(accountSecurityQueryOptions());
	const refresh = async () => {
		await query.refetch();
	};
	if (query.isError) return { status: "error" as const, data: query.data, refresh };
	if (!query.data) return { status: "loading" as const, refresh };
	return { status: "ready" as const, data: query.data, refresh };
}
