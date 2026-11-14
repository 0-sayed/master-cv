import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useEditorStore } from "../store";
/** The persisted exact job is shared with the dashboard; no job keyword can become a CV fact here. */
export function JobMatchTab() {
	const identity = useEditorStore((state) => state.identity);
	return identity ? (
		<Link to="/dashboard/resumes/$resumeId/job" params={{ resumeId: identity.resumeId }}>
			<Trans>Compare with a job</Trans>
		</Link>
	) : null;
}
