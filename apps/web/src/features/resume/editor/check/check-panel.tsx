import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@reactive-resume/ui/components/button";
import { EditorPanel, EditorPanelHeader, EditorPanelBody } from "@reactive-resume/ui/components/editor-panel";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { resolveUiLocale } from "@reactive-resume/utils/locale";
import { useResumeReviewSummary } from "../proposals/review-panel";
import { useEditorStore, type ReviewTab } from "../store";
import { JobComparisonLink } from "./job-match";
import { useCheckPanelScroll } from "./panel-scroll";
import { pdfFindingKey } from "./pdf-findings";
import { ReviewFindings } from "./review-findings";
import { reviewTabs } from "./review-tabs";
import { useCheck } from "./use-check";
import { useReadiness } from "./use-readiness";
import { WritingTab } from "./writing-tab";
import { guideCopy } from "@/features/ats-guide/copy";
import { ATS_GUIDE_ROUTE } from "@/features/ats-guide/links";
import { SeverityFilter } from "@/features/review/severity-filter";

export function CheckPanel({ phone = false, active = true }: { phone?: boolean; active?: boolean }) {
	const { i18n } = useLingui();
	const check = useCheck();
	const { results, pdfReport } = useReadiness();
	const ai = useResumeReviewSummary();
	const tab = useEditorStore((state) => state.reviewTab);
	const filter = useEditorStore((state) => state.reviewFilters[tab]);
	const reviewReturn = useEditorStore((state) => state.exportHistorySession?.reviewReturn ?? false);
	const { ref, onScroll } = useCheckPanelScroll(active);
	if (!check) return null;
	const current = results.pdf.state === "complete" || results.pdf.state === "partial";
	const ignored = check.data.metadata.check?.ignored ?? [];
	const count =
		current && pdfReport
			? [...pdfReport.findings, ...pdfReport.tips].filter((finding) => !ignored.includes(pdfFindingKey(finding))).length
			: null;
	return (
		<Tabs
			value={tab}
			className="contents"
			onValueChange={(value) => useEditorStore.getState().setReviewTab(value as ReviewTab)}
		>
			<EditorPanel className="h-full" role="region" aria-label={t`Review findings`}>
				<EditorPanelHeader>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="type-section">
							<Trans>Review your CV</Trans>
						</h2>
						<Link
							to={ATS_GUIDE_ROUTE}
							search={{ locale: resolveUiLocale({ requested: i18n.locale }) }}
							className={buttonVariants({ variant: "link", size: "sm" })}
						>
							{i18n._(guideCopy.title)}
						</Link>
						{phone && (
							<Button variant="secondary" onClick={() => useEditorStore.getState().setMobileView("page")}>
								<Trans>Show CV</Trans>
							</Button>
						)}
						{reviewReturn && (
							<Button
								variant="secondary"
								onClick={() => {
									useEditorStore.getState().setExportHistoryReview(false);
									requestAnimationFrame(() =>
										document.getElementById("export-review-button")?.focus({ preventScroll: true }),
									);
								}}
							>
								<Trans>Back to Download</Trans>
							</Button>
						)}
					</div>
					<TabsList layout="equal" variant="line" size="review" aria-label={t`Review sections`}>
						<TabsTrigger
							aria-label={`${i18n._(reviewTabs[0].label)}${count !== null ? ` ${count}` : ""}`}
							value="ats"
							aria-busy={results.pdf.state === "checking" || undefined}
						>
							<Icon name={reviewTabs[0].icon} />
							<span data-review-label>{i18n._(reviewTabs[0].label)}</span>{" "}
							{count !== null ? (
								<TabsCount>{count}</TabsCount>
							) : results.pdf.state === "checking" ? (
								<Icon name="spinner" className="animate-spin motion-reduce:animate-none" />
							) : null}
						</TabsTrigger>
						<TabsTrigger aria-label={`${i18n._(reviewTabs[1].label)} ${check.issues.length}`} value="writing">
							<Icon name={reviewTabs[1].icon} />
							<span data-review-label>{i18n._(reviewTabs[1].label)}</span> <TabsCount>{check.issues.length}</TabsCount>
						</TabsTrigger>
						<TabsTrigger
							aria-label={`${i18n._(reviewTabs[2].label)} ${ai.pendingCount ?? t`AI unavailable`}`}
							value="ai"
						>
							<Icon name={reviewTabs[2].icon} />
							<span data-review-label>{i18n._(reviewTabs[2].label)}</span>{" "}
							{typeof ai.pendingCount === "number" ? <TabsCount>{ai.pendingCount}</TabsCount> : null}
						</TabsTrigger>
					</TabsList>
					<div className="flex flex-wrap items-center justify-between gap-2">
						{tab !== "ai" && (
							<SeverityFilter
								label={t`Severity filter`}
								value={filter}
								onChange={(value) => useEditorStore.getState().setReviewFilter(tab, value)}
								counts={
									Object.fromEntries(
										(["blocker", "warning", "tip"] as const).map((severity) => [
											severity,
											tab === "ats"
												? current && pdfReport
													? [...pdfReport.findings, ...pdfReport.tips].filter(
															(finding) => !ignored.includes(pdfFindingKey(finding)) && finding.severity === severity,
														).length
													: 0
												: check.issues.filter(
														(issue) => (issue.finding.severity === "info" ? "tip" : "warning") === severity,
													).length,
										]),
									) as Record<"blocker" | "warning" | "tip", number>
								}
							/>
						)}
						<JobComparisonLink />
					</div>
				</EditorPanelHeader>
				<EditorPanelBody ref={ref} onScroll={onScroll} tabIndex={-1} aria-label={t`Findings list`}>
					<TabsContent value={tab}>{tab === "ai" ? <WritingTab /> : <ReviewFindings tab={tab} />}</TabsContent>
				</EditorPanelBody>
			</EditorPanel>
		</Tabs>
	);
}
