import { createFileRoute } from "@tanstack/react-router";
import { LanguageVersions } from "@/features/resume/variants/language-versions";
export const Route = createFileRoute("/dashboard/resumes/$resumeId/languages")({ component: Page });
function Page() {
	const { resumeId } = Route.useParams();
	return <LanguageVersions resumeId={resumeId} />;
}
