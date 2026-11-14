import type { JobTermReport } from "@reactive-resume/schema/job-evidence";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { useVariantsCopy } from "../resume/variants/copy.generated";

type LiteralJobEvidenceProps = { report: JobTermReport; resumeId: string };
/** Exact selected terms and their local evidence; missing words never imply missing ability. */
export function LiteralJobEvidence({ report, resumeId }: LiteralJobEvidenceProps) {
	const copy = useVariantsCopy();
	return (
		<SectionCard>
			<h3 className="type-label">
				<Trans>Literal text coverage</Trans>
			</h3>
			{report ? (
				<>
					<p>
						<Trans>
							{report.matchedCount} of {report.denominator} selected terms appear in this CV.
						</Trans>
					</p>
					<p className="type-metadata text-ink-2">
						<Trans>
							Up to 35 distinct ranked terms. Arabic marks and digit forms, case and known aliases are normalized. This
							checks text occurrence, not ability or all advertised requirements.
						</Trans>
					</p>
					{report.state === "not-checkable" && (
						<p>
							<Trans>No terms stood out in this ad.</Trans>
						</p>
					)}
					{report.terms.map((term) => (
						<details key={term.term}>
							<summary dir="auto">
								{term.term} · {term.matched ? <Trans>Found in CV</Trans> : <Trans>Not found in CV</Trans>}
							</summary>
							<div className="grid gap-2">
								{term.jobSpans.map((span) => (
									<blockquote key={span.id} dir="auto">
										{span.quote}
									</blockquote>
								))}
								{term.cvSpans.map((span) => (
									<div key={span.id}>
										<blockquote dir="auto">{span.quote}</blockquote>
										<Link to="/builder/$resumeId" params={{ resumeId }} search={{ source: span.target }}>
											{copy("jobs.evidence.showInCv")}
										</Link>
									</div>
								))}
							</div>
						</details>
					))}
					{report.selection.truncated && (
						<p>
							<Trans>Additional terms were excluded by the ranked limit.</Trans> {report.excludedTerms.join(", ")}
						</p>
					)}
				</>
			) : null}
		</SectionCard>
	);
}
