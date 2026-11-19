import type { VersionSummary } from "./format";
import type { RestoreUndoReceipt } from "@/features/resume/builder/draft";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Button } from "@reactive-resume/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { EditorPanelBody, EditorPanelFooter } from "@reactive-resume/ui/components/editor-panel";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Input } from "@reactive-resume/ui/components/input";
import { toast } from "@reactive-resume/ui/components/toast";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { cn } from "@reactive-resume/utils/style";
import {
	formatVersionMoment,
	formatVersionTime,
	getVersionDetail,
	getVersionTitle,
	groupVersionsByDay,
} from "./format";
import { QuerySkeleton } from "@/components/query-skeleton";
import { savePendingChanges, useCurrentResume, useResumeStore } from "@/features/resume/builder/draft";
import { useExportHistoryScroll } from "@/features/resume/editor/export-history-scroll";
import { useEditorStore } from "@/features/resume/editor/store";
import { useConfirm, usePrompt } from "@/hooks/use-confirm";
import { getResumeErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";

/** A version as History lists it; resumes and letters share it. */
type HistoryVersion = Pick<VersionSummary, "id" | "kind" | "name" | "createdAt">;

/** What History shows and does for one document: its versions, and saving, restoring, renaming and deleting them. */
export type HistorySource = {
	versions: HistoryVersion[] | undefined;
	loading: boolean;
	loadError: boolean;
	retrying: boolean;
	retry: () => void;
	/** Locked documents can't be restored over. */
	locked: boolean;
	/** "The resume as it is", under Now. */
	nowDetail: string;
	/** Saves the current state as a named version. Throws what the request throws. */
	save: (name: string) => Promise<void>;
	/** Restores a version (the current state is kept as "Before restore" first). Throws what the request throws. */
	restore: (versionId: string) => Promise<void>;
	restoreWithUndo?: (versionId: string) => Promise<RestoreUndoReceipt>;
	undoRestore?: (receipt: RestoreUndoReceipt) => Promise<void>;
	rename: (versionId: string, name: string) => Promise<void>;
	remove: (versionId: string) => Promise<void>;
	/** How a failure reads. */
	errorMessage: (error: unknown) => string;
	preparePreview?: () => Promise<void>;
};

/** History for the resume in the editor. */
export function HistoryTab() {
	return <HistoryTimeline source={useResumeHistory()} panel />;
}

function useResumeHistory(): HistorySource {
	const resume = useCurrentResume();
	const queryClient = useQueryClient();
	const listKey = orpc.resume.listVersions.queryKey({ input: { resumeId: resume.id } });
	const {
		data: versions,
		isPending: loading,
		isError: loadError,
		isFetching: retrying,
		refetch,
	} = useQuery(orpc.resume.listVersions.queryOptions({ input: { resumeId: resume.id } }));
	const refresh = () => queryClient.invalidateQueries({ queryKey: listKey });

	return {
		versions,
		loading,
		loadError,
		retrying,
		retry: () => {
			void refetch();
		},
		locked: resume.isLocked,
		nowDetail: t`The resume as it is`,
		errorMessage: getResumeErrorMessage,
		preparePreview: async () => {
			if (!(await savePendingChanges(resume.id)))
				throw new Error(t`Couldn't save your changes. Try again before continuing.`);
		},
		save: async (name) => {
			if (!(await savePendingChanges(resume.id)))
				throw new Error(t`Couldn't save your changes. Try again before continuing.`);
			await orpc.resume.createVersion.call({ resumeId: resume.id, name });
			void refresh();
		},
		restore: async (versionId) => {
			if (!(await savePendingChanges(resume.id)))
				throw new Error(t`Couldn't save your changes. Try again before continuing.`);
			await useResumeStore.getState().restoreVersion(versionId);
			void queryClient.invalidateQueries({ queryKey: orpc.resume.getById.queryKey({ input: { id: resume.id } }) });
			void refresh();
		},
		restoreWithUndo: async (versionId) => {
			const result = await useResumeStore.getState().restoreVersion(versionId);
			const current = useResumeStore.getState();
			if (!current.ownerId) throw new Error(t`The document changed. Try again.`);
			void refresh();
			return {
				ownerId: current.ownerId,
				resumeId: resume.id,
				versionId: result.beforeRestoreVersionId,
				expectedUpdatedAt: result.updatedAt,
				editGeneration: current.editGeneration,
			};
		},
		undoRestore: async (receipt) => {
			await useResumeStore.getState().undoVersionRestore(receipt);
			void refresh();
		},
		rename: async (versionId, name) => {
			await orpc.resume.renameVersion.call({ resumeId: resume.id, versionId, name });
			void refresh();
		},
		remove: async (versionId) => {
			await orpc.resume.deleteVersion.call({ resumeId: resume.id, versionId });
			void refresh();
		},
	};
}

/**
 * History: name the current state, or pick any version to see it on the page, read-only, then restore it or
 * go back to now. Restoring saves the current state as "Before restore" first, so it can be undone.
 */
export function HistoryTimeline({ source, panel = false }: { source: HistorySource; panel?: boolean }) {
	const { i18n } = useLingui();
	const selectedId = useEditorStore((state) => state.historyVersionId);
	const setVersion = useEditorStore((state) => state.setHistoryVersion);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const pending = useRef(false);
	const [error, setError] = useState<string | null>(null);
	const [receipt, setReceipt] = useState<RestoreUndoReceipt | null>(null);
	const [restoredMessage, setRestoredMessage] = useState<string | null>(null);
	const retryAction = useRef<(() => Promise<void>) | null>(null);
	const confirm = useConfirm();
	const { versions, loading } = source;
	const selected = versions?.find((version) => version.id === selectedId) ?? null;
	const when = (version: HistoryVersion) => formatVersionTime(version.createdAt, i18n.locale);
	const Body = panel ? EditorPanelBody : "div";
	const scroll = useExportHistoryScroll("history");
	const phone = useBreakpoint() === "mobile";
	const Footer = panel ? EditorPanelFooter : "div";
	const run = async (action: () => Promise<void>) => {
		if (pending.current) return;
		pending.current = true;
		setBusy(true);
		setError(null);
		retryAction.current = action;
		try {
			await action();
		} catch (error) {
			const message = source.errorMessage(error);
			setError(message);
			toast.add({ type: "error", description: message });
		} finally {
			pending.current = false;
			setBusy(false);
		}
	};
	const save = () => {
		const trimmed = name.trim();
		if (!trimmed || trimmed.length > 80) return;
		void run(async () => {
			await source.save(trimmed);
			setName("");
			toast.add({ description: t`Saved “${trimmed}”` });
		});
	};
	const restore = (version: HistoryVersion) =>
		void run(async () => {
			const title = getVersionTitle(version);
			const moment = formatVersionMoment(version.createdAt, i18n.locale);
			if (
				!(await confirm(t`Restore “${title}” from ${moment}?`, {
					description: t`Your current work is kept as “Before restore”. Sent snapshots stay unchanged.`,
					confirmText: t`Restore`,
					cancelText: t`Cancel`,
					variant: "primary",
				}))
			)
				return;
			if (source.restoreWithUndo && source.undoRestore) setReceipt(await source.restoreWithUndo(version.id));
			else {
				await source.restore(version.id);
				setReceipt(null);
			}
			setVersion(null);
			setRestoredMessage(t`Restored the version from ${moment}. Your previous state is saved as “Before restore”.`);
		});
	return (
		<>
			<Body {...(panel ? scroll : {})}>
				<div className="grid gap-6">
					<form
						className="flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							save();
						}}
					>
						<Input
							dir="auto"
							value={name}
							maxLength={80}
							aria-label={t`Name this version`}
							placeholder={t`Version name, e.g. Application draft`}
							onChange={(event) => setName(event.target.value)}
						/>
						<Button type="submit" variant="secondary" disabled={!name.trim() || busy || source.locked}>
							<Trans>Save</Trans>
						</Button>
					</form>
					{source.loadError && (
						<Alert variant="error">
							<Icon name="warning-circle" />
							<AlertTitle>
								<Trans>Couldn't load version history</Trans>
							</AlertTitle>
							<AlertDescription>
								<Trans>Your CV is preserved. Check your connection and try again.</Trans>
							</AlertDescription>
							<AlertActions>
								<Button variant="secondary" disabled={source.retrying} loading={source.retrying} onClick={source.retry}>
									{source.retrying ? <Trans>Retrying…</Trans> : <Trans>Try again</Trans>}
								</Button>
							</AlertActions>
						</Alert>
					)}
					{(!source.loadError || versions !== undefined) && (
						<QuerySkeleton loading={loading && !versions} shape="rows">
							<ol className="grid gap-3" aria-label={t`Versions`}>
								<TimelineItem
									title={t({ message: "Current version", context: "editor.history.currentVersion" })}
									detail={source.nowDetail}
									selected={selectedId === null}
									disabled={busy}
									current
									last
									onSelect={() => setVersion(null)}
								/>
								{groupVersionsByDay(versions ?? [], i18n.locale).map((group) => (
									<li key={group.key} className="grid gap-2">
										<h3 className="type-label text-ink-2">
											{group.label}
											<span className="sr-only"> · {group.dateLabel}</span>
										</h3>
										<ol className="grid">
											{group.versions.map((version, index) => (
												<TimelineItem
													key={version.id}
													title={getVersionTitle(version)}
													detail={`${when(version)} · ${getVersionDetail(version)}`}
													named={version.kind === "named"}
													selected={version.id === selectedId}
													disabled={busy}
													last={index === group.versions.length - 1}
													onSelect={() =>
														void run(async () => {
															await source.preparePreview?.();
															setVersion(version.id);
														})
													}
													menu={
														version.kind === "named" ? (
															<NamedVersionMenu version={version} source={source} disabled={busy} />
														) : null
													}
												/>
											))}
										</ol>
									</li>
								))}
							</ol>
						</QuerySkeleton>
					)}
					{!loading && !source.loadError && versions?.length === 0 && (
						<p className="type-body text-ink-2">
							<Trans>No saved versions yet. An editing session adds one automatically.</Trans>
						</p>
					)}
					{!loading && !source.loadError && versions?.length === 1 && (
						<p className="type-body text-ink-2">
							<Trans>Only one version so far. Every editing session adds one automatically.</Trans>
						</p>
					)}
					<p className="type-caption text-ink-2">
						<Trans>
							Autosaves are grouped by session and kept for 90 days. Named versions are kept until you delete them.
							Restoring saves the current state first.
						</Trans>
					</p>
				</div>
			</Body>
			<Footer>
				<div className="grid gap-3">
					{error && (
						<Alert variant="error">
							<Icon name="warning-circle" />
							<AlertTitle>
								<Trans>Could not update version history</Trans>
							</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
							<AlertActions>
								<Button
									variant="secondary"
									disabled={busy}
									onClick={() => {
										if (retryAction.current) void run(retryAction.current);
									}}
								>
									<Trans>Try again</Trans>
								</Button>
								<Button variant="secondary" onClick={() => setVersion(null)}>
									<Trans>Back to current</Trans>
								</Button>
							</AlertActions>
						</Alert>
					)}
					{restoredMessage && (
						<p role="status" className="type-body text-ink-2">
							{restoredMessage}
						</p>
					)}
					{receipt && source.undoRestore && (
						<Button
							variant="secondary"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									await source.undoRestore?.(receipt);
									setReceipt(null);
									setRestoredMessage(t`Your previous work is restored.`);
								})
							}
						>
							<Trans>Undo restore</Trans>
						</Button>
					)}
					{selected && (
						<>
							<div role="status" className="grid gap-2 type-body">
								<span dir="auto" className="type-label">
									{getVersionTitle(selected)}
								</span>
								<span className="type-caption text-ink-2">
									<Trans>Viewing {when(selected)} · read-only</Trans>
								</span>
							</div>
							<Button disabled={source.locked || busy} onClick={() => restore(selected)}>
								<Trans>Restore this version</Trans>
							</Button>
							{panel && phone && (
								<Button
									id="export-preview-history"
									variant="secondary"
									disabled={busy}
									onClick={() => useEditorStore.getState().setExportHistoryPreview(true)}
								>
									<Icon name="eye" />
									<Trans>Preview version</Trans>
								</Button>
							)}
							<BackNavigation disabled={busy} onClick={() => setVersion(null)}>
								<Trans>Back to current</Trans>
							</BackNavigation>
						</>
					)}
				</div>
			</Footer>
		</>
	);
}

