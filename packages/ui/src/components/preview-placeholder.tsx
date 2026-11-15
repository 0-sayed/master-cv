import { useState } from "react";
import { Icon } from "./icon";

type PreviewPlaceholderProps = {
	label: string;
	variant?: "page" | "thumbnail";
	appearance?: "unavailable" | "empty";
	thumbnailSrc?: string | undefined;
};

/** An explicit empty/error state inside a document's page footprint. */
export function PreviewPlaceholder({
	label,
	variant = "page",
	appearance = "unavailable",
	thumbnailSrc,
}: PreviewPlaceholderProps) {
	const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	if (appearance === "empty") {
		return (
			<div
				data-slot="preview-placeholder"
				data-variant={variant}
				data-appearance="empty"
				className="relative size-full bg-paper text-paper-ink"
			>
				{thumbnailSrc && failedSrc !== thumbnailSrc && (
					<img
						data-slot="empty-preview-template"
						src={thumbnailSrc}
						alt=""
						aria-hidden="true"
						className="absolute inset-0 size-full object-cover object-top opacity-15"
						onLoad={() => setLoadedSrc(thumbnailSrc)}
						onError={() => setFailedSrc(thumbnailSrc)}
					/>
				)}
				<div
					data-slot="empty-preview-visible-area"
					className="relative grid h-[min(100%,var(--preview-visible-height,100%))] w-full place-items-center"
				>
					{(!thumbnailSrc || loadedSrc !== thumbnailSrc || failedSrc === thumbnailSrc) && (
						<div
							data-slot="empty-preview-lines"
							aria-hidden="true"
							className="absolute inset-4 flex flex-col gap-2 opacity-15 @max-[6rem]/thumbnail:inset-1 @max-[6rem]/thumbnail:gap-1"
						>
							<span className="h-2 w-3/5 rounded-sm bg-paper-ink" />
							<span className="mb-2 h-1 w-2/5 rounded-sm bg-paper-ink" />
							<span className="h-1 w-1/3 rounded-sm bg-paper-ink" />
							<span className="h-1 w-full rounded-sm bg-paper-ink" />
							<span className="h-1 w-4/5 rounded-sm bg-paper-ink" />
						</div>
					)}
					<span
						title={label}
						className="relative w-full min-w-0 bg-paper px-2 py-1 text-center type-metadata font-medium break-words"
					>
						{label}
					</span>
				</div>
			</div>
		);
	}
	return (
		<div
			data-slot="preview-placeholder"
			data-variant={variant}
			data-appearance="unavailable"
			className="grid size-full content-center justify-items-center gap-2 bg-surface p-3 text-center text-ink-2"
		>
			<span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
				<Icon name="file-text" size={24} />
			</span>
			<span title={label} className="max-w-full min-w-0 type-metadata font-medium break-words">
				{label}
			</span>
		</div>
	);
}
