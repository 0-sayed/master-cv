import { buttonVariants } from "./button";
import { CollectionGrid, CollectionGridGroup, SectionCollection } from "./collection-grid";
import { documentCardLayout } from "./document-card-layout";
import { SectionCard, SectionCardEmpty, SectionCardHeader, SectionCardRow } from "./section-card";
import { Skeleton, SkeletonText } from "./skeleton";

export type SkeletonShape =
	| "badge"
	| "control"
	| "rows"
	| "settings"
	| "settings-page"
	| "card"
	| "form"
	| "conversation"
	| "sections"
	| "documents"
	| "document-rows"
	| "board"
	| "insights"
	| "editor"
	| "preview";

type ProfileSectionsSkeletonProps = {
	emptyLabel: string;
	noticeLabel: string;
	noticeHint: string;
};

/** Use localized empty copy for natural wrapping, without reserving fictitious entries. */
export function ProfileSectionsSkeleton({ emptyLabel, noticeLabel, noticeHint }: ProfileSectionsSkeletonProps) {
	return (
		<SectionCollection>
			{Array.from({ length: 5 }, (_, index) => (
				<SectionCard key={index}>
					<SectionCardHeader>
						<Skeleton className="box-content size-4.5 p-2" />
						<Skeleton className="h-lh w-1/2 type-section" />
					</SectionCardHeader>
					<SectionCardEmpty>
						<p>
							<Skeleton as="span" className="text-transparent">
								{index === 4 ? noticeLabel : emptyLabel}
							</Skeleton>
						</p>
						{index === 4 && (
							<p>
								<Skeleton as="span" className="text-transparent">
									{noticeHint}
								</Skeleton>
							</p>
						)}
					</SectionCardEmpty>
					<div className={buttonVariants({ variant: "link", size: "link-compact", className: "justify-start" })}>
						<Skeleton className="h-lh w-1/3" />
					</div>
				</SectionCard>
			))}
		</SectionCollection>
	);
}

