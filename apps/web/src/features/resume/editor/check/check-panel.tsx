import type { CheckIssue } from "./issues";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { useResumeStore, useIsResumeLocked } from "../../builder/draft";
import { useEditorStore } from "../store";
import { useCheckActions, editWithUndo, scrollToIssue } from "./actions";
import { FindingCard, FindingGroup, SummaryRow, KeptFindings } from "./check-sections";
import { acceptFix } from "./fix-preview";
import { getSectionName } from "./issues";
import { JobMatchTab } from "./job-match";
import { pdfFindingKey, pdfFieldTarget } from "./pdf-findings";
import { useCheck } from "./use-check";
import { useReadiness } from "./use-readiness";
import { WritingTab } from "./writing-tab";
import { getPdfFindingMessage } from "@/features/ats-checker/messages";
/** Each result answers a separate question. Counts describe findings, never hiring likelihood. */
export function CheckPanel() {
	const check = useCheck();
	const { restoreIgnored, ignorePdf, goToField } = useCheckActions();
	const locked = useIsResumeLocked();
	const { results, pdfReport, requestRetry, introduced, setIntroduced } = useReadiness();
	const preview = useEditorStore((state) => state.checkFixPreview);
	const setPreview = useEditorStore((state) => state.setCheckFixPreview);
	const [fixedResult, setFixed] = useState<{ checkedAt: string | null; titles: string[] }>({
		checkedAt: null,
		titles: [],
	});
	const [pendingFix, setPendingFix] = useState<string | null>(null);
	const checkedAt = results.pdf.checkedAt;
	const fixed = !checkedAt || fixedResult.checkedAt === checkedAt ? fixedResult.titles : [];
	if (!check) return null;
	const pdf = results.pdf;
	const current = pdf.state === "complete" || pdf.state === "partial";
	const ignored = check.data.metadata.check?.ignored ?? [];
	const pdfFindings = current && pdfReport ? [...pdfReport.findings, ...pdfReport.tips] : [];
	const visiblePdf = pdfFindings.filter((finding) => !ignored.includes(pdfFindingKey(finding)));
	const writing = check.issues.map((issue) => ({
		issue,
		severity: issue.finding.severity === "info" ? ("tip" as const) : ("warning" as const),
	}));
	return (
		<div className="grid content-start gap-4 p-4">
			<header className="grid gap-2">
				<h2 className="type-section">
					<Trans>Review your CV</Trans>
				</h2>
				<p className="type-meta text-ink-3">
					<Trans>Clear notes for each area, without an overall score or hiring prediction.</Trans>
				</p>
				<PageViewToggle />
			</header>
			{!introduced && (
				<Alert variant="info">
					<Icon name="info" />
					<AlertTitle>
						<Trans>You make the decision</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>
							Nothing changes without your approval. PDF readability checks the actual file; writing notes are advice.
							Arabic parsing can vary between hiring systems.
						</Trans>
					</AlertDescription>

					<AlertActions>
						<Button variant="secondary" onClick={() => setIntroduced(true)}>
							<Trans>Got it</Trans>
						</Button>
					</AlertActions>
				</Alert>
			)}
			<SectionCard aria-label={t`Check summary`}>
				<h3 className="type-label">
					<Trans>Check summary</Trans>
				</h3>
				<SummaryRow title={t`PDF readability`} state={pdf.state} findings={current ? visiblePdf : []} />
				<SummaryRow title={t`Writing notes`} state={results.writing.state} findings={writing} />
				<SummaryRow title={t`Job evidence`} state={results.job.state} findings={[]} />
				<JobMatchTab />
			</SectionCard>
			{locked && (
				<Alert variant="info">
					<Icon name="lock" />
					<AlertTitle>
						<Trans>This CV is locked</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>Unlock the CV to apply fixes or change kept findings. You can still read the results.</Trans>
					</AlertDescription>
				</Alert>
			)}
			<SectionCard
				aria-label={t`PDF readability`}
				data-pdf-bytes-hash={current && pdf.dimension === "pdf" ? pdf.source?.bytesHash : undefined}
			>
				<SectionCardHeader>
					<Icon name="file-pdf" />
					<h3 className="type-label">
						<Trans>PDF readability</Trans>
					</h3>
				</SectionCardHeader>
				<p className="type-body text-ink-2">
					<Trans>Can a hiring system read the text and order in this PDF?</Trans>
				</p>
				<PdfStateNotice state={pdf.state} onRetry={requestRetry} onStart={() => goToField({ kind: "header" })} />
				{(["blocker", "warning", "tip"] as const).map((severity) => {
					const findings = visiblePdf.filter((finding) => finding.severity === severity);
					return (
						<FindingGroup key={severity} severity={severity} count={findings.length}>
							{findings.map((finding) => {
								const message = getPdfFindingMessage(finding.code);
								const key = pdfFindingKey(finding);
								const target = pdfFieldTarget(finding.code);
								const section =
									target?.kind === "section"
										? getSectionName(check.data, target.sectionId)
										: target?.kind === "header"
											? t`Contact details`
											: "PDF";
								return (
									<div key={key} data-issue-card={key}>
										<FindingCard
											severity={severity}
											title={message.title}
											why={message.why}
											location={
												finding.evidence?.page
													? t`Page ${finding.evidence.page} · ${section}`
													: section === "PDF"
														? t`Location: Whole file`
														: t`Section: ${section}`
											}
											snippet={finding.evidence?.snippet}
										>
											{severity !== "tip" &&
												(target ? (
													<Button variant="secondary" disabled={locked} onClick={() => goToField(target, key)}>
														<Trans>Go to field</Trans>
													</Button>
												) : (
													<Button
														variant="secondary"
														onClick={() => {
															const editor = useEditorStore.getState();
															editor.setDrawerOpen(false);
															editor.setPageView("parser");
															editor.setMobileView("page");
														}}
													>
														<Icon name="brackets-curly" />
														<Trans>Review extracted text</Trans>
													</Button>
												))}
											{finding.evidence?.box && (
												<Button
													variant="secondary"
													onClick={() => {
														const editor = useEditorStore.getState();
														editor.setCheckReturnIssue(key);
														editor.setCheckIssue(key);
														editor.setPageView("page");
														editor.setMobileView("page");
														editor.setDrawerOpen(false);
														scrollToIssue(key, "page");
													}}
												>
													<Icon name="target" />
													<Trans>Show on page</Trans>
												</Button>
											)}
											{severity !== "blocker" && (
												<Button variant="secondary" disabled={locked} onClick={() => ignorePdf(key)}>
													{severity === "tip" ? <Trans>Ignore</Trans> : <Trans>Keep as is</Trans>}
												</Button>
											)}
										</FindingCard>
									</div>
								);
							})}
						</FindingGroup>
					);
				})}
				{pdf.state === "complete" && visiblePdf.every((finding) => finding.severity !== "blocker") && (
					<Alert variant="success">
						<Icon name="check-circle" />
						<AlertTitle>
							<Trans>No blockers</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>
								No reading blockers were found in the checked pages. This does not guarantee acceptance by every hiring
								system.
							</Trans>
						</AlertDescription>
					</Alert>
				)}
				{pdf.state === "complete" && (
					<Button variant="secondary" onClick={requestRetry}>
						<Icon name="arrow-clockwise" />
						<Trans>Check the PDF again</Trans>
					</Button>
				)}
			</SectionCard>
			<SectionCard aria-label={t`Writing and content`}>
				<SectionCardHeader>
					<Icon name="pencil-simple" />
					<h3 className="type-label">
						<Trans>Writing notes</Trans>
					</h3>
				</SectionCardHeader>
				<p className="type-body text-ink-2">
					<Trans>Advice about clarity and missing information. These notes do not predict acceptance.</Trans>
				</p>
				{(["warning", "tip"] as const).map((severity) => {
					const issues = writing.filter((entry) => entry.severity === severity);
					return (
						<FindingGroup key={severity} severity={severity} count={issues.length}>
							{issues.map(({ issue }) => (
								<IssueCard key={issue.key} issue={issue} onFix={() => setPendingFix(issue.title)} />
							))}
						</FindingGroup>
					);
				})}
				<KeptFindings count={ignored.length} fixed={fixed} locked={locked} onRestore={restoreIgnored} />
				<WritingTab />
			</SectionCard>
			<Dialog
				open={preview !== null}
				onOpenChange={(open) => {
					if (!open) setPreview(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							<Trans>Review this change</Trans>
						</DialogTitle>
						<DialogDescription>
							<Trans>Only this CV changes when you accept. Your career information stays unchanged.</Trans>
						</DialogDescription>
					</DialogHeader>
					{preview?.changes.map((change, index) => (
						<SectionCard key={index}>
							<p className="type-meta">
								<Trans>Before</Trans>
							</p>
							<p className="type-body wrap-anywhere" dir="auto">
								{change.before}
							</p>
							<p className="type-meta">
								<Trans>After</Trans>
							</p>
							<p className="type-body wrap-anywhere" dir="auto">
								{change.after}
							</p>
						</SectionCard>
					))}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setPreview(null)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={locked}
							onClick={() => {
								const draft = useResumeStore.getState().resume;
								if (preview && draft && !locked) {
									const accepted = acceptFix(preview, useEditorStore.getState().identity, draft.data, (after) =>
										editWithUndo((data) => Object.assign(data, after), t`Change accepted`),
									);
									if (accepted && pendingFix) setFixed({ checkedAt, titles: [...fixed, pendingFix] });
								}
								setPreview(null);
							}}
						>
							<Trans>Accept change</Trans>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

/** Selects what the canvas shows from the Check panel; mobile Page navigation keeps the selection. */
function PageViewToggle() {
	const view = useEditorStore((state) => state.pageView);
	const setView = useEditorStore((state) => state.setPageView);
	const options = [
		{ value: "page", label: t`What a person sees`, icon: "file-text" },
		{ value: "parser", label: t`What a parser reads`, icon: "brackets-curly" },
	] as const;

	return (
		<SegmentedControl
			aria-label={t`Page view`}
			value={view}
			onValueChange={(value) => {
				if (value === "page" || value === "parser") setView(value);
			}}
		>
			{options.map((option) => (
				<SegmentedControlItem key={option.value} value={option.value}>
					<Icon name={option.icon} size={18} />
					<span className="max-sm:sr-only">{option.label}</span>
				</SegmentedControlItem>
			))}
		</SegmentedControl>
	);
}

type IssueCardProps = { issue: CheckIssue; onFix: () => void };
function IssueCard({ issue, onFix }: IssueCardProps) {
	const { fix, ignore, showOnPage } = useCheckActions();
	const locked = useIsResumeLocked();
	const check = useCheck();
	const pageMap = useEditorStore((state) => state.rendered.pageMap);
	const node = pageMap?.nodes.find(
		(node) =>
			issue.target?.kind === node.kind &&
			(node.kind === "header" ||
				(issue.target &&
					"sectionId" in issue.target &&
					issue.target.sectionId === node.sectionId &&
					(node.kind !== "item" || (issue.target.kind === "item" && issue.target.itemId === node.itemId)))),
	);
	const section =
		issue.target && "sectionId" in issue.target && check
			? getSectionName(check.data, issue.target.sectionId)
			: t`Contact details`;
	const location = node ? t`Page ${node.page + 1} · ${section}` : t`Section: ${section}`;
	const severity = issue.finding.severity === "info" ? "tip" : "warning";
	return (
		<div data-issue-card={issue.key}>
			<FindingCard
				severity={severity}
				title={issue.title}
				why={issue.body}
				location={location}
				snippet={String(issue.finding.params?.value ?? "")}
			>
				{severity !== "tip" && (
					<Button
						variant={issue.fix.kind === "apply" ? "primary" : "secondary"}
						disabled={locked}
						onClick={() => {
							onFix();
							fix(issue);
						}}
					>
						{issue.fix.kind === "apply" ? <Trans>Fix</Trans> : <Trans>Go to field</Trans>}
					</Button>
				)}
				{issue.target && (
					<Button variant="secondary" onClick={() => showOnPage(issue)}>
						<Icon name="target" />
						<Trans>Show on page</Trans>
					</Button>
				)}
				<Button variant="secondary" disabled={locked} onClick={() => ignore(issue)}>
					{severity === "tip" ? <Trans>Ignore</Trans> : <Trans>Keep as is</Trans>}
				</Button>
			</FindingCard>
		</div>
	);
}
function PdfStateNotice({ state, onRetry, onStart }: { state: string; onRetry: () => void; onStart: () => void }) {
	if (state === "complete") return null;
	const title =
		state === "stale"
			? t`Result out of date`
			: state === "failed"
				? t`Check failed`
				: state === "partial"
					? t`Partially checked`
					: state === "checking"
						? t`Checking…`
						: state === "skipped"
							? t`Skipped`
							: t`Not checked`;
	const description =
		state === "stale"
			? t`You edited the CV after the last check. Check it again for current results.`
			: state === "failed"
				? t`The PDF could not be checked. Your CV is preserved; retry or keep editing.`
				: state === "partial"
					? t`Some pages or checks could not be read completely. This result does not cover the whole file.`
					: state === "checking"
						? t`Analyzing text extracted from the PDF. Your CV remains unchanged.`
						: t`Add information to your CV to check its PDF readability.`;
	return (
		<Alert variant={state === "failed" ? "error" : state === "stale" || state === "partial" ? "warn" : "info"}>
			{state === "checking" ? (
				<Spinner decorative />
			) : (
				<Icon name={state === "failed" || state === "stale" || state === "partial" ? "warning-circle" : "info"} />
			)}
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>
				<p>{description}</p>
			</AlertDescription>
			<AlertActions>
				{state === "not-checked" || state === "skipped" ? (
					<Button variant="secondary" onClick={onStart}>
						<Trans>Add information</Trans>
					</Button>
				) : (
					state !== "checking" && (
						<Button variant="secondary" onClick={onRetry}>
							<Trans>Check the PDF again</Trans>
						</Button>
					)
				)}
			</AlertActions>
		</Alert>
	);
}
