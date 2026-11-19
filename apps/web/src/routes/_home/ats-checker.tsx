import { createFileRoute, redirect } from "@tanstack/react-router";
import { ATS_WORKSPACE_DESTINATION } from "@/features/ats-checker/destination";
export const Route = createFileRoute("/_home/ats-checker")({
	beforeLoad: ({ context, search }) => {
		throw redirect({
			to: context.session ? ATS_WORKSPACE_DESTINATION : "/auth/login",
			search: {
				...(search.locale ? { locale: search.locale } : {}),
				...(!context.session ? { callbackURL: ATS_WORKSPACE_DESTINATION } : {}),
			},
			replace: true,
			statusCode: 301,
		});
	},
});
