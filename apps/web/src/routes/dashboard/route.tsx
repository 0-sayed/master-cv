import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "./-components/app-shell";
import { createNoindexFollowMeta } from "@/libs/seo";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
	beforeLoad: ({ context, location }) => {
		if (!context.session) throw redirect({ to: "/auth/login", search: { callbackURL: location.href }, replace: true });
		if (!context.session.user.emailVerified)
			throw redirect({
				to: "/auth/verify-email",
				search: { email: context.session.user.email, callbackURL: location.href },
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
