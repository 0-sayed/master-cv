import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { orpc } from "@/libs/orpc/client";
/** A copy's stored identity is independent from the interface language and review status. */
export function VariantBanner({ resumeId }: { resumeId: string }) {
	const family = useQuery(orpc.resume.variants.list.queryOptions({ input: { resumeId } }));
	const current = family.data?.find((document) => document.resumeId === resumeId);
	if (!current || current.variantKind === "base") return null;
	return (
		<Alert variant="info">
			<AlertTitle>
				{current.variantKind === "language" ? <Trans>Language copy</Trans> : <Trans>Job copy</Trans>}
			</AlertTitle>
			<AlertDescription>
				<span>{current.documentLocale}</span>
				<p>
					<Trans>Saved copies remain independent. Review changes before applying them.</Trans>
				</p>
			</AlertDescription>
			<AlertActions>
				{current.sourceResumeId && (
					<Link to="/builder/$resumeId" params={{ resumeId: current.sourceResumeId }}>
						<Trans>Open source CV</Trans>
					</Link>
				)}
				{current.variantKind === "language" ? (
					<Link to="/dashboard/resumes/$resumeId/languages" params={{ resumeId }}>
						<Trans>Review language copy</Trans>
					</Link>
				) : (
					<Link to="/dashboard/resumes/$resumeId/job" params={{ resumeId }}>
						<Trans>Review job copy</Trans>
					</Link>
				)}
			</AlertActions>
		</Alert>
	);
}
