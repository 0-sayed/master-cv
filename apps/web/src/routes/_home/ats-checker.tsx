import { createFileRoute, redirect } from "@tanstack/react-router";
import { ATS_WORKSPACE_DESTINATION } from "@/features/ats-checker/destination";
export const Route = createFileRoute("/_home/ats-checker")({
	beforeLoad: ({ context, search }) => {
		throw redirect({
			to: context.session ? ATS_WORKSPACE_DESTINATION : "/",
			search: search.locale ? { locale: search.locale } : {},
			replace: true,
			statusCode: 301,
		});
	},
});
