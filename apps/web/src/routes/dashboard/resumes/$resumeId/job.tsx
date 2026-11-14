import { createFileRoute } from "@tanstack/react-router";
import { JobTargetPage } from "@/features/career/job-target-page";
export const Route = createFileRoute("/dashboard/resumes/$resumeId/job")({ component: Page });
function Page() {
	const { resumeId } = Route.useParams();
	return <JobTargetPage resumeId={resumeId} />;
}
