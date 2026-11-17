import type { ResumeThumbnailSize } from "@/features/resume/preview/resume-thumbnail.shared";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { QueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";
import { useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { documentCardLayout } from "@reactive-resume/ui/components/document-card-layout";
import { PreviewPlaceholder } from "@reactive-resume/ui/components/preview-placeholder";
import { Skeleton, useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { cn } from "@reactive-resume/utils/style";
import { QuerySkeleton } from "@/components/query-skeleton";
import { getTemplateImageUrl } from "@/dialogs/resume/template/data";
import { createResumePdfBlob } from "@/features/resume/export/pdf-document";
import { createPdfFirstPageImageUrl, releaseThumbnailUrls } from "@/features/resume/preview/pdf-thumbnail";
import {
	getResumeThumbnailCacheKey,
	getResumeThumbnailSize,
	hasResumePreviewContent,
} from "@/features/resume/preview/resume-thumbnail.shared";
import { orpc } from "@/libs/orpc/client";

type ThumbnailState = { status: "error" | "idle" | "loading" } | { status: "ready"; url: string };

type ResumeThumbnailProps = {
	resume: { id: string; updatedAt: Date };
};

const throwIfAborted = (signal: AbortSignal) => {
	if (signal.aborted) throw new DOMException("Thumbnail generation aborted.", "AbortError");
};

const THUMBNAIL_CACHE_TIME = 5 * 60 * 1000;
const createResumeThumbnailUrl = async (data: ResumeData, size: ResumeThumbnailSize, signal: AbortSignal) => {
	const pdf = await createResumePdfBlob(data);
	throwIfAborted(signal);

	const url = await createPdfFirstPageImageUrl(pdf, size, signal);

	if (signal.aborted) {
		URL.revokeObjectURL(url);
		throwIfAborted(signal);
	}

	return url;
};

function useThumbnailSize(containerRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
	const [size, setSize] = useState<ResumeThumbnailSize>({ width: 0, height: 0 });

	useEffect(() => {
		const container = containerRef.current;
		if (!enabled || !container) return;
		let measured = { width: container.clientWidth, height: container.clientHeight };
		let timeout: ReturnType<typeof setTimeout>;
		let media: MediaQueryList;
		const syncSize = () => {
			clearTimeout(timeout);
			// Coalesce continuous resizing (window drags, zoom, the grid reflowing).
			timeout = setTimeout(() => {
				if (measured.width <= 0 || measured.height <= 0) return;
				const next = getResumeThumbnailSize(measured, window.devicePixelRatio);
				setSize((current) => {
					if (current.width >= next.width && current.height >= next.height) return current;
					return { width: Math.max(current.width, next.width), height: Math.max(current.height, next.height) };
				});
			}, 150);
		};
		const watchPixelRatio = () => {
			media?.removeEventListener("change", watchPixelRatio);
			media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			media.addEventListener("change", watchPixelRatio);
			syncSize();
		};
		const observer = new ResizeObserver((entries) => {
			measured = entries?.[0]?.contentRect ?? { width: container.clientWidth, height: container.clientHeight };
			syncSize();
		});
		observer.observe(container);
		watchPixelRatio();

		return () => {
			clearTimeout(timeout);
			observer.disconnect();
			media.removeEventListener("change", watchPixelRatio);
		};
	}, [containerRef, enabled]);

	return size;
}

// The newest thumbnail already drawn for this resume (an earlier edit, or another size), shown until the current
// one is ready, so an edit or a return visit never drops the card back to a placeholder.
const findLatestThumbnail = (queryClient: QueryClient, resumePrefix: string) => {
	let latest: { url: string; at: number } | undefined;
	for (const query of queryClient.getQueryCache().findAll({ queryKey: ["resume-thumbnail"] })) {
		const key = query.queryKey[1];
		const url = query.state.data;
		if (typeof key !== "string" || !key.startsWith(resumePrefix) || typeof url !== "string") continue;
		if (!latest || query.state.dataUpdatedAt > latest.at) latest = { url, at: query.state.dataUpdatedAt };
	}
	return latest?.url;
};

function useResumeThumbnail(
	data: ResumeData | undefined,
	cacheKey: string,
	size: ResumeThumbnailSize,
	enabled: boolean,
): ThumbnailState {
	const queryClient = useQueryClient();
	const resumePrefix = `${cacheKey.slice(0, cacheKey.lastIndexOf(":"))}:`;

	useEffect(() => {
		releaseThumbnailUrls(queryClient, "resume-thumbnail");
	}, [queryClient]);

	const {
		data: thumbnailData,
		error: thumbnailError,
		isError: thumbnailIsError,
	} = useQuery({
		queryKey: ["resume-thumbnail", cacheKey, size.width, size.height],
		queryFn: ({ signal }) => {
			if (!data) throw new Error("Resume data is required to generate a thumbnail.");
			return createResumeThumbnailUrl(data, size, signal);
		},
		enabled: Boolean(enabled && data && size.width && size.height),
		placeholderData: (previous) => previous ?? findLatestThumbnail(queryClient, resumePrefix),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: THUMBNAIL_CACHE_TIME,
	});
	const previousThumbnailData = useRef<string | undefined>(undefined);

	// Drops this resume's thumbnails from earlier edits, except the one still on screen: it goes (and its URL is
	// revoked) once its replacement is what's shown.
	useEffect(() => {
		const queryCache = queryClient.getQueryCache();

		for (const query of queryCache.findAll({ queryKey: ["resume-thumbnail"] })) {
			const queryCacheKey = query.queryKey[1];
			if (
				typeof queryCacheKey === "string" &&
				queryCacheKey.startsWith(resumePrefix) &&
				queryCacheKey !== cacheKey &&
				query.state.data !== thumbnailData
			) {
				queryCache.remove(query);
			}
		}
	}, [cacheKey, queryClient, resumePrefix, thumbnailData]);

	useEffect(() => {
		if (thumbnailError) console.error("Failed to generate resume thumbnail", thumbnailError);
	}, [thumbnailError]);

	useEffect(() => {
		const previousUrl = previousThumbnailData.current;
		if (previousUrl && previousUrl !== thumbnailData) {
			const previousQuery = queryClient
				.getQueryCache()
				.findAll({ queryKey: ["resume-thumbnail"] })
				.find((query) => query.state.data === previousUrl);
			if (previousQuery) queryClient.getQueryCache().remove(previousQuery);
		}
		previousThumbnailData.current = thumbnailData;
	}, [queryClient, thumbnailData]);

	if (thumbnailIsError) return { status: "error" };
	if (thumbnailData) return { status: "ready", url: thumbnailData };
	if (!data || !cacheKey) return { status: "idle" };

	return { status: "loading" };
}

/** The resume's first page, rendered once it scrolls near view and cached until it changes. */
export function ResumeThumbnail({ resume }: ResumeThumbnailProps) {
	const ref = useRef<HTMLDivElement>(null);
	const visible = useInView(ref, { amount: 0.1, margin: "240px" });
	const resumeQuery = orpc.resume.getById.queryOptions({ input: { id: resume.id } });
	const { data: resumeData, isError: resumeIsError } = useQuery({
		...resumeQuery,
		// A summary revision must fetch its own data: a still-fresh editor/cache entry may belong to an older edit.
		queryKey: [...resumeQuery.queryKey, { previewRevision: resume.updatedAt.toISOString() }],
		enabled: visible,
	});
	return (
		<div ref={ref} className="size-full">
			<DocumentThumbnail
				document={resume}
				data={resumeData?.data}
				empty={Boolean(resumeData && !hasResumePreviewContent(resumeData.data))}
				failed={resumeIsError}
				kind="resume"
			/>
		</div>
	);
}

/** Both document types share page rendering, sizing, revision caching and recovery states. */
export function DocumentThumbnail({
	document,
	data,
	empty: isEmpty,
	failed,
	kind,
}: {
	document: { id: string; updatedAt: Date; name?: string };
	data: ResumeData | undefined;
	empty: boolean;
	failed: boolean;
	kind: "resume" | "letter";
}) {
	const { t } = useLingui();
	const containerRef = useRef<HTMLDivElement>(null);
	const [image, setImage] = useState<{ url: string; status: "ready" | "error" } | null>(null);
	const isInView = useInView(containerRef, { amount: 0.1, margin: "240px" });
	const size = useThumbnailSize(containerRef, isInView);
	const cacheKey = getResumeThumbnailCacheKey(`${kind}:${document.id}`, document.updatedAt);
	const thumbnail = useResumeThumbnail(isEmpty ? undefined : data, cacheKey, size, isInView);
	const imageState = thumbnail.status === "ready" && image?.url === thumbnail.url ? image.status : "loading";
	const hasFailed = failed || thumbnail.status === "error" || imageState === "error";
	const status = isEmpty ? "empty" : hasFailed ? "error" : imageState === "ready" ? "ready" : "loading";
	const loading = useSkeletonLoading(status === "loading");

	return (
		<div
			ref={containerRef}
			data-slot={`${kind}-thumbnail`}
			dir="auto"
			lang={data?.metadata.page.locale}
			data-state={status}
			className="@container/thumbnail relative size-full overflow-hidden bg-white"
		>
			{status === "empty" ? (
				<PreviewPlaceholder
					variant="thumbnail"
					appearance="empty"
					label={kind === "letter" ? t`Empty letter` : t`Empty CV`}
					thumbnailSrc={
						kind === "resume" && data
							? getTemplateImageUrl(data.metadata.template, data.metadata.page.locale)
							: undefined
					}
				/>
			) : status === "error" ? (
				<PreviewPlaceholder variant="thumbnail" label={t`Preview unavailable`} />
			) : (
				<>
					{thumbnail.status === "ready" && (
						<img
							alt=""
							data-slot="resume-preview-image"
							src={thumbnail.url}
							className={cn(documentCardLayout.previewImage, status !== "ready" && "opacity-0")}
							onLoad={() => setImage({ url: thumbnail.url, status: "ready" })}
							onError={() => setImage({ url: thumbnail.url, status: "error" })}
						/>
					)}
					{data && !loading.pending && (
						<span data-slot="document-preview-heading" className={documentCardLayout.previewHeading}>
							<span dir="auto" className={documentCardLayout.previewName}>
								{kind === "resume" ? data.basics.name || document.name : document.name}
							</span>
							{kind === "resume" && data.basics.headline && (
								<span dir="auto" className={documentCardLayout.previewSubtitle}>
									{data.basics.headline}
								</span>
							)}
						</span>
					)}
					{loading.pending && (
						<QuerySkeleton
							className="absolute inset-0"
							fallback={<Skeleton className="aspect-page size-full rounded-none" />}
						/>
					)}
				</>
			)}
		</div>
	);
}
