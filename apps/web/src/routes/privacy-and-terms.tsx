import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/features/legal/page";
import { legalSearchSchema } from "@/features/legal/search";
import { createNoindexFollowMeta, getPublicPageMeta } from "@/libs/seo";
export const Route = createFileRoute("/privacy-and-terms")({
	validateSearch: legalSearchSchema,
	head: () => {
		const { title, description } = getPublicPageMeta("privacy-and-terms");
		return { meta: [{ title }, { name: "description", content: description }, createNoindexFollowMeta()] };
	},
	component: LegalRoute,
});
function LegalRoute() {
	const { tab } = Route.useSearch();
	return <LegalPage tab={tab} />;
}
