import { createFileRoute, redirect } from "@tanstack/react-router";

// Settings became three pages in 6.0; the old address redirects (through 6.0.x).
export const Route = createFileRoute("/dashboard/settings/job-search")({
	beforeLoad: ({ search, context }) => {
		throw redirect({
			to: "/dashboard/settings/ai",
			search: { locale: search.locale ?? context.locale },
			replace: true,
		});
	},
});
