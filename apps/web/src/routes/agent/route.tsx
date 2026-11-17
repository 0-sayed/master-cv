import { createFileRoute, redirect, notFound } from "@tanstack/react-router";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { FeatureUnavailable } from "@/features/personal-tools/unavailable";

// The Agents pages became the assistant in the editor; their links redirect there (through 6.0.x).
export const Route = createFileRoute("/agent")({
	notFoundComponent: FeatureUnavailable,
	beforeLoad: ({ context, location }) => {
		if (!isFeatureAvailable("assistant")) throw notFound({ routeId: "/agent" });
		if (!context.session) throw redirect({ to: "/auth/login", search: { callbackURL: location.href }, replace: true });
	},
});
