import type { CheckIssue } from "./issues";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { useResumeStore, useIsResumeLocked } from "../../builder/draft";
import { useEditorStore } from "../store";
import { useCheckActions, editWithUndo } from "./actions";
import { acceptFix } from "./fix-preview";
import { useCheck } from "./use-check";
import { useReadiness } from "./use-readiness";
import { WritingTab } from "./writing-tab";
import { getPdfFindingMessage, getPdfSeverityLabel } from "@/features/ats-checker/messages";
const readinessStateLabel = (state: string) =>
	({
		"not-checked": t`Not checked`,
		checking: t`Checking…`,
		complete: t`Checked`,
		skipped: t`Skipped`,
		partial: t`Partially checked`,
		stale: t`Out of date`,
		failed: t`Check failed`,
	})[state] ?? t`Not checked`;

/** Each result answers a separate question. Counts describe findings, never hiring likelihood. */
export function CheckPanel() {
	const check = useCheck();
	const { restoreIgnored } = useCheckActions();
	const locked = useIsResumeLocked();
	const { results, pdfReport, requestRetry, introduced, setIntroduced } = useReadiness();
	const preview = useEditorStore((state) => state.checkFixPreview);
	const setPreview = useEditorStore((state) => state.setCheckFixPreview);
	if (!check) return null;
	const pdf = results.pdf;
	const current = pdf.state === "complete" || pdf.state === "partial";
	const blockers = pdf.issues.filter((issue) => issue.severity === "blocker").length;
	const warnings = pdf.issues.filter((issue) => issue.severity === "warning").length;
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
				<Alert>
					<AlertTitle>
						<Trans>You make the decision</Trans>
					</AlertTitle>
					<AlertDescription>
						<Trans>
							Nothing changes without your approval. PDF readability checks the actual file; writing notes are advice.
							Arabic parsing can vary between hiring systems.
						</Trans>
					</AlertDescription>
					<Button variant="ghost" onClick={() => setIntroduced(true)}>
						<Trans>Got it</Trans>
					</Button>
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
				<p role="status" className="type-label">
					{readinessStateLabel(pdf.state)}
				</p>
				{current && (
					<p className="type-meta">
						<Trans>
							{blockers} blockers · {warnings} warnings
						</Trans>
					</p>
				)}
				{pdf.state === "partial" && (
					<Alert variant="warn">
						<Icon name="warning-circle" />
						<AlertTitle>
							<Trans>Partially checked</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>
								Some pages or checks could not be read completely. This result does not cover the whole file.
							</Trans>
							<Button variant="secondary" onClick={requestRetry}>
								<Trans>Check the PDF again</Trans>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{pdf.state === "failed" && (
					<Alert variant="error">
						<Icon name="warning-circle" />
						<AlertTitle>
							<Trans>Check failed</Trans>
						</AlertTitle>
						<AlertDescription>
							<p>
								<Trans>The PDF could not be checked. Your CV is preserved; retry or keep editing.</Trans>
							</p>
							<Button variant="secondary" onClick={requestRetry}>
								<Trans>Check the PDF again</Trans>
							</Button>
						</AlertDescription>
					</Alert>
				)}
				{current &&
					pdfReport &&
					(["blocker", "warning", "tip"] as const).map((severity) => {
						const findings = [...pdfReport.findings, ...pdfReport.tips].filter(
							(finding) => finding.severity === severity,
						);
						return (
							findings.length > 0 && (
								<section key={severity} className="grid gap-3">
									<h4 className="type-label">{getPdfSeverityLabel(severity)}</h4>
									{findings.map((finding, index) => {
										const message = getPdfFindingMessage(finding.code);
										return (
											<SectionCard key={`${finding.code}:${index}`}>
												<h5 className="type-label">{message.title}</h5>
												<p className="type-body text-ink-2">{message.action}</p>
												{finding.evidence?.page && (
													<p className="type-meta">
														<Trans>Page {finding.evidence.page}</Trans>
													</p>
												)}
												{finding.evidence?.snippet && (
													<blockquote className="type-body wrap-anywhere" dir="auto">
														{finding.evidence.snippet}
													</blockquote>
												)}
												<Button
													variant="secondary"
													onClick={() => {
														useEditorStore.getState().setDrawerOpen(false);
														useEditorStore.getState().setPageView("parser");
														useEditorStore.getState().setMobileView("page");
													}}
												>
													<Trans>Review extracted text</Trans>
												</Button>
											</SectionCard>
										);
									})}
								</section>
							)
						);
					})}
				{pdf.state !== "failed" && pdf.state !== "partial" && (
					<Button variant="secondary" disabled={pdf.state === "checking"} onClick={requestRetry}>
						<Icon name="arrow-clockwise" />
						<Trans>Check the PDF again</Trans>
					</Button>
				)}
			</SectionCard>
			<SectionCard aria-label={t`Writing and content`}>
				<SectionCardHeader>
					<Icon name="pencil-simple" />
					<h3 className="type-label">
						<Trans>Writing and content</Trans>
					</h3>
				</SectionCardHeader>
				<p className="type-body text-ink-2">
					<Trans>Advice about clarity and missing information. These notes do not predict acceptance.</Trans>
				</p>
				<p role="status" className="type-meta">
					{readinessStateLabel(results.writing.state)}
				</p>
				<ul className="grid gap-3">
					{check.issues.map((issue) => (
						<IssueCard key={issue.key} issue={issue} />
					))}
				</ul>
				{check.report.ignored.length > 0 && (
					<Button variant="secondary" disabled={locked} onClick={restoreIgnored}>
						<Icon name="arrow-counter-clockwise" />
						<Trans>Show again</Trans> ({check.report.ignored.length})
					</Button>
				)}
				<WritingTab />
			</SectionCard>
			<SectionCard aria-label={t`Evidence for a selected job`}>
				<SectionCardHeader>
					<Icon name="target" />
					<h3 className="type-label">
						<Trans>Evidence for a selected job</Trans>
					</h3>
				</SectionCardHeader>
				<p role="status" className="type-meta">
					<Trans>Not checked</Trans>
				</p>
				<p className="type-body text-ink-2">
					<Trans>A selected job and reviewed evidence are required. Job comparison is not available yet.</Trans>
				</p>
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
					<div className="flex flex-wrap gap-3">
						<Button variant="secondary" onClick={() => setPreview(null)}>
							<Trans>Reject</Trans>
						</Button>
						<Button
							onClick={() => {
								const draft = useResumeStore.getState().resume;
								if (preview && draft)
									acceptFix(preview, useEditorStore.getState().identity, draft.data, (after) =>
										editWithUndo((data) => Object.assign(data, after), t`Change accepted`),
									);
								setPreview(null);
							}}
						>
							<Trans>Accept change</Trans>
						</Button>
					</div>
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

function IssueCard({ issue }: { issue: CheckIssue }) {
	const { fix, ignore, showOnPage } = useCheckActions();
	const locked = useIsResumeLocked();
	return (
		<li data-issue-card={issue.key}>
			<SectionCard>
				<h4 className="type-label">{issue.title}</h4>
				<p className="type-body text-ink-2">{issue.body}</p>
				<div className="flex flex-wrap gap-2">
					<Button variant="secondary" disabled={locked && issue.fix.kind === "apply"} onClick={() => fix(issue)}>
						{issue.fix.kind === "apply" ? <Trans>Preview fix</Trans> : <Trans>Review information</Trans>}
					</Button>
					{issue.target && (
						<Button variant="ghost" onClick={() => showOnPage(issue)}>
							<Trans>Show on page</Trans>
						</Button>
					)}
					<Button variant="ghost" disabled={locked} onClick={() => ignore(issue)}>
						<Trans>Keep as it is</Trans>
					</Button>
				</div>
			</SectionCard>
		</li>
	);
}
