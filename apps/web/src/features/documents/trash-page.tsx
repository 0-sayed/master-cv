import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { DataTable } from "@reactive-resume/ui/components/data-table";
import { documentCardLayout } from "@reactive-resume/ui/components/document-card-layout";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { useBatchActions } from "./document-actions";
import { DocumentRow } from "./document-card";
import { LibraryError } from "./library-error";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { orpc } from "@/libs/orpc/client";

const noop = () => undefined;

/** Trash: documents stay 30 days, then go for good. Restore, or Delete now after one confirmation. */
export function TrashPage() {
	const {
		data: documents,
		isPending,
		isError,
		isFetching,
		refetch,
	} = useQuery(orpc.documents.list.queryOptions({ input: { trashed: true } }));

	const [selection, setSelection] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);
	const actions = useBatchActions();
	const selected = documents?.filter((document) => selection.has(`${document.type}:${document.id}`)) ?? [];
	const batch = async (action: "restore" | "purge" | "empty") => {
		if (busy) return;
		setBusy(true);
		try {
			if (action === "restore") await actions.restore(selected);
			else await actions.purge(action === "empty" ? (documents ?? []) : selected, action === "empty");
		} finally {
			setBusy(false);
		}
	};
	const skeletonWait1 = useSkeletonLoading(isPending);
	return (
		<div className="contents">
			<PageHeader
				back={
					<BackNavigation render={<Link to="/dashboard" />}>
						<Trans>Back to documents</Trans>
					</BackNavigation>
				}
				title={<Trans>Trash</Trans>}
				description={<Trans>Items are deleted permanently after 30 days.</Trans>}
			/>

			{isError && <LibraryError retrying={isFetching} onRetry={() => void refetch()} />}

			{isError && !documents ? null : skeletonWait1.pending || isPending ? (
				<QuerySkeleton shape="rows" count={6} />
			) : documents?.length === 0 ? (
				<EmptyState
					icon="trash"
					title={<Trans>Trash is empty</Trans>}
					description={<Trans>Items you move here stay for 30 days.</Trans>}
				/>
			) : (
				<div className="grid min-w-0 gap-4" aria-busy={busy || undefined}>
					<ActionGroup responsive="stack">
						<Button variant="secondary" disabled={busy || selected.length === 0} onClick={() => void batch("restore")}>
							<Trans context="trash.bulk.restore">Restore selected</Trans>
						</Button>
						<Button variant="danger" disabled={busy || selected.length === 0} onClick={() => void batch("purge")}>
							<Trans context="trash.bulk.purge">Delete selected forever</Trans>
						</Button>
						<Button variant="secondary" disabled={busy || isError} onClick={() => void batch("empty")}>
							<Trans context="trash.bulk.empty">Empty trash</Trans>
						</Button>
					</ActionGroup>
					<DataTable className={documentCardLayout.trashTable}>
						<caption className="sr-only">
							<Trans>Trash</Trans>
						</caption>
						<thead>
							<tr className="border-b border-line type-metadata text-ink-3">
								<th className="w-10 py-3 ps-3">
									<Checkbox
										aria-label={t({ message: "Select all trash", context: "trash.selection.all" })}
										disabled={busy}
										checked={selected.length === documents?.length}
										indeterminate={selected.length > 0 && selected.length !== documents?.length}
										onCheckedChange={(checked) =>
											setSelection(
												checked ? new Set(documents?.map((document) => `${document.type}:${document.id}`)) : new Set(),
											)
										}
									/>
								</th>
								<th className="px-3 text-start font-medium">
									<Trans>Name</Trans>
								</th>
								<th className="px-3 text-start font-medium whitespace-nowrap">
									<Trans context="trash.retention.heading">Automatic deletion</Trans>
								</th>
								<th className="px-3 text-start font-medium">
									<Trans context="trash.actions.heading">Actions</Trans>
								</th>
							</tr>
						</thead>
						<tbody className={documentCardLayout.trashBody}>
							{documents?.map((document) => (
								<DocumentRow
									key={`${document.type}:${document.id}`}
									document={document}
									disabled={busy}
									selected={selection.has(`${document.type}:${document.id}`)}
									onSelectedChange={(checked) =>
										setSelection((previous) => {
											const next = new Set(previous);
											const key = `${document.type}:${document.id}`;
											if (checked) next.add(key);
											else next.delete(key);
											return next;
										})
									}
									onTags={noop}
									onLink={noop}
								/>
							))}
						</tbody>
					</DataTable>
				</div>
			)}
		</div>
	);
}
