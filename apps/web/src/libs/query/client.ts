import { StandardRPCJsonSerializer } from "@orpc/client/standard";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

const serializer = new StandardRPCJsonSerializer();

export const getQueryClient = () => {
	const recoverSession = (error: unknown) => {
		if (!error || typeof error !== "object" || !("code" in error) || error.code !== "UNAUTHORIZED") return;
		queryClient.clear();
		queryClient.setQueryData(["auth", "session"], null);
		window.dispatchEvent(new Event("master-cv:session-expired"));
	};
	const queryClient = new QueryClient({
		queryCache: new QueryCache({ onError: recoverSession }),
		defaultOptions: {
			queries: {
				gcTime: 5 * 60 * 1000, // 5 minutes
				staleTime: 60 * 1000, // 1 minute
				queryKeyHashFn(queryKey) {
					const [json, meta] = serializer.serialize(queryKey);
					return JSON.stringify({ json, meta });
				},
			},
		},
		mutationCache: new MutationCache({
			onError: recoverSession,
			onSettled: (_1, _2, _3, _4, _5, context) => {
				if (context?.meta?.noInvalidate) return;
				void queryClient.invalidateQueries({
					predicate: (query) => {
						const key = query.queryKey[0];
						return key !== "auth" && key !== "flags";
					},
				});
			},
		}),
	});

	return queryClient;
};
