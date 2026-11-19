import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";

const HasActions = createContext(false);
function Disclosure({ className, actions, ...props }: ComponentProps<"details"> & { actions?: ReactNode }) {
	return (
		<div className="relative border-b border-line last:border-b-0">
			<HasActions.Provider value={Boolean(actions)}>
				<details
					data-slot="disclosure"
					className={cn(
						"group/disclosure has-[>summary:focus-visible]:outline-focus relative open:outline open:outline-accent has-[>summary:focus-visible]:outline-2 has-[>summary:focus-visible]:outline-offset-2",
						className,
					)}
					{...props}
				/>
				{actions && (
					<div data-slot="disclosure-actions" className="absolute end-4 top-3">
						{actions}
					</div>
				)}
			</HasActions.Provider>
		</div>
	);
}

function DisclosureSummary({
	className,
	description,
	children,
	...props
}: ComponentProps<"summary"> & { description?: ReactNode }) {
	const actions = useContext(HasActions);
	return (
		<>
			<summary
				data-slot="disclosure-summary"
				className={cn(
					"touch-target relative grid cursor-pointer list-none grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 type-body text-ink focus-visible:outline-none pointer-coarse:min-h-12 [&::-webkit-details-marker]:hidden",
					actions && "pe-14",
					className,
				)}
				{...props}
			>
				<span className="grid min-w-0 gap-1">
					<span className="flex flex-wrap items-center gap-2 type-label">{children}</span>
					{description && (
						<span className="line-clamp-1 type-body text-ink-2 group-open/disclosure:line-clamp-none">
							{description}
						</span>
					)}
				</span>
				<Icon
					name="caret-down"
					className="mt-1 size-4 text-ink-3 transition-transform duration-quick group-open/disclosure:rotate-180 motion-reduce:transition-none"
					aria-hidden
				/>
			</summary>
		</>
	);
}

function DisclosureContent({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="disclosure-content"
			className={cn("grid gap-4 px-4 pb-4 type-body text-ink-2", className)}
			{...props}
		/>
	);
}

export { Disclosure, DisclosureSummary, DisclosureContent };
