import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/libs/auth/session";
import { sessionQueryKey } from "@/libs/root-context";

export function usePublicSession() {
	const query = useQuery({
		queryKey: sessionQueryKey,
		queryFn: getSession,
		staleTime: 60_000,
		enabled: typeof window !== "undefined",
	});
	return { session: query.data ?? null, pending: query.data === undefined || query.isError };
}
