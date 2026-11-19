import type { Application } from "../types";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Plural, Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { DataTable, DataTableGroupRow, DataTableSortHeader } from "@reactive-resume/ui/components/data-table";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Input } from "@reactive-resume/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { toast } from "@reactive-resume/ui/components/toast";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { cn } from "@reactive-resume/utils/style";
import { summarizeApplicationGroup } from "../list-summary";
import { describeNextStep, getNextStep } from "../next-step";
import { CLOSED_REASONS, getClosedReasonLabel, getStageColor, getStageLabel, LIST_ORDER, PIPELINE } from "../stages";
import { useInvalidateApplications } from "../use-application-actions";
import { useApplicationGroupCollapse, type ApplicationGroupCollapseState } from "./list-group-collapse";
import { SelectionBar } from "@/components/layout/selection-bar";
import { useNow } from "@/features/career/shared";
import { useConfirm } from "@/hooks/use-confirm";
import { formatInterfaceDate, formatRelativeTime } from "@/libs/locale";
import { orpc } from "@/libs/orpc/client";

type SortKey = "role" | "next" | "updated";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const nextStepTime = (application: Application) => {
	const step = getNextStep(application);
	return step.kind === "interview" || step.kind === "follow-up" ? step.at.getTime() : Number.POSITIVE_INFINITY;
};

const compare: Record<SortKey, (a: Application, b: Application) => number> = {
	role: (a, b) => a.role.localeCompare(b.role) || a.company.localeCompare(b.company),
	next: (a, b) => nextStepTime(a) - nextStepTime(b),
	updated: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
};

const columns = {
	selection: { key: "selection", className: "w-10" },
	role: { key: "role", className: "" },
	next: { key: "next", className: "" },
	stage: { key: "stage", className: "w-36" },
	sent: { key: "sent", className: "" },
	updated: { key: "updated", className: "" },
};

type ListViewProps = {
	collapseState?: ApplicationGroupCollapseState;
	groupBy?: "stage" | null;
	applications: Application[];
	showClosed: boolean;
	onOpen: (application: Application) => void;
};

/**
 * The default view: applications grouped by stage in the order that needs you first (Interview, Offer, Screening,
 * Applied, Saved, then Closed when shown). Groups collapse, headers sort within groups, and row checkboxes select
 * for bulk moves, tags, closing and deleting. Phones get two-line rows.
 */
