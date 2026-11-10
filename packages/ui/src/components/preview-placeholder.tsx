import { Icon } from "./icon";

type PreviewPlaceholderProps = { label: string; variant?: "page" | "thumbnail" };

/** An explicit empty/error state inside a document's page footprint. */
export function PreviewPlaceholder({ label, variant = "page" }: PreviewPlaceholderProps) {
	return (
		<div
			data-slot="preview-placeholder"
			data-variant={variant}
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
