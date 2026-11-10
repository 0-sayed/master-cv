import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Two local renders of the same template. Crossfade never changes document language. */
export function TemplateThumbnail({
	src,
	alternateSrc,
	selected,
	children,
}: {
	src: string;
	alternateSrc: string;
	selected?: boolean;
	children?: ReactNode;
}) {
	const [loaded, setLoaded] = useState<string | null>(null);
	return (
		<span
			data-slot="template-thumbnail"
			className={cn(
				"template-thumbnail relative block aspect-page overflow-hidden rounded-md border border-line bg-paper shadow-e1",
				selected && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
			)}
		>
			<img src={src} alt="" className="template-current size-full object-cover object-top" />
			<img
				src={alternateSrc}
				data-ready={loaded === alternateSrc}
				onLoad={(event) => {
					if (event.currentTarget.naturalWidth > 0) setLoaded(alternateSrc);
				}}
				onError={() => setLoaded(null)}
				alt=""
				aria-hidden="true"
				className="template-alternate absolute inset-0 size-full object-cover object-top"
			/>
			{children}
		</span>
	);
}
