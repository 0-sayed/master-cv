import type { GuideCode, GuideEntry } from "./model";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Disclosure, DisclosureContent, DisclosureSummary } from "@reactive-resume/ui/components/disclosure";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { RuleDetail } from "@reactive-resume/ui/components/rule-detail";
import { guideCopy as copy } from "./copy";
import { atsGuideRuleHref } from "./links";
import { guideRuleId } from "./model";
import { useUiLocale } from "@/features/locale/provider";

function GuideRule({
	entry,
	open,
	onToggle,
}: {
	entry: GuideEntry;
	open: boolean;
	onToggle: (code: GuideCode, open: boolean) => void;
}) {
	const { locale } = useUiLocale();
	const { i18n } = useLingui();
	const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
	const text = entry.text[locale];
	const rtl = locale.startsWith("ar");
	const severity =
		entry.severity === "blocker"
			? "blocker"
			: entry.severity === "warning" || entry.severity === "error"
				? "warning"
				: "tip";
	const icon = severity === "blocker" ? "warning-circle" : severity === "warning" ? "warning" : "info";
	const label =
		entry.source === "editor"
			? severity === "blocker"
				? copy.editorError
				: severity === "warning"
					? copy.editorWarning
					: copy.editorInfo
			: copy[severity];
	const effect =
		entry.source === "editor"
			? i18n._(copy.editorEffect)
			: entry.cap !== null
				? i18n._({ ...copy.cap, values: { cap: `\u2066${entry.cap}\u2069` } })
				: entry.deduction > 0
					? i18n._({ ...copy.deduction, values: { points: `\u2066−${entry.deduction}\u2069` } })
					: i18n._(copy.noEffect);
	return (
		<Disclosure
			id={guideRuleId(entry.code)}
			open={open}
			onToggle={(event) => onToggle(entry.code, event.currentTarget.open)}

			actions={
				<IconButton
					icon={copyState === "copied" ? "check" : "link"}
					size="icon-sm"
					label={i18n._(copy.permalink)}
					onClick={async () => {
						const url = new URL(atsGuideRuleHref(entry.code), window.location.origin);
						url.searchParams.set("locale", locale);
						url.hash = guideRuleId(entry.code);
						try {
							await navigator.clipboard.writeText(url.href);
							setCopyState("copied");
						} catch {
							setCopyState("error");
						}
					}}
				/>
			}
		>
			<DisclosureSummary description={<span className="font-medium text-ink">{text.action}</span>}>
				<Badge variant={severity === "blocker" ? "danger" : severity === "warning" ? "warn" : "info"}>
					<Icon name={icon} />
					{i18n._(label)}
				</Badge>
				<span className="min-w-0 flex-1">{text.title}</span>
				{entry.source === "editor" && (
					<Badge variant="neutral">
						<Icon name="database" />
						{i18n._(copy.editor)}
					</Badge>
				)}
				<Badge variant="outline">
					<bdi data-guide-effect dir={rtl ? "rtl" : "ltr"}>
						{effect}
					</bdi>
				</Badge>
			</DisclosureSummary>
			<DisclosureContent>
				{copyState !== "idle" && (
					<p role="status" className="type-caption text-ink-3">
						{i18n._(copyState === "copied" ? copy.copied : copy.copyError)}
					</p>
				)}
				<p className="type-label">{t`Illustrative example`}</p>
				<RuleDetail
					direction={rtl ? "rtl" : "ltr"}
					why={text.why}
					example={{ before: text.before, after: text.after }}
					labels={{
						why: i18n._(copy.why),
						before: i18n._(copy.before),
						after: i18n._(copy.after),
						showMore: i18n._(copy.showMore),
						showLess: i18n._(copy.showLess),
					}}
				/>
			</DisclosureContent>
		</Disclosure>
	);
}

export function GuideRuleList({
	entries,
	openCodes,
	onToggle,
}: {
	entries: readonly GuideEntry[];
	openCodes: ReadonlySet<GuideCode>;
	onToggle: (code: GuideCode, open: boolean) => void;
}) {
	return (
		<div>
			{entries.map((entry) => (
				<GuideRule key={entry.code} entry={entry} open={openCodes.has(entry.code)} onToggle={onToggle} />
			))}
		</div>
	);
}
