import type { GuideCode } from "@/features/ats-guide/model";
import type { PdfSeverity } from "@reactive-resume/resume/ats-pdf";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Children } from "react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@reactive-resume/ui/components/accordion";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { SectionCardRow, SectionCard } from "@reactive-resume/ui/components/section-card";
import { resolveUiLocale } from "@reactive-resume/utils/locale";
import { getPdfSeverityLabel } from "@/features/ats-checker/messages";
import { guideCopy } from "@/features/ats-guide/copy";
import { ATS_GUIDE_ROUTE, guideRuleId } from "@/features/ats-guide/links";

const severityTone = {
	blocker: { alert: "error", badge: "danger", icon: "x-circle" },
	warning: { alert: "warn", badge: "warn", icon: "warning" },
	tip: { alert: "info", badge: "info", icon: "info" },
} as const;
type FindingCardProps = {
	grouped?: boolean;
	selected?: boolean;
	onSelect?: () => void;
	help?: ReactNode;
	guideCode?: GuideCode;
	severity: PdfSeverity;
	title: string;
	why: string;
	location?: string;
	locationHint?: string | undefined;
	snippet?: string | undefined;
	children: ReactNode;
};
export function FindingCard({
	grouped,
	severity,
	title,
	why,
	selected,
	onSelect,
	help,
	location,
	locationHint,
	snippet,
	children,
	guideCode,
}: FindingCardProps) {
	const tone = severityTone[severity];
	const actions = Children.toArray(children);
	const { i18n } = useLingui();
	const locale = resolveUiLocale({ requested: i18n.locale });
	const content = (
		<>
			<div data-slot="finding-summary" className="grid min-w-0 content-start gap-1">
				<div className="flex items-center gap-2">
					<Badge variant={tone.badge}>
						<Icon name={tone.icon} />
						{getPdfSeverityLabel(severity)}
					</Badge>
					<h3 className="min-w-0 flex-1 type-label wrap-anywhere">
						{onSelect ? (
							<button
								type="button"
								aria-pressed={selected}
								onClick={onSelect}
								className="touch-target w-full rounded-md text-start hover:bg-hover focus-visible:bg-hover"
							>
								{title}
							</button>
						) : (
							title
						)}
					</h3>
				</div>

				{location && (
					<div className="flex items-center gap-1 text-ink-3">
						<p className="type-meta">{location}</p>
						{locationHint && <IconButton icon="info" size="icon-sm" variant="ghost" label={locationHint} />}
					</div>
				)}
				{help ?? (
					<p className="type-body text-ink-2">
						<Trans>Why it matters: {why}</Trans>
					</p>
				)}
				{snippet && !help && (
					<blockquote className="border-s border-line ps-3 type-body wrap-anywhere text-ink-2" dir="auto">
						{snippet}
					</blockquote>
				)}
			</div>
			<ActionGroup density="compact" data-finding-actions>
				{actions.slice(0, -1)}
				<span className="inline-flex items-center gap-1">
					{actions.at(-1)}
					{guideCode && (
						<IconButton
							icon="question"
							variant="ghost"
							nativeButton={false}
							role="link"
							size="icon-sm"
							label={i18n._(guideCopy.learn)}
							render={
								<Link
									to={ATS_GUIDE_ROUTE}
									hash={guideRuleId(guideCode)}
									search={{ locale, returnTo: `${window.location.pathname}${window.location.search}` }}
								/>
							}
						/>
					)}
				</span>
			</ActionGroup>
		</>
	);
	return grouped ? (
		<SectionCardRow
			variant="plain"
			data-finding-card
			data-selected={selected || undefined}
			className={`grid min-w-0 gap-2 ${selected ? "ring-2 ring-accent" : ""}`}
		>
			{content}
		</SectionCardRow>
	) : (
		<SectionCard
			variant="compact"
			data-finding-card
			data-selected={selected || undefined}
			className={selected ? "ring-2 ring-accent" : undefined}
		>
			{content}
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
