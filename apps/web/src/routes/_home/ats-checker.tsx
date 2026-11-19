import { createFileRoute, redirect } from "@tanstack/react-router";
import { ATS_GUIDE_ROUTE } from "@/features/ats-guide/links";
export const Route = createFileRoute("/_home/ats-checker")({
	beforeLoad: ({ search }) => {
		throw redirect({
			to: ATS_GUIDE_ROUTE,
			search: search.locale ? { locale: search.locale } : {},
			replace: true,
			statusCode: 308,
		});
	},
});
