import { useQuery } from "@tanstack/react-query";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { orpc } from "@/libs/orpc/client";

/**
 * Single source of truth for "is an AI provider ready to use" (enabled AND its connection test succeeded).
 * Replaces the predicate that was duplicated across the import dialog, agent setup, and AI settings.
 */
export function useHasUsableAiProvider() {
	const enabled = isFeatureAvailable("byok");
	const query = useQuery({ ...orpc.aiProviders.list.queryOptions(), enabled });
	// An unsuccessful lookup cannot establish which connection is safe to use, even with stale cached data.
	const usableProviders =
		enabled && query.isSuccess
			? query.data.filter((provider) => provider.enabled && provider.testStatus === "success")
			: [];

	return {
		error: query.error,
		hasUsableProvider: usableProviders.length > 0,
		isLoading: enabled && query.isPending,
		isUnavailable: enabled && (query.isPending || query.isError),
		retry: () => {
			if (enabled) void query.refetch();
		},
		usableProviders,
	};
}
