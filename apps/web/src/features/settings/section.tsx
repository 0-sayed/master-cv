import type { ReactNode } from "react";
import { useId } from "react";
import { Icon, type IconName } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";

type SettingsSectionProps = {
	title: ReactNode;
	/** A short line under the title. */
	description?: ReactNode;
	/** Sits at the right of the title, e.g. "New key". */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	width?: "form" | "full";
	/** Column peers align on desktop and retain their separator when stacked on mobile. */
	presentation?: "plain" | "column" | "card" | "danger";
	id?: string;
};

/** A settings group with shared form/card width and optional danger presentation. */
export function SettingsSection({
	title,
	description,
	action,
	children,
	className,
	width = "form",
	presentation = "plain",
	id,
}: SettingsSectionProps) {
	const titleId = useId();
	return (
		<section
			id={id}
			aria-labelledby={titleId}
			className={cn(
				"grid min-w-0 content-start gap-3",
				width === "form" ? "form-content" : "w-full",
				presentation === "plain" || presentation === "column"
					? "border-t border-line pt-6 first:border-t-0 first:pt-0"
					: "rounded-xl border bg-surface p-5",
				presentation === "column" && "md:border-t-0 md:pt-0",
				presentation === "card" && "border-line",
				presentation === "danger" && "border-danger",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<div className="grid gap-0.5">
					<h2 id={titleId} className={cn("type-section", presentation === "danger" && "text-danger-text")}>
						{title}
					</h2>
					{description && <p className="type-body text-ink-2">{description}</p>}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

type SettingsRowProps = {
	icon?: IconName;
	status?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
};

/** Keep a setting's label, explanation and control in one readable group. */
export function SettingsRow({ title, description, children, icon, status }: SettingsRowProps) {
	return (
		<div data-slot="settings-row" className="settings-row items-center gap-3 py-2">
			<div className="grid min-w-0 gap-0.5">
				<span className="flex flex-wrap items-center gap-2 type-label wrap-anywhere">
					{icon && <Icon name={icon} className="text-ink-2" />}
					<span>{title}</span>
					{status}
				</span>
				{description && <span className="type-body wrap-anywhere text-ink-2">{description}</span>}
			</div>
			<div
				data-slot="settings-row-action"
				className="flex min-w-0 flex-wrap items-center justify-end gap-2 max-sm:justify-start max-sm:justify-self-start"
			>
				{children}
			</div>
		</div>
	);
}
