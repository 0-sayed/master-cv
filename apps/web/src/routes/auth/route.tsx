import { createFileRoute, notFound } from "@tanstack/react-router";
import { deferredRoute, isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { AuthLayout } from "@/features/auth/layout";
import { authSearchSchema } from "@/features/auth/redirect";
import { DeferredRouteNotFound } from "@/features/personal-tools/unavailable";
import { createNoindexFollowMeta } from "@/libs/seo";

export const Route = createFileRoute("/auth")({
	notFoundComponent: DeferredRouteNotFound,
	beforeLoad: ({ location }) => {
		const feature = deferredRoute(location.pathname);
		if (feature && !isFeatureAvailable(feature)) throw notFound({ routeId: "/auth" });
	},
	component: AuthLayout,
	validateSearch: authSearchSchema,
	head: () => ({
		meta: [createNoindexFollowMeta()],
	}),
});