type TimelineItemProps = {
	title: string;
	detail: string;
	selected: boolean;
	last: boolean;
	onSelect: () => void;
	disabled: boolean;
	current?: boolean;
	named?: boolean;
	menu?: React.ReactNode;
};

function TimelineItem({ title, detail, selected, last, onSelect, disabled, current, named, menu }: TimelineItemProps) {
	return (
		<li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
			<span aria-hidden="true" className="flex w-5 flex-col items-center">
				<span
					className={cn(
						"mt-4 size-2.5 shrink-0 rounded-full ring-3 ring-raised",
						current ? "bg-accent" : selected ? "bg-ink" : "bg-line-2",
					)}
				/>
				{!last && <span className="w-px flex-1 bg-line" />}
			</span>
			<span
				className={cn(
					"group/version my-0.5 flex items-start rounded-md border transition-colors duration-quick",
					selected ? "border-line-2 bg-sunken" : "border-transparent hover:bg-hover",
				)}
			>
				<Button
					variant="secondary"
					size="row"
					type="button"
					aria-pressed={selected}
					disabled={disabled}
					onClick={onSelect}
					className="min-w-0 flex-1 flex-col items-start gap-1 text-start"
				>
					<span className="flex max-w-full min-w-0 items-center gap-2">
						<span dir="auto" className="min-w-0 type-label break-words">
							{title}
						</span>
						{named && <Icon name="bookmark-simple" size={14} className="text-accent-text" />}
					</span>
					<span className="type-caption text-ink-2">{detail}</span>
				</Button>
				{menu && <span className="p-1">{menu}</span>}
			</span>
		</li>
	);
}

