import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { ReviewLaunch, ReviewNotice, ReviewOperationPanel } from "../editor/proposals/review-operation";
import { useVariantsCopy } from "./copy.generated";
import { TranslationReview } from "./translation-review";
import { PageHeader } from "@/components/layout/page-header";
import { QuerySkeleton } from "@/components/query-skeleton";
import { client, orpc } from "@/libs/orpc/client";
export function LanguageVersions({ resumeId }: { resumeId: string }) {
	const copy = useVariantsCopy();
	const family = useQuery(orpc.resume.variants.list.queryOptions({ input: { resumeId } }));
	const base = family.data?.find((cv) => cv.variantKind === "base");
	const language = family.data?.find((cv) => cv.variantKind === "language");
	const create = useMutation({
		mutationFn: () => {
			if (!base) throw new Error("SOURCE_UNAVAILABLE");
			return client.resume.variants.create({
				sourceResumeId: base.resumeId,
				expectedUpdatedAt: base.updatedAt,
				variantKind: "language",
				targetLocale: base.documentLocale === "ar-SA" ? "en-US" : "ar-SA",
				requestKey: crypto.randomUUID(),
			});
		},
		onSuccess: () => {
			void family.refetch();
		},
	});
	return (
		<>
			<PageHeader
				title={copy("language.copies.title")}
				description={copy("language.interface.independenceHint")}
				back={
					<Link to="/dashboard">
						<Trans>My documents</Trans>
					</Link>
				}
			/>
			{family.error ? (
				<ReviewNotice retry={() => void family.refetch()}>
					<Trans>Could not load language versions.</Trans>
				</ReviewNotice>
			) : family.isPending ? (
				<QuerySkeleton shape="rows" />
			) : (
				<>
					{family.data
						?.filter((cv) => cv.variantKind !== "job")
						.map((cv) => (
							<VersionCard key={cv.resumeId} document={cv} onSaved={() => void family.refetch()} />
						))}
					{!language && (
						<Button disabled={!base || create.isPending} onClick={() => create.mutate()}>
							<Trans>Create language copy</Trans>
						</Button>
					)}
					{create.error && (
						<ReviewNotice retry={() => create.reset()}>
							<Trans>Could not create the language copy. Check the included allowance and source.</Trans>
						</ReviewNotice>
					)}
				</>
			)}
		</>
	);
}
type Document = {
	resumeId: string;
	name: string;
	variantKind: "base" | "job" | "language";
	sourceResumeId: string | null;
	documentLocale: string;
	targetLocale: "ar-SA" | "en-US" | null;
	updatedAt: string;
	operationId: string | null;
};
function VersionCard({ document, onSaved }: { document: Document; onSaved: () => void }) {
	const copy = useVariantsCopy();
	const [started, setStarted] = useState<string | null>(null);
	const source = useQuery({
		...orpc.resume.getById.queryOptions({ input: { id: document.sourceResumeId ?? document.resumeId } }),
		enabled: document.variantKind === "language",
	});
	const actual = useQuery(orpc.resume.getById.queryOptions({ input: { id: document.resumeId } }));
	const freshness = useQuery({
		...orpc.resume.variants.freshness.queryOptions({ input: { resumeId: document.resumeId } }),
		enabled: document.variantKind !== "base",
	});
	const operationId = started ?? document.operationId;
	return (
		<SectionCard>
			<h2 className="type-section" dir="auto">
				{document.name}
			</h2>
			<p>
				{document.documentLocale} ·{" "}
				{document.variantKind === "base" ? <Trans>Original</Trans> : <Trans>Language copy</Trans>}
			</p>
			{actual.data && (
				<div dir="auto" className="grid gap-2">
					<p>{actual.data.data.basics.headline}</p>
					<p>{actual.data.data.summary.content.replace(/<[^>]*>/gu, " ")}</p>
				</div>
			)}
			{actual.error && (
				<ReviewNotice retry={() => void actual.refetch()}>
					<Trans>Could not load the saved preview.</Trans>
				</ReviewNotice>
			)}
			<Link to="/builder/$resumeId" params={{ resumeId: document.resumeId }}>
				<Trans>Open saved CV</Trans>
			</Link>
			{document.variantKind === "language" && (
				<>
					<p role="status">
						{freshness.data?.reviewState === "accepted" ? (
							<Trans>Reviewed translation saved</Trans>
						) : (
							copy("language.translation.status.pending")
						)}
					</p>
					{freshness.data && freshness.data.state !== "current" && (
						<ReviewNotice retry={() => void freshness.refetch()}>
							<Trans>The source changed or is unavailable. Update deliberately; saved copies stay independent.</Trans>
						</ReviewNotice>
					)}
					{freshness.error && (
						<ReviewNotice retry={() => void freshness.refetch()}>
							<Trans>Could not check the source revision.</Trans>
						</ReviewNotice>
					)}
					{source.data && actual.data && (
						<ReviewLaunch
							kind="review.translation"
							prepare={() =>
								client.ai.variantReview.prepare({
									kind: "review.translation",
									resumeId: document.resumeId,
									expectedUpdatedAt: actual.data.updatedAt.toISOString(),
									expectedSourceRevision: source.data.updatedAt.toISOString(),
								})
							}
							onStarted={setStarted}
						>
							{copy("language.translation.review")}
						</ReviewLaunch>
					)}
					{operationId && (
						<ReviewOperationPanel operationId={operationId}>
							<TranslationReview
								operationId={operationId}
								onSaved={() => {
									void actual.refetch();
									void freshness.refetch();
									onSaved();
								}}
							/>
						</ReviewOperationPanel>
					)}
				</>
			)}
		</SectionCard>
	);
}
