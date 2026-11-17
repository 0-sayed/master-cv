import { createFileRoute, Outlet, redirect, notFound } from "@tanstack/react-router";
import { deferredRoute, isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { AppShell } from "./-components/app-shell";
import { DeferredRouteNotFound } from "@/features/personal-tools/unavailable";
import { createNoindexFollowMeta } from "@/libs/seo";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
	notFoundComponent: DeferredRouteNotFound,
	beforeLoad: ({ context, location }) => {
		const feature = deferredRoute(location.pathname);
		if (feature && !isFeatureAvailable(feature)) throw notFound({ routeId: "/dashboard" });
		if (!context.session)
			throw redirect({
				to: "/auth/login",
				search: { locale: context.locale, callbackURL: location.href },
				replace: true,
			});
		if (!context.session.user.emailVerified)
			throw redirect({
				to: "/auth/verify-email",
				search: { locale: context.locale, email: context.session.user.email, callbackURL: location.href },
				replace: true,
			});
		return { session: context.session };
	},
	head: () => ({
		meta: [createNoindexFollowMeta()],
	}),
});

function RouteComponent() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}