/** Named versions are the user's own: they can be renamed or deleted. The rest expire on their own. */
type NamedVersionMenuProps = { version: HistoryVersion; source: HistorySource; disabled: boolean };

function NamedVersionMenu({ version, source, disabled }: NamedVersionMenuProps) {
	const prompt = usePrompt();
	const confirm = useConfirm();
	const selectedId = useEditorStore((state) => state.historyVersionId);
	const setVersion = useEditorStore((state) => state.setHistoryVersion);
	const title = getVersionTitle(version);
	const failed = (error: unknown) => toast.add({ type: "error", description: source.errorMessage(error) });

	const rename = async () => {
		const name = (await prompt(t`Rename version`, { defaultValue: version.name ?? "" }))?.trim();
		if (!name || name === version.name) return;
		await source.rename(version.id, name).catch(failed);
	};

	const remove = async () => {
		const confirmed = await confirm(t`Delete “${title}”?`, {
			description: t`Named versions are kept until you delete them. This can't be undone.`,
			confirmText: t`Delete`,
			variant: "danger",
		});
		if (!confirmed) return;
		try {
			await source.remove(version.id);
			if (selectedId === version.id) setVersion(null);
			toast.add({ description: t`Deleted “${title}”` });
		} catch (error) {
			failed(error);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled}
				render={<IconButton icon="dots-three" label={t`Options for ${title}`} size="icon-sm" className="text-ink-2" />}
			/>
			<DropdownMenuContent align="end" className="w-44">
				<DropdownMenuItem onClick={() => void rename()}>
					<Icon name="pencil-simple" />
					<Trans>Rename…</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem variant="destructive" onClick={() => void remove()}>
					<Icon name="trash" />
					<Trans>Delete</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
