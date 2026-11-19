import type { Application } from "../types";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, AlertActions, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@reactive-resume/ui/components/collapsible";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { SkeletonContent } from "@reactive-resume/ui/components/skeleton-content";
import { toast } from "@reactive-resume/ui/components/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { computeApplicationInsights } from "../insights";
import { insightCopy } from "../insights-copy";
import { exportFunnelPng } from "../insights-export";
import { getClosedReasonLabel, getStageLabel } from "../stages";
import { InsightBar, InsightDataTable } from "./insight-chart";
import { useNow } from "@/features/career/shared";
import { orpc } from "@/libs/orpc/client";

export function InsightsSkeleton() {
	return <SkeletonContent shape="insights" />;
}
function ChartCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
	return (
		<SectionCard aria-labelledby={id}>
			<SectionCardTitle as="h2" id={id}>
				{title}
			</SectionCardTitle>
			{children}
		</SectionCard>
	);
}

export function ApplicationInsights({ applications }: { applications: Application[] }) {
	const { i18n } = useLingui();
	const now = useNow();
	const [exporting, setExporting] = useState(false);
	const [exportFailed, setExportFailed] = useState(false);
	const exportInFlight = useRef(false);
	const documentsQuery = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const { data: documents } = documentsQuery;
	const data = computeApplicationInsights(applications, documents, now);
	const copy = (key: keyof typeof insightCopy, values?: Record<string, string | number>) =>
		i18n._({ ...insightCopy[key], ...(values ? { values } : {}) });
	const locale = i18n.locale === "ar-SA" ? "ar-SA" : "en-US";
	const coverage = copy("datedReplies", { count: data.datedReplies, dated: String(data.datedReplies) });
	const funnel = data.funnel.map((row) => ({ ...row, label: getStageLabel(row.status) }));
	const sources = data.sources.all.map((row) => ({
		...row,
		label: row.kind === "missing" ? copy("missing") : row.label,
	}));
	const outcomes = data.interviewOutcomes
		.filter((row) => row.count)
		.map((row) => ({
			...row,
			label:
				row.outcome === "interview" || row.outcome === "offer"
					? getStageLabel(row.outcome)
					: row.outcome === "unknown"
						? copy("unknown")
						: getClosedReasonLabel(row.outcome as Parameters<typeof getClosedReasonLabel>[0]),
		}));
	const weekLabel = (start: Date) =>
		`${formatUiTimestamp(start, locale, { day: "numeric" })}/${formatUiTimestamp(start, locale, { month: "numeric" })}`;
	const weeks = data.weeks.map((row) => ({
		...row,
		label: formatUiTimestamp(row.start, locale, { day: "numeric", month: "long", year: "numeric" }),
	}));
	const periodSent = data.weeks.reduce((sum, row) => sum + row.count, 0);
	const maxWeek = Math.max(1, ...weeks.map((row) => row.count));
	const maxSource = Math.max(1, ...sources.map((row) => row.count), ...data.sources.rows.map((row) => row.count));
	const comparison = data.comparison;
	const groups = comparison
		? [
				{ label: copy("tailored"), count: comparison.tailored.replied, denominator: comparison.tailored.sent },
				{ label: copy("base"), count: comparison.base.replied, denominator: comparison.base.sent },
			]
		: [];
	const comparisonReady = !!comparison && comparison.tailored.sent >= 5 && comparison.base.sent >= 5;
	const download = async () => {
		if (exportInFlight.current) return;
		exportInFlight.current = true;
		setExporting(true);
		setExportFailed(false);
		try {
			await exportFunnelPng({
				rows: funnel.map((row) => ({ ...row, percentage: row.percentage ?? 0 })),
				sent: data.sent,
				asOf: now,
				locale,
			});
			toast.add({ type: "success", description: copy("exported") });
		} catch {
			setExportFailed(true);
		} finally {
			exportInFlight.current = false;
			setExporting(false);
		}
	};
	if (data.tracked < 5)
		return <EmptyState icon="chart-line-up" title={copy("emptyTitle")} description={copy("empty")} />;
	return (
		<div className="grid gap-4">
			<dl data-slot="insights-summary" className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-3">
				<div className="grid min-w-0 content-start gap-2 text-start">
					<dt className="type-body text-ink-2">{copy("sent")}</dt>
					<dd className="grid min-w-0 gap-2 text-start">
						<bdi dir="ltr" className="justify-self-start type-title tabular-nums">
							{data.sent}
						</bdi>
						<p className="type-metadata text-ink-3">{copy("tracked", { count: data.tracked })}</p>
					</dd>
				</div>
				<div className="grid min-w-0 content-start gap-2 text-start">
					<dt className="type-body text-ink-2">{copy("reply")}</dt>
					<dd className="grid min-w-0 gap-2 text-start">
						<bdi dir="ltr" className="justify-self-start type-title tabular-nums">
							{data.sent >= 5 ? `${Math.round((data.replied / data.sent) * 100)}%` : "—"}
						</bdi>
						<p className="type-metadata text-ink-3">
							<bdi dir="ltr">
								{data.replied} / {data.sent}
							</bdi>
						</p>
						{data.sent < 5 && (
							<p className="type-metadata text-ink-3">{data.sent ? copy("sample") : copy("noSends")}</p>
						)}
					</dd>
				</div>
				<div className="grid min-w-0 content-start gap-2 text-start">
					<dt className="type-body text-ink-2">{copy("median")}</dt>
					<dd className="grid min-w-0 gap-2 text-start">
						<bdi dir="auto" className="justify-self-start type-title tabular-nums">
							{data.datedReplies >= 5 && data.medianDays !== null
								? copy("days", { count: Math.round(data.medianDays * 10) / 10 })
								: "—"}
						</bdi>
						<p className="type-metadata text-ink-3">
							<bdi dir="auto">{coverage}</bdi>
							{data.omittedDurations > 0 && (
								<>
									{" "}
									· <bdi dir="ltr">{data.omittedDurations}</bdi> {copy("missingDates")}
								</>
							)}
						</p>
						{data.datedReplies < 5 && <p className="type-metadata text-ink-3">{copy("medianSample")}</p>}
					</dd>
				</div>
			</dl>
			<div className="insights-grid">
				<ChartCard id="insights-funnel" title={copy("funnel")}>
					<p className="type-metadata text-ink-3">
						{copy("sent")}: <bdi dir="ltr">{data.sent}</bdi>
					</p>
					<ol className="grid gap-4">
						{funnel.map((row) => (
							<InsightBar key={row.status} {...row} maximum={data.sent} />
						))}
					</ol>
					{data.sent < 5 && <p className="type-metadata text-ink-3">{copy("sample")}</p>}
					<Button variant="secondary" loading={exporting} onClick={() => void download()}>
						<Icon name="download-simple" />
						{copy("export")}
					</Button>
					{exportFailed && (
						<Alert variant="error">
							<Icon name="warning" />
							<AlertTitle>{copy("exportError")}</AlertTitle>
							<AlertActions>
								<Button variant="secondary" onClick={() => void download()}>
									{copy("retry")}
								</Button>
							</AlertActions>
						</Alert>
					)}
				</ChartCard>
				<ChartCard id="insights-weeks" title={copy("weekly")}>
					<p className="type-metadata text-ink-3">{copy("period", { count: periodSent })}</p>
					<div dir="ltr" className="grid grid-cols-8 items-end gap-1">
						{weeks.map((row) => (
							<TooltipProvider key={row.start.toISOString()}>
								<Tooltip>
									<TooltipTrigger data-slot="insight-week" className="grid min-w-0 gap-2 text-center type-metadata">
										<span className="flex h-40 flex-col justify-end gap-1">
											<span className="tabular-nums">{row.count}</span>
											<span className="type-metadata text-ink-3">
												{row.percentage === null ? "—" : `${Math.round(row.percentage)}%`}
											</span>
											<span
												aria-hidden="true"
												className="block shrink-0 rounded-t bg-ink-3"
												style={{ height: `${(row.count / maxWeek) * 65}%` }}
											/>
										</span>
										<span className="tabular-nums">{weekLabel(row.start)}</span>
									</TooltipTrigger>
									<TooltipContent>
										{row.label}
										<bdi dir="ltr">
											{row.count} / {row.denominator}
										</bdi>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						))}
					</div>
					<p className="type-metadata text-ink-3">
						{data.weeks[7] && weekLabel(data.weeks[7].start)} · {copy("current")}
					</p>
					{periodSent < 5 && (
						<p className="type-metadata text-ink-3">{periodSent ? copy("sample") : copy("noWeeks")}</p>
					)}
				</ChartCard>
				<ChartCard id="insights-sources" title={copy("sources")}>
					<p className="type-metadata text-ink-3">
						{copy("tracked", { count: data.tracked })} · {copy("highest")}
					</p>
					<ul className="grid gap-4">
						{data.sources.rows.map((row, index) => (
							<InsightBar
								key={`${row.kind}-${row.label}`}
								{...row}
								label={row.kind === "other" ? copy("other") : row.label}
								maximum={maxSource}
								highlight={index === 0}
							/>
						))}
					</ul>
					{data.sources.other.length > 0 && (
						<Collapsible>
							<CollapsibleTrigger variant="heading">{copy("other")}</CollapsibleTrigger>
							<CollapsibleContent>
								<ul className="grid gap-4 pt-3">
									{data.sources.other.map((row) => (
										<InsightBar key={row.label} {...row} maximum={maxSource} />
									))}
								</ul>
							</CollapsibleContent>
						</Collapsible>
					)}
					{data.sources.missing && (
						<>
							<ul>
								<InsightBar {...data.sources.missing} label={copy("missing")} maximum={maxSource} />
							</ul>
							<Button variant="link" render={<a href="/dashboard/applications?view=list" />}>
								{copy("correct")}
							</Button>
						</>
					)}
				</ChartCard>
				<div className="grid content-start gap-4">
					<ChartCard id="insights-outcomes" title={copy("outcomes")}>
						<p className="type-metadata text-ink-3">{copy("interviewed", { count: data.interviewed })}</p>
						{outcomes.length ? (
							<ul className="grid divide-y divide-line">
								{outcomes.map((row) => (
									<li key={row.outcome} className="flex justify-between gap-3 py-2 type-body">
										<span>{row.label}</span>
										<bdi dir="ltr" className="shrink-0 tabular-nums">
											{row.count} / {row.denominator}
											{data.interviewed >= 5 && ` · ${Math.round(row.percentage ?? 0)}%`}
										</bdi>
									</li>
								))}
							</ul>
						) : (
							<p className="type-body text-ink-3">{copy("noInterviews")}</p>
						)}
						{data.interviewed > 0 && data.interviewed < 5 && (
							<p className="type-metadata text-ink-3">{copy("sample")}</p>
						)}
					</ChartCard>
					<ChartCard id="insights-comparison" title={copy("comparison")}>
						{documentsQuery.isError && (
							<Alert variant="warn">
								<Icon name="warning" />
								<AlertTitle>{copy("documentError")}</AlertTitle>
								<AlertDescription>{copy("documentHint")}</AlertDescription>
								<AlertActions>
									<Button
										variant="secondary"
										loading={documentsQuery.isFetching}
										onClick={() => void documentsQuery.refetch()}
									>
										{copy("retry")}
									</Button>
								</AlertActions>
							</Alert>
						)}
						{comparison ? (
							<>
								{comparisonReady ? (
									<ul className="grid gap-4">
										{groups.map((row) => (
											<InsightBar key={row.label} {...row} maximum={row.denominator} />
										))}
									</ul>
								) : (
									<>
										<ul className="grid gap-2">
											{groups.map((row) => (
												<li key={row.label} className="flex justify-between gap-3 type-body">
													<span>{row.label}</span>
													<bdi dir="ltr">
														{row.count} / {row.denominator}
													</bdi>
												</li>
											))}
										</ul>
										<p className="type-metadata text-ink-3">{copy("comparisonSample")}</p>
									</>
								)}
								<p className="type-metadata text-ink-3">{copy("excluded", { count: comparison.excluded })}</p>
								<p className="type-metadata text-ink-3">{copy("noncausal")}</p>
							</>
						) : !documentsQuery.isError ? (
							<p role="status" className="type-body text-ink-3">
								{copy("loadingDocuments")}
							</p>
						) : null}
					</ChartCard>
				</div>
			</div>
			<Collapsible>
				<CollapsibleTrigger variant="heading">{copy("method")}</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="grid min-w-0 gap-4 pt-3">
						<p className="type-body text-ink-2">{copy("methodText")}</p>
						<InsightDataTable caption={copy("funnel")} rows={funnel} />
						<InsightDataTable caption={copy("weekly")} rows={weeks} />
						<InsightDataTable caption={copy("sources")} rows={sources} />
						<InsightDataTable caption={copy("outcomes")} rows={outcomes} />
						{comparison && <InsightDataTable caption={copy("comparison")} rows={groups} />}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
