import type { ReadinessState } from "@reactive-resume/resume/ats";
import type { PdfSeverity } from "@reactive-resume/resume/ats-pdf";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@reactive-resume/ui/components/accordion";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardRow } from "@reactive-resume/ui/components/section-card";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { getPdfSeverityLabel } from "@/features/ats-checker/messages";

const severityTone = {
	blocker: { alert: "error", badge: "danger", icon: "x-circle" },
	warning: { alert: "warn", badge: "warn", icon: "warning" },
	tip: { alert: "info", badge: "info", icon: "info" },
} as const;
type FindingCount = { severity: PdfSeverity };
type SummaryRowProps = { title: string; state: ReadinessState; findings: readonly FindingCount[] };
export function SummaryRow({ title, state, findings }: SummaryRowProps) {
	const current = state === "complete" || state === "partial";
	const counts = (["blocker", "warning", "tip"] as const).map((severity) => ({
		severity,
		count: findings.filter((f) => f.severity === severity).length,
	}));
	const label = {
		"not-checked": t`Not checked`,
		checking: t`Checking…`,
		complete: t`Checked`,
		skipped: t`Skipped`,
		partial: t`Partially checked`,
		stale: t`Out of date`,
		failed: t`Check failed`,
	}[state];
	return (
		<SectionCardRow variant="plain" className="flex-wrap justify-between">
			<span className="type-label">{title}</span>
			<div role="status" className="flex flex-wrap items-center gap-2">
				{state === "checking" && <Spinner decorative />}
				{(!current || state === "partial") && (
					<Badge
						variant={state === "failed" ? "danger" : state === "stale" || state === "partial" ? "warn" : "neutral"}
					>
						{label}
					</Badge>
				)}
				{current &&
					counts.map(
						({ severity, count }) =>
							count > 0 && (
								<Badge key={severity} variant={severityTone[severity].badge}>
									<Icon name={severityTone[severity].icon} />
									{getPdfSeverityLabel(severity)} ({count})
								</Badge>
							),
					)}
				{state === "complete" && findings.length === 0 && (
					<Badge variant="accent">
						<Icon name="check-circle" />
						<Trans>No blockers</Trans>
					</Badge>
				)}
			</div>
		</SectionCardRow>
	);
}
type FindingGroupProps = { severity: PdfSeverity; count: number; children: ReactNode };
export function FindingGroup({ severity, count, children }: FindingGroupProps) {
	if (!count) return null;
	return (
		<Accordion defaultValue={severity === "tip" ? [] : [severity]}>
			<AccordionItem value={severity}>
				<AccordionTrigger>
					<span className="flex items-center gap-2">
						<Badge variant={severityTone[severity].badge}>
							<Icon name={severityTone[severity].icon} />
							{getPdfSeverityLabel(severity)}
						</Badge>
						<span className="type-meta">({count})</span>
					</span>
				</AccordionTrigger>
				<AccordionContent>
					<div className="grid gap-3">{children}</div>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
}
type FindingCardProps = {
	severity: PdfSeverity;
	title: string;
	why: string;
	location?: string;
	snippet?: string | undefined;
	children: ReactNode;
};
export function FindingCard({ severity, title, why, location, snippet, children }: FindingCardProps) {
	const tone = severityTone[severity];
	return (
		<SectionCard>
			<Badge variant={tone.badge}>
				<Icon name={tone.icon} />
				{getPdfSeverityLabel(severity)}
			</Badge>
			<h5 className="type-label wrap-anywhere">{title}</h5>
			<p className="type-body text-ink-2">
				<Trans>Why it matters: {why}</Trans>
			</p>
			{location && <p className="type-meta text-ink-3">{location}</p>}
			{snippet && (
				<blockquote className="border-s border-line ps-3 type-body wrap-anywhere text-ink-2" dir="auto">
					{snippet}
				</blockquote>
			)}
			<ActionGroup tone={tone.alert}>{children}</ActionGroup>
		</SectionCard>
	);
}
type KeptFindingsProps = { count: number; fixed: readonly string[]; locked: boolean; onRestore: () => void };
export function KeptFindings({ count, fixed, locked, onRestore }: KeptFindingsProps) {
	if (!count && !fixed.length) return null;
	return (
		<Accordion defaultValue={[]}>
			<AccordionItem value="kept">
				<AccordionTrigger>
					<span className="type-meta text-ink-3">
						<Trans>{count} kept as is</Trans>
						{fixed.length > 0 && (
							<>
								{" "}
								· <Trans>{fixed.length} fixed</Trans>
							</>
						)}
					</span>
				</AccordionTrigger>
				<AccordionContent>
					{fixed.map((title, index) => (
						<p key={index} className="type-body text-accent-text">
							<Icon name="check-circle" /> <Trans>Fixed</Trans> · {title}
						</p>
					))}
				</AccordionContent>
			</AccordionItem>
			{count > 0 && (
				<Button variant="secondary" disabled={locked} onClick={onRestore}>
					<Trans>Show again</Trans> ({count})
				</Button>
			)}
		</Accordion>
	);
}
