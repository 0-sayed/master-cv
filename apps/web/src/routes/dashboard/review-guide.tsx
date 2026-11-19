import { createFileRoute } from "@tanstack/react-router";
import { reviewGuideSearch } from "@/features/ats-guide/links";
import { loadGuideEntries } from "@/features/ats-guide/model";
import { AtsGuidePage, AtsGuidePending, AtsGuideError } from "@/features/ats-guide/page";

export const Route = createFileRoute("/dashboard/review-guide")({
	validateSearch: reviewGuideSearch,
	loader: loadGuideEntries,
	component: GuideRoute,
	pendingComponent: AtsGuidePending,
	errorComponent: AtsGuideError,
});
function GuideRoute() {
	return <AtsGuidePage entries={Route.useLoaderData()} />;
}
