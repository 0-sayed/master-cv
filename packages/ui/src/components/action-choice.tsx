import type { ComponentProps, ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";

/** A concise action with supporting copy, including file-drop entry points. */
export function ActionChoice({
	title,
	description,
	details,
	icon,
	dropzone = false,
	dragging = false,
	className,
	...props
}: Omit<ComponentProps<"button">, "title"> & {
	title: ReactNode;
	description: ReactNode;
	details?: ReactNode;
	icon: ReactNode;
	dropzone?: boolean;
	dragging?: boolean;
}) {
	return (
		<button
			type="button"
			data-slot="action-choice"
			data-dragging={dropzone && dragging ? "true" : undefined}
			className={cn(
				"flex items-start gap-3 rounded-xl border border-line p-4 text-start transition-colors duration-quick hover:border-line-2 hover:bg-hover disabled:opacity-60",
				details && "grid grid-cols-[auto_minmax(0,1fr)]",
				dropzone && "border-2 border-dashed py-6 hover:border-accent hover:bg-accent-soft",
				dropzone && dragging && "border-accent bg-accent-soft",
				className,
			)}
			{...props}
		>
			<span className="mt-0.5 shrink-0 text-ink-2">{icon}</span>
			<span className="grid min-w-0 gap-1">
				<span data-slot="action-choice-title" className="type-label">
					{title}
				</span>
				<span className="type-body text-ink-2">{description}</span>
			</span>
			{details && <span className="col-span-2">{details}</span>}
		</button>
	);
}
