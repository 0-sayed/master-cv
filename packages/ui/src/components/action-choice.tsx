import type { ComponentProps, ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";

/** A concise action with supporting copy, including file-drop entry points. */
export function ActionChoice({
	title,
	description,
	icon,
	dropzone = false,
	className,
	...props
}: Omit<ComponentProps<"button">, "title"> & {
	title: ReactNode;
	description: ReactNode;
	icon: ReactNode;
	dropzone?: boolean;
}) {
	return (
		<button
			type="button"
			data-slot="action-choice"
			className={cn(
				"flex items-start gap-3 rounded-xl border border-line p-4 text-start transition-colors duration-quick hover:border-line-2 hover:bg-hover disabled:opacity-60",
				dropzone && "border-2 border-dashed hover:border-accent hover:bg-accent-soft",
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
		</button>
	);
}
