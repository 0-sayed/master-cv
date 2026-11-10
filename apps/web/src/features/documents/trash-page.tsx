import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
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

	const skeletonWait1 = useSkeletonLoading(isPending);
	return (
		<div className="contents">
			<PageHeader
				back={
					<Link
						to="/dashboard"
						className={buttonVariants({ variant: "ghost", size: "sm", className: "-ms-2.5 w-fit gap-1.5 text-ink-2" })}
					>
						<Icon name="arrow-left" size={18} />
						<Trans>Back to documents</Trans>
					</Link>
				}
				title={<Trans>Trash</Trans>}
				description={<Trans>Items are deleted permanently after 30 days.</Trans>}
			/>

			{isError && <LibraryError retrying={isFetching} onRetry={() => void refetch()} />}

			{isError && !documents ? null : skeletonWait1.pending || isPending ? (
				<QuerySkeleton shape="rows" count={6} />
			) : documents?.length === 0 ? (
				<EmptyState>
					<Icon name="trash" size={28} className="text-ink-3" />
					<p className="font-semibold">
						<Trans>Trash is empty</Trans>
					</p>
					<p className="type-body text-ink-2">
						<Trans>Items you move here stay for 30 days.</Trans>
					</p>
				</EmptyState>
			) : (
				<table className="w-full table-fixed border-collapse">
					<caption className="sr-only">
						<Trans>Trash</Trans>
					</caption>
					<thead>
						<tr className="border-b border-line type-metadata font-medium text-ink-3">
							<th className="h-10 ps-3 text-start font-medium">
								<Trans>Name</Trans>
							</th>
							<th className="w-24 px-2 text-start font-medium max-sm:hidden">
								<Trans>Type</Trans>
							</th>
							<th className="w-1/4 px-2 text-start font-medium max-sm:hidden">
								<Trans>Application</Trans>
							</th>
							<th className="w-28 px-2 text-start font-medium max-sm:w-24">
								<Trans>Deleted in</Trans>
							</th>
							<th className="w-12">
								<span className="sr-only">
									<Trans>Options</Trans>
								</span>
							</th>
						</tr>
					</thead>
					<tbody>
						{documents?.map((document) => (
							<DocumentRow key={`${document.type}:${document.id}`} document={document} onTags={noop} onLink={noop} />
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
