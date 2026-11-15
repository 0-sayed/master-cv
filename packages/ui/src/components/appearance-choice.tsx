import type { ComponentProps, ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon, type IconName } from "./icon";

type AppearanceChoiceProps = Omit<ComponentProps<"input">, "type" | "children"> & {
	label: ReactNode;
	icon: IconName;
	preview: "light" | "dark" | "system";
};

/** Shared radio tile: a token-based miniature shell, with a visible selection check. */
export function AppearanceChoice({ label, icon, preview, checked, ...props }: AppearanceChoiceProps) {
	return (
		<label
			className={cn(
				"flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-line-2 p-3 has-focus-visible:outline-2 has-focus-visible:outline-accent",
				checked && "border-accent bg-accent-soft",
			)}
		>
			<input {...props} type="radio" checked={checked} className="sr-only" />
			<span
				aria-hidden="true"
				data-theme={preview}
				className="appearance-preview relative flex h-20 shrink-0 overflow-hidden rounded-md border border-line"
			>
				<span className="appearance-preview-sidebar grid w-1/4 content-start gap-2 p-2">
					<span className="h-1.5 rounded-full bg-accent" />
					<span className="h-1.5 rounded-full bg-line-2" />
				</span>
				<span className="grid flex-1 content-start gap-2 p-2">
					<span className="h-1.5 w-2/3 rounded-full bg-line-2" />
					<span className="h-8 rounded-md bg-paper" />
				</span>
				{checked && (
					<Icon name="check-circle" className="absolute end-1 top-1 rounded-full bg-accent-soft text-accent-text" />
				)}
			</span>
			<span className="flex flex-wrap items-center justify-center gap-2 type-label">
				<Icon name={icon} />
				<span>{label}</span>
			</span>
		</label>
	);
}