/** Shapes share the actual collection/card layout owners, never screen-specific pixel geometry. */
export function SkeletonContent({
	shape = "rows",
	count: requestedCount,
}: {
	shape?: SkeletonShape;
	count?: number | undefined;
}) {
	const count = requestedCount ?? (shape === "settings" ? 1 : 3);
	if (shape === "badge") return <Skeleton as="span" className="inline-block h-6 w-6 rounded-full align-middle" />;
	if (shape === "control") return <Skeleton className="h-11 w-full" />;
	if (shape === "documents")
		return (
			<CollectionGrid>
				{Array.from({ length: count }, (_, index) => (
					<div key={index} className={documentCardLayout.surface({ library: true })}>
						<div className={documentCardLayout.preview({ library: true })}>
							<Skeleton className={documentCardLayout.page({ library: true })} />
						</div>
						<div className={documentCardLayout.details({ library: true })}>
							<div className="grid min-w-0 flex-1 gap-0.5">
								<Skeleton className="h-lh w-3/4 type-label" />
								<Skeleton className="h-lh w-2/3 type-metadata" />
							</div>
							<Skeleton className={buttonVariants({ size: "icon-sm", variant: "ghost" })} />
						</div>
						<Skeleton className={documentCardLayout.action} />
					</div>
				))}
			</CollectionGrid>
		);
	if (shape === "document-rows")
		return (
			<table className="w-full table-fixed border-collapse">
				<thead>
					<tr className={documentCardLayout.row}>
						<th className="h-10" />
					</tr>
				</thead>
				<tbody>
					{Array.from({ length: count }, (_, index) => (
						<tr key={index} className={documentCardLayout.row}>
							<td className={documentCardLayout.cell}>
								<Skeleton className="h-lh w-1/3 type-body" />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		);
	if (shape === "sections") {
		const cards = Array.from({ length: count }, (_, index) => (
			<SectionCard key={index}>
				<SectionCardHeader>
					<Skeleton className="size-9" />
					<Skeleton className="h-6 w-1/2" />
				</SectionCardHeader>
				<SectionCardRow>
					<SkeletonText lines={3} />
				</SectionCardRow>
				<Skeleton className="h-9 w-1/3" />
			</SectionCard>
		));
		return (
			<CollectionGrid variant="sections">
				<div className="grid content-start gap-4">{cards.slice(0, 2)}</div>
				<CollectionGridGroup>
					<div className="grid content-start gap-4">{cards.slice(2, 4)}</div>
					{cards.slice(4)}
				</CollectionGridGroup>
			</CollectionGrid>
		);
	}
	if (shape === "settings-page")
		return (
			<div className="form-content grid gap-6">
				<Skeleton className="h-6 w-1/3" />
				<div className="flex items-center gap-3">
					<Skeleton className="size-16 rounded-full" />
					<div className="flex-1">
						<SkeletonText lines={2} />
					</div>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					{Array.from({ length: 3 }, (_, index) => (
						<div key={index} className={index === 2 ? "sm:col-span-2" : undefined}>
							<SkeletonContent shape="form" count={1} />
						</div>
					))}
				</div>
				<Skeleton className="h-6 w-1/3" />
				<SkeletonContent shape="settings" count={4} />
				<Skeleton className="h-6 w-1/3" />
				<SkeletonContent shape="settings" count={2} />
				<Skeleton className="h-6 w-1/3" />
				<SkeletonContent shape="settings" count={1} />
			</div>
		);
	if (shape === "preview")
		return (
			<div className="skeleton-preview grid aspect-page w-full content-start gap-6 p-8">
				<SkeletonText lines={2} />
				<SkeletonText lines={6} />
				<SkeletonText lines={6} />
			</div>
		);
	if (shape === "editor")
		return (
			<div className="grid h-svh grid-rows-[var(--editor-bar)_minmax(0,1fr)] overflow-hidden bg-bg">
				<div className="flex items-center justify-between gap-4 border-b border-line p-3">
					<Skeleton className="h-9 w-24" />
					<Skeleton className="h-9 w-1/3" />
					<Skeleton className="h-9 w-24" />
				</div>
				<div className="grid min-h-0 lg:grid-cols-[var(--editor-panel)_minmax(0,1fr)]">
					<div className="grid content-start gap-4 overflow-hidden border-e border-line p-4">
						<SkeletonContent shape="form" count={6} />
					</div>
					<div className="bg-canvas hidden overflow-hidden p-6 lg:block">
						<SkeletonContent shape="preview" />
					</div>
				</div>
			</div>
		);
	if (shape === "board")
		return (
			<div className="flex h-full min-h-96 gap-3 overflow-hidden pb-4">
				{Array.from({ length: count }, (_, index) => (
					<div key={index} className="grid w-68 shrink-0 content-start gap-3 rounded-xl bg-sunken p-3">
						<Skeleton className="h-6 w-2/3" />
						<SkeletonContent shape="card" />
						<SkeletonContent shape="card" />
					</div>
				))}
			</div>
		);
	if (shape === "insights")
		return (
			<div className="flex max-w-4xl flex-col gap-4">
				<Skeleton className="h-56 rounded-xl" />
				<div className="grid gap-4 sm:grid-cols-2">
					<Skeleton className="h-26 rounded-xl" />
					<Skeleton className="h-26 rounded-xl" />
				</div>
				<Skeleton className="h-80 rounded-xl" />
			</div>
		);
	if (shape === "card")
		return (
			<SectionCard>
				<Skeleton className="h-6 w-2/3" />
				<SkeletonText />
				<Skeleton className="h-9 w-1/3" />
			</SectionCard>
		);
	if (shape === "form")
		return (
			<div className="grid gap-4">
				{Array.from({ length: count }, (_, index) => (
					<div key={index} className="grid gap-2">
						<Skeleton className="h-4 w-1/3" />
						<Skeleton className="h-11" />
					</div>
				))}
			</div>
		);
	if (shape === "conversation")
		return (
			<div className="grid min-h-40 flex-1 content-start gap-6 p-4">
				<SkeletonText lines={2} />
				<div className="ms-auto w-2/3">
					<SkeletonText />
				</div>
				<SkeletonText lines={4} />
			</div>
		);
	return (
		<div className="grid divide-y divide-line">
			{Array.from({ length: count }, (_, index) => (
				<div key={index} className="flex min-h-14 items-center gap-3 py-3">
					<div className="min-w-0 flex-1">
						<SkeletonText lines={shape === "settings" ? 2 : 1} />
					</div>
					{shape === "settings" && <Skeleton className="h-9 w-24" />}
				</div>
			))}
		</div>
	);
}
