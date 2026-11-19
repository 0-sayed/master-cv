import type { CheckIssue } from "./issues";
import type { PdfFinding } from "@reactive-resume/resume/ats-pdf";
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
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { RadioGroup, RadioGroupItem } from "@reactive-resume/ui/components/radio-group";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { useResumeStore, useIsResumeLocked } from "../../builder/draft";
import { useEditorStore, type ReviewTab } from "../store";
import { useCheckActions, editWithUndo } from "./actions";
import { FindingCard, KeptFindings } from "./check-sections";
import { FindingGroup } from "./finding-group";
import { FindingHelp } from "./finding-help";
import { acceptFix, prepareFix, chooseFix, fixIsValid } from "./fix-preview";
import { getSectionName } from "./issues";
import { pdfFindingKey, pdfFieldTarget } from "./pdf-findings";
import { ReviewDiff } from "./review-diff";
import { groupFindings, prepareIssueFixes, primaryEmailChoice } from "./review-fixes";
import { useCheck } from "./use-check";
import { useReadiness } from "./use-readiness";
import { QuerySkeleton } from "@/components/query-skeleton";
import { getPdfFindingMessage } from "@/features/ats-checker/messages";
/** Each result answers a separate question. Counts describe findings, never hiring likelihood. */
export function ReviewFindings({ tab }: { tab: Extract<ReviewTab, "ats" | "writing"> }) {
	const check = useCheck();
	const filter = useEditorStore((state) => state.reviewFilters[tab]);
	const selected = useEditorStore((state) => state.checkIssue);
	const { restoreIgnored, goToField } = useCheckActions();
	const locked = useIsResumeLocked();
	const { results, pdfReport, requestRetry } = useReadiness();
	const preview = useEditorStore((state) => state.checkFixPreview);
	const setPreview = useEditorStore((state) => state.setCheckFixPreview);
	const [fixedResult, setFixed] = useState<{ checkedAt: string | null; titles: string[] }>({
		checkedAt: null,
		titles: [],
	});
	const [pendingFix, setPendingFix] = useState<string[]>([]);
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
		<div className="grid content-start gap-4">
			<p className="type-meta text-ink-3">{t`Counts show individual findings, including grouped items.`}</p>
			{filter !== "all" && !(tab === "ats" ? visiblePdf : writing).some((finding) => finding.severity === filter) && (
				<p role="status" tabIndex={-1} data-review-empty>
					{t`No findings match this filter.`}
					<Button
						variant="secondary"
						onClick={() => useEditorStore.getState().setReviewFilter(tab, "all")}
					>{t`Show all findings`}</Button>
				</p>
			)}
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
			{tab === "ats" && (
				<div
					className="grid gap-3"
					role="region"
					aria-label={t`PDF readability`}
					data-pdf-bytes-hash={current && pdf.dimension === "pdf" ? pdf.source?.bytesHash : undefined}
				>
					<PdfStateNotice state={pdf.state} onRetry={requestRetry} onStart={() => goToField({ kind: "header" })} />
					{(["blocker", "warning", "tip"] as const).map((severity) => {
						const findings = visiblePdf.filter(
							(finding) => finding.severity === severity && (filter === "all" || filter === severity),
						);
						return (
							<div key={severity} className="grid gap-3">
								{groupFindings(findings, (finding) => finding.code).map((group) => (
									<FindingGroup
										key={group[0].code}
										code={group[0].code}
										count={group.length}
										title={getPdfFindingMessage(group[0].code).title}
										locked={locked}
										selected={group.some((finding) => pdfFindingKey(finding) === selected)}
									>
										{group.map((finding) => (
											<PdfIssueCard key={pdfFindingKey(finding)} finding={finding} grouped={group.length > 1} />
										))}
									</FindingGroup>
								))}
							</div>
						);
					})}
					{pdf.state === "complete" && visiblePdf.length === 0 && (
						<Alert variant="success">
							<Icon name="check-circle" />
							<AlertTitle>
								<span tabIndex={-1} data-review-empty>
									<Trans>No blockers</Trans>
								</span>
							</AlertTitle>
							<AlertDescription>
								<Trans>
									No reading blockers were found in the checked pages. This does not guarantee acceptance by every
									hiring system.
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
				</div>
			)}
			{tab === "writing" && (
				<div className="grid gap-3" aria-label={t`Data check`}>
					{writing.length === 0 && (
						<p role="status" tabIndex={-1} data-review-empty>{t`No data findings in this check.`}</p>
					)}
					{(["warning", "tip"] as const).map((severity) => {
						const issues = writing.filter(
							(entry) => entry.severity === severity && (filter === "all" || filter === severity),
						);
						return (
							<div key={severity} className="grid gap-3">
								{groupFindings(
									issues.map(({ issue }) => issue),
									(issue) => issue.finding.code,
								).map((group) => (
									<FindingGroup
										key={group[0].finding.code}
										code={group[0].finding.code}
										count={group.length}
										title={group[0].title}
										locked={locked}
										selected={group.some((issue) => issue.key === selected)}
										onFixAll={
											group.every((issue) => issue.fix.kind === "apply")
												? () => {
														const identity = useEditorStore.getState().identity;
														const data = useResumeStore.getState().resume?.data;
														if (identity && data && !locked) {
															setPendingFix(group.map((issue) => issue.title));
															setPreview(prepareIssueFixes(identity, data, group));
														}
													}
												: undefined
										}
									>
										{group.map((issue) => (
											<IssueCard
												key={issue.key}
												issue={issue}
												grouped={group.length > 1}
												onFix={() => setPendingFix([issue.title])}
											/>
										))}
									</FindingGroup>
								))}
							</div>
						);
					})}
				</div>
			)}
			<KeptFindings count={ignored.length} fixed={fixed} locked={locked} onRestore={restoreIgnored} />
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
					{preview?.choices.map((choice, index) => (
						<div key={index} className="grid gap-2">
							<ReviewDiff
								change={{
									path: choice.kind === "email" ? ["basics", "email"] : ["title"],
									before: choice.label,
									after: choice.value,
								}}
								before={preview.before}
								after={preview.after}
							/>
							{choice.kind === "email" ? (
								<RadioGroup
									aria-label={t`Primary email`}
									value={choice.value}
									onValueChange={(value) => setPreview(chooseFix(preview, index, String(value)))}
								>
									{choice.options.map((value) => (
										<label key={value} className="flex items-center gap-2 type-body">
											<RadioGroupItem value={value} />
											<bdi dir="ltr">{value}</bdi>
										</label>
									))}
								</RadioGroup>
							) : (
								<NativeSelect
									aria-label={t`Standard heading for ${choice.label}`}
									dir="auto"
									value={choice.value}
									onChange={(event) => setPreview(chooseFix(preview, index, event.target.value))}
								>
									{choice.options.map((value) => (
										<option key={value} value={value}>
											{value}
										</option>
									))}
								</NativeSelect>
							)}
						</div>
					))}
					{preview?.changes
						.filter(
							(change) =>
								!preview.choices.some(
									(choice) =>
										choice.kind === "email" ||
										(choice.kind === "heading" && choice.label === change.before && choice.value === change.after),
								),
						)
						.map((change, index) => (
							<SectionCard key={index}>
								<ReviewDiff change={change} before={preview.before} after={preview.after} />
							</SectionCard>
						))}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setPreview(null)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={locked || !preview || !fixIsValid(preview)}
							onClick={() => {
								const draft = useResumeStore.getState().resume;
								if (preview && draft && !locked) {
									const accepted = acceptFix(preview, useEditorStore.getState().identity, draft.data, (after) =>
										editWithUndo((data) => Object.assign(data, after), t`Change accepted`),
									);
									if (accepted && pendingFix.length) setFixed({ checkedAt, titles: [...fixed, ...pendingFix] });
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

function PdfIssueCard({ finding, grouped }: { finding: PdfFinding; grouped: boolean }) {
	const check = useCheck();
	const locked = useIsResumeLocked();
	const selected = useEditorStore((state) => state.checkIssue);
	const { ignorePdf, goToField, showPdfOnPage } = useCheckActions();
	if (!check) return null;
	const key = pdfFindingKey(finding);
	const message = getPdfFindingMessage(finding.code);
	const target = pdfFieldTarget(finding.code);
	const choice = finding.code === "MULTIPLE_EMAILS" ? primaryEmailChoice(check.data) : undefined;
	const showParser = () => {
		showPdfOnPage(finding);
		useEditorStore.getState().setPageView("parser");
	};
	const locationPage = finding.evidence?.page ?? finding.evidence?.locations?.[0]?.page;
	const wholeDocument = !locationPage;
	const location = wholeDocument
		? t`Applies to the whole document`
		: locationPage
			? t`Page ${locationPage}`
			: t`Location: Whole file`;
	return (
		<div data-issue-card={key}>
			<FindingCard
				grouped={Boolean(grouped)}
				guideCode={finding.code}
				severity={finding.severity}
				title={message.title}
				why={message.why}
				selected={selected === key}
				location={location}
				locationHint={
					!wholeDocument && !finding.evidence?.box && !finding.evidence?.locations?.length
						? t`Approximate area; no precise text box is available.`
						: undefined
				}
				help={
					<FindingHelp
						code={finding.code}
						why={message.why}
						data={check.data}
						documentLocale={check.data.metadata.page.locale}
						proposal={
							choice
								? { path: ["basics", "email"], before: choice.options.join(" · "), after: choice.value }
								: undefined
						}
					/>
				}
				snippet={finding.evidence?.snippet}
			>
				{choice ? (
					<Button
						size="compact"
						disabled={locked}
						onClick={() => {
							const editor = useEditorStore.getState();
							const data = useResumeStore.getState().resume?.data;
							if (editor.identity && data)
								editor.setCheckFixPreview(
									prepareFix(editor.identity, data, (draft) => choice.apply(draft, choice.value), [choice]),
								);
						}}
					>{t`Fix`}</Button>
				) : target && finding.severity !== "tip" ? (
					<Button
						size="compact"
						variant="secondary"
						disabled={locked}
						onClick={() => goToField(target, key)}
					>{t`Go to field`}</Button>
				) : null}
				{!wholeDocument && (
					<Button
						size="compact"
						variant="secondary"
						data-review-action="show"
						onClick={() => showPdfOnPage(finding)}
					>{t`Show location`}</Button>
				)}
				{finding.category === "parseability" && (
					<Button size="compact" variant="link" onClick={showParser}>{t`Show in parsed text`}</Button>
				)}
				{finding.severity !== "blocker" && (
					<Button
						size="compact"
						variant="secondary"
						disabled={locked}
						onClick={() => ignorePdf(key)}
					>{t`Keep as is`}</Button>
				)}
			</FindingCard>
		</div>
	);
}

/** Selects what the canvas shows from the Check panel; mobile Page navigation keeps the selection. */
export function PageViewToggle() {
	const view = useEditorStore((state) => state.pageView);
	const setView = useEditorStore((state) => state.setPageView);
	const options = [
		{ value: "page", label: t`Preview`, description: t`What a person sees`, icon: "file-text" },
		{ value: "parser", label: t`Parsed text`, description: t`What a parser reads`, icon: "brackets-curly" },
	] as const;

	return (
		<SegmentedControl
			aria-label={t`Page view`}
			size="toolbar"
			value={view}
			onValueChange={(value) => {
				if (value === "page" || value === "parser") setView(value);
			}}
		>
			{options.map((option) => (
				<SegmentedControlItem
					key={option.value}
					value={option.value}
					labelOverflow="visible"
					aria-label={`${option.label}: ${option.description}`}
					title={option.description}
				>
					<Icon name={option.icon} size={18} aria-hidden="true" />
					<span>{option.label}</span>
				</SegmentedControlItem>
			))}
		</SegmentedControl>
	);
}

type IssueCardProps = { issue: CheckIssue; onFix: () => void; grouped?: boolean };
function IssueCard({ issue, onFix, grouped }: IssueCardProps) {
	const { fix, ignore, showOnPage } = useCheckActions();
	const locked = useIsResumeLocked();
	const check = useCheck();
	const pageMap = useEditorStore((state) => state.rendered.pageMap);
	const selected = useEditorStore((state) => state.checkIssue);
	if (!check) return null;
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
	const proposal =
		check && issue.fix.kind === "apply"
			? prepareIssueFixes(
					useEditorStore.getState().identity ?? { ownerId: "", resumeId: "", baseRevision: "", editGeneration: 0 },
					check.data,
					[issue],
				)
			: null;
	const canFix = proposal && fixIsValid(proposal);
	const diff = proposal?.changes[0];
	const location = node ? t`Page ${node.page + 1} · ${section}` : t`Section: ${section}`;
	const severity = issue.finding.severity === "info" ? "tip" : "warning";
	return (
		<div data-issue-card={issue.key}>
			<FindingCard
				grouped={Boolean(grouped)}
				guideCode={issue.finding.code}
				selected={selected === issue.key}
				help={
					<FindingHelp
						code={issue.finding.code}
						why={issue.body}
						proposal={diff}
						data={check.data}
						documentLocale={check?.data.metadata.page.locale ?? "en-US"}
					/>
				}
				severity={severity}
				title={issue.title}
				why={issue.body}
				location={location}
				locationHint={t`The section is highlighted if the exact text cannot be located.`}
				snippet={String(issue.finding.params?.value ?? "")}
			>
				{(canFix || (issue.fix.kind === "write" && severity !== "tip")) && (
					<Button
						size="compact"
						variant={issue.fix.kind === "apply" ? "primary" : "secondary"}
						data-review-action="field"
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
					<Button size="compact" variant="secondary" data-review-action="show" onClick={() => showOnPage(issue)}>
						<Trans>Show location</Trans>
					</Button>
				)}
				<Button size="compact" variant="secondary" disabled={locked} onClick={() => ignore(issue)}>
					<Trans>Keep as is</Trans>
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
			<Icon name={state === "failed" || state === "stale" || state === "partial" ? "warning-circle" : "info"} />
			<AlertTitle>{title}</AlertTitle>
			<AlertDescription>
				<p>{description}</p>
				{state === "checking" && <QuerySkeleton count={1} label={description} />}
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
