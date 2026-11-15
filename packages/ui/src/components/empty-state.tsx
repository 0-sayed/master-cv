import type { ComponentProps, ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { ActionGroup } from "./action-group";
import { Icon, type IconName } from "./icon";

type EmptyStateProps = Omit<ComponentProps<"div">, "title"> & {
	icon?: IconName;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	density?: "default" | "compact";
};

/** Successful empty collections only; loading and failed queries keep their own recovery UI. */
export function EmptyState({
	className,
	icon,
	title,
	description,
	actions,
	density = "default",
	children,
	...props
}: EmptyStateProps) {
	return (
		<div
			data-slot="empty-state"
			className={cn(
				"sadu-surface grid w-full min-w-0 justify-items-center gap-3 rounded-xl border border-dashed border-line-2 bg-surface text-center",
				density === "compact" ? "p-4" : "px-4 py-12 sm:px-8 sm:py-16",
				className,
			)}
			{...props}
		>
			{icon && (
				<span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-text">
					<Icon name={icon} size={28} aria-hidden="true" />
				</span>
			)}
			{title && <h2 className="type-section">{title}</h2>}
			{description && <p className="max-w-xl type-body text-ink-2">{description}</p>}
			{children}
			{actions && <ActionGroup responsive="stack">{actions}</ActionGroup>}
		</div>
	);
}