export function ApplicationList({ applications, showClosed, onOpen, groupBy = "stage", collapseState }: ListViewProps) {
	const { i18n } = useLingui();
	const now = useNow();
	const breakpoint = useBreakpoint();
	const phone = breakpoint === "mobile";
	const showUpdated = breakpoint !== "tablet" && !phone;
	const localCollapseState = useApplicationGroupCollapse();
	const { collapsed, toggleGroup } = collapseState ?? localCollapseState;
	const [sort, setSort] = useState<Sort>({ key: "updated", direction: "desc" });
	const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
	const documents = useQuery({
		...orpc.documents.list.queryOptions({ input: { trashed: false } }),
		enabled: !phone && applications.some((application) => application.resumeId || application.coverLetterId),
	});
	const documentNames = new Map(documents.data?.map((document) => [`${document.type}:${document.id}`, document.name]));

	// Selections only cover what's on screen.
	const checkedIds = applications
		.filter(
			(application) =>
				checked.has(application.id) &&
				(application.status !== "closed" || showClosed) &&
				(groupBy !== "stage" || !collapsed.has(application.status)),
		)
		.map((application) => application.id);
	if (checkedIds.length !== checked.size) setChecked(new Set(checkedIds));

	const groups = useMemo(() => {
		const sign = sort.direction === "asc" ? 1 : -1;
		if (groupBy === null)
			return [
				{
					status: null,
					rows: applications
						.filter((a) => a.status !== "closed" || showClosed)
						.toSorted((a, b) => sign * compare[sort.key](a, b)),
				},
			];
		return LIST_ORDER.filter((status) => status !== "closed" || showClosed)
			.map((status) => ({
				status,
				rows: applications
					.filter((application) => application.status === status)
					.sort((a, b) => sign * compare[sort.key](a, b)),
			}))
			.filter((group) => group.rows.length > 0);
	}, [applications, showClosed, sort, groupBy]);
	const showStage = groupBy !== "stage";
	const visibleColumns = phone
		? [columns.role]
		: [
				columns.selection,
				columns.role,
				columns.next,
				...(showStage ? [columns.stage] : []),
				columns.sent,
				...(showUpdated ? [columns.updated] : []),
			];

	const toggleRow = (id: string) =>
		setChecked((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	const sortBy = (key: SortKey) =>
		setSort((current) =>
			current.key === key
				? { key, direction: current.direction === "asc" ? "desc" : "asc" }
				: { key, direction: key === "updated" ? "desc" : "asc" },
		);

	const header = (key: SortKey, label: string) => (
		<DataTableSortHeader
			direction={sort.key === key ? sort.direction : false}
			onSort={() => sortBy(key)}
			className={cn("px-2 text-start font-medium", columns[key].className)}
		>
			{label}
		</DataTableSortHeader>
	);

	return (
		<div className="grid min-w-0 content-start gap-3">
			<DataTable columns={visibleColumns} className="application-list">
				{!phone && groups.length > 0 && (
					<thead>
						<tr className="border-b border-line type-body text-ink-2">
							<th scope="col" className={cn("ps-3", columns.selection.className)}>
								<span className="sr-only">
									<Trans>Select</Trans>
								</span>
							</th>
							{header("role", t`Role`)}
							{header("next", t`Next step`)}
							{showStage && (
								<th scope="col" className={cn("px-2 text-start font-medium", columns.stage.className)}>
									<Trans>Stage</Trans>
								</th>
							)}
							<th scope="col" className={cn("px-2 text-start font-medium", columns.sent.className)}>
								<Trans>Sent</Trans>
							</th>
							{showUpdated && header("updated", t`Updated`)}
						</tr>
					</thead>
				)}

				{groups.map(({ status, rows }) => {
					const open = status === null || !collapsed.has(status);
					const groupId = `applications-group-${status}`;
					const summary = summarizeApplicationGroup(rows, now);
					const step = summary.upcoming;
					const stepLabel = step?.kind === "interview" ? t`Interview` : t`Follow up`;
					const stepDescription = step?.kind === "follow-up" && step.note ? step.note : stepLabel;
					const stepDate =
						step &&
						formatInterfaceDate(step.at, i18n.locale, {
							weekday: "short",
							...(step.kind === "interview"
								? { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: step.interview.timezone }
								: { day: "numeric", month: "numeric" }),
						});
					return (
						<tbody key={status ?? "ungrouped"} aria-labelledby={status === null ? undefined : groupId}>
							{status !== null && (
								<DataTableGroupRow
									id={groupId}
									labelColumns={phone ? 1 : 2}
									aria-expanded={open}
									title={
										step
											? `${stepDescription} · ${formatInterfaceDate(step.at, i18n.locale, { dateStyle: "full", timeStyle: "short", ...(step.kind === "interview" ? { timeZone: step.interview.timezone } : {}) })}`
											: undefined
									}
									onClick={() => toggleGroup(status)}
									label={
										<>
											<Icon name={open ? "caret-down" : "caret-right"} size={18} className="text-ink-3" />
											<span
												aria-hidden="true"
												className="size-2 rounded-full"
												style={{ background: getStageColor(status) }}
											/>
											{getStageLabel(status)}
											<span className="type-metadata font-mono font-normal text-ink-3">{rows.length}</span>
										</>
									}
								>
									{!phone && (
										<>
											<td>
												{step && (
													<span
														className="flex min-w-0 items-center gap-1.5"
														title={`${stepDescription} · ${stepDate}`}
													>
														<Icon name="calendar-dot" size={16} className="shrink-0" />
														<span dir="auto" className="truncate">
															{stepLabel}
														</span>
														<span aria-hidden="true">·</span>
														<time dateTime={step.at.toISOString()} className="shrink-0">
															{stepDate}
														</time>
													</span>
												)}
											</td>
											<td />
											{showUpdated && (
												<td>{summary.updatedAt && formatRelativeTime(summary.updatedAt, i18n.locale)}</td>
											)}
										</>
									)}
								</DataTableGroupRow>
							)}
							{open &&
								rows.map((application) => (
									<ApplicationRow
										key={application.id}
										application={application}
										resumeName={documentNames.get(`resume:${application.resumeId}`) ?? t`CV`}
										letterName={documentNames.get(`letter:${application.coverLetterId}`) ?? t`Cover letter`}
										phone={phone}
										showStage={showStage}
										showUpdated={showUpdated}
										selected={checked.has(application.id)}
										checked={checked.has(application.id)}
										onCheck={() => toggleRow(application.id)}
										onOpen={() => onOpen(application)}
									/>
								))}
						</tbody>
					);
				})}
			</DataTable>

			{checkedIds.length > 0 && <BulkBar ids={checkedIds} onDone={() => setChecked(new Set())} />}
		</div>
	);
}

type ApplicationRowProps = {
	application: Application;
	resumeName: string;
	letterName: string;
	phone: boolean;
	showStage: boolean;
	showUpdated: boolean;
	selected: boolean;
	checked: boolean;
	onCheck: () => void;
	onOpen: () => void;
};

function ApplicationRow({
	application,
	resumeName,
	letterName,
	phone,
	showStage,
	showUpdated,
	selected,
	checked,
	onCheck,
	onOpen,
}: ApplicationRowProps) {
	const { i18n } = useLingui();
	const next = describeNextStep(getNextStep(application), application, i18n.locale);
	const sent = application.status !== "saved";
	const tone = next.tone === "warn" ? "text-warn-text" : next.tone === "muted" ? "text-ink-3" : "text-ink-2";

	const openButton = (
		<button type="button" onClick={onOpen} className="grid min-w-0 flex-1 text-start after:absolute after:inset-0">
			<span dir="auto" title={application.role} className="truncate font-medium">
				{application.role}
			</span>
			<span
				dir="auto"
				title={[application.company, application.location].filter(Boolean).join(" · ")}
				className="truncate type-metadata text-ink-3"
			>
				{phone
					? `${application.company} · ${next.title}`
					: [application.company, application.location].filter(Boolean).join(" · ")}
			</span>
		</button>
	);

	if (phone) {
		return (
			<tr aria-selected={selected} className={cn("relative border-b border-line", selected && "bg-accent-soft/50")}>
				<td className="py-2.5 ps-1">
					<div className="flex min-w-0 items-center gap-3">
						<Checkbox
							className="relative z-10"
							checked={checked}
							onCheckedChange={onCheck}
							aria-label={t`Select ${application.role} at ${application.company}`}
						/>
						{openButton}
						<Icon name="caret-right" size={20} className="ms-auto shrink-0 text-ink-3" />
					</div>
				</td>
			</tr>
		);
	}

	return (
		<tr
			aria-selected={selected}
			title={next.title}
			className={cn(
				"relative border-b border-line transition-colors duration-quick hover:bg-hover",
				selected && "bg-accent-soft/50",
			)}
		>
			<td className="relative z-10 w-10 ps-3">
				<Checkbox
					checked={checked}
					onCheckedChange={onCheck}
					aria-label={t`Select ${application.role} at ${application.company}`}
				/>
			</td>
			<td className="py-3 pe-2">
				<div className="flex min-w-0 items-center gap-3">{openButton}</div>
			</td>
			<td className="px-2">
				<span className={cn("flex items-center gap-1.5", tone)}>
					<Icon name={next.icon} size={16} className="shrink-0" />
					<span dir="auto" title={next.title} className="truncate">
						{next.title}
					</span>
				</span>
			</td>
			{showStage && (
				<td className="px-2 whitespace-nowrap">
					<span className="flex items-center gap-1.5 text-ink-2">
						<span
							aria-hidden="true"
							className="size-2 rounded-full"
							style={{ background: getStageColor(application.status) }}
						/>
						{getStageLabel(application.status)}
					</span>
				</td>
			)}
			<td className="px-2 whitespace-nowrap">
				{application.resumeId || application.coverLetterId ? (
					<div className="relative z-10 flex items-center gap-1">
						{application.resumeId && (
							<IconButton
								icon="file-text"
								size="icon-sm"
								label={t`Sent CV: ${resumeName}`}
								role="link"
								nativeButton={false}
								render={
									<Link
										to="/builder/$resumeId"
										params={{ resumeId: application.resumeId }}
										search={application.sentResumeVersionId ? { version: application.sentResumeVersionId } : {}}
									/>
								}
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
							/>
						)}
						{application.coverLetterId && (
							<IconButton
								icon="envelope-simple"
								size="icon-sm"
								label={t`Sent cover letter: ${letterName}`}
								role="link"
								nativeButton={false}
								render={
									<Link
										to="/builder/letter/$coverLetterId"
										params={{ coverLetterId: application.coverLetterId }}
										search={
											application.sentCoverLetterVersionId ? { version: application.sentCoverLetterVersionId } : {}
										}
									/>
								}
								onClick={(event) => event.stopPropagation()}
								onKeyDown={(event) => event.stopPropagation()}
							/>
						)}
					</div>
				) : (
					<span className={cn("type-metadata", sent ? "text-warn-text" : "text-ink-3")}>
						<Trans>None</Trans>
					</span>
				)}
			</td>
			{showUpdated && (
				<td className="px-2 type-metadata whitespace-nowrap text-ink-3">
					{formatRelativeTime(application.updatedAt, i18n.locale)}
				</td>
			)}
		</tr>
	);
}

type BulkBarProps = { ids: string[]; onDone: () => void };

/** For the checked rows: move them, tag them, close them with a reason, or delete them (after asking). */
function BulkBar({ ids, onDone }: BulkBarProps) {
	const invalidate = useInvalidateApplications();
	const confirm = useConfirm();
	const [tag, setTag] = useState("");
	const tagId = useId();
	const validation = useSubmitValidation({ [tagId]: !tag.trim() ? t`Enter a tag.` : undefined });

	const bulkUpdate = useMutation({
		...orpc.applications.bulkUpdate.mutationOptions(),
		onSuccess: (result) => {
			invalidate();
			onDone();
			toast.add({ description: t`Updated ${result.updated}` });
		},
		onError: () => toast.add({ type: "error", description: t`Couldn't update the applications. Try again.` }),
	});
	const bulkDelete = useMutation({
		...orpc.applications.bulkDelete.mutationOptions(),
		onSuccess: (result) => {
			invalidate();
			onDone();
			toast.add({ description: t`Deleted ${result.deleted}` });
		},
		onError: () => toast.add({ type: "error", description: t`Couldn't delete the applications. Try again.` }),
	});

	return (
		<SelectionBar count={ids.length} label={t`Selected applications`}>
			<span className="px-2 type-label" aria-live="polite">
				<Plural value={ids.length} one="# selected" other="# selected" />
			</span>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button size="sm" variant="secondary" loading={bulkUpdate.isPending} disabled={bulkUpdate.isPending} />
					}
				>
					<Icon name="arrow-right" size={16} />
					<Trans>Move to…</Trans>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{PIPELINE.map((status) => (
						<DropdownMenuItem key={status} onClick={() => bulkUpdate.mutate({ ids, status })}>
							<span aria-hidden="true" className="size-2 rounded-full" style={{ background: getStageColor(status) }} />
							{getStageLabel(status)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Popover>
				<PopoverTrigger
					render={
						<Button size="sm" variant="secondary" loading={bulkUpdate.isPending} disabled={bulkUpdate.isPending} />
					}
				>
					<Icon name="tag" size={16} />
					<Trans>Add tag</Trans>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-60 p-2">
					<form
						className="grid gap-1.5"
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							if (!validation.validate() || bulkUpdate.isPending) return;
							bulkUpdate.mutate({ ids, addTags: [tag.trim()] });
							setTag("");
						}}
					>
						<Input
							size="sm"
							id={tagId}
							aria-label={t`Tag`}
							aria-required
							aria-invalid={Boolean(validation.errors[tagId])}
							aria-describedby={`${tagId}-error`}
							value={tag}
							onChange={(event) => setTag(event.target.value)}
							autoFocus
						/>
						<FieldError id={`${tagId}-error`}>{validation.errors[tagId]}</FieldError>
						<Button size="sm" type="submit" loading={bulkUpdate.isPending} disabled={bulkUpdate.isPending}>
							<Trans>Add</Trans>
						</Button>
					</form>
				</PopoverContent>
			</Popover>

			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button size="sm" variant="secondary" loading={bulkUpdate.isPending} disabled={bulkUpdate.isPending} />
					}
				>
					<Trans>Close…</Trans>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{CLOSED_REASONS.map((reason) => (
						<DropdownMenuItem
							key={reason}
							onClick={() => bulkUpdate.mutate({ ids, status: "closed", closedReason: reason })}
						>
							{getClosedReasonLabel(reason)}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				size="sm"
				variant="secondary"
				className="text-danger-text"
				loading={bulkDelete.isPending}
				disabled={bulkDelete.isPending}
				onClick={async () => {
					const confirmed = await confirm(t`Delete ${ids.length} applications?`, {
						description: t`They and their timelines are deleted permanently. This can't be undone.`,
						confirmText: t`Delete`,
					});
					if (confirmed) bulkDelete.mutate({ ids });
				}}
			>
				<Trans>Delete…</Trans>
			</Button>

			<Button size="sm" variant="ghost" className="ms-auto" onClick={onDone}>
				<Trans>Clear selection</Trans>
			</Button>
		</SelectionBar>
	);
}
