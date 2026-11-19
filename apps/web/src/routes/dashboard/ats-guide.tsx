import { createFileRoute, redirect } from "@tanstack/react-router";
import { reviewGuideRedirect } from "@/features/ats-guide/links";
export const Route = createFileRoute("/dashboard/ats-guide")({
	beforeLoad: ({ location }) => {
		throw redirect(reviewGuideRedirect(location));
	},
});
