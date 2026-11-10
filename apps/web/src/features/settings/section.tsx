import type { ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";

type SettingsSectionProps = {
	title: ReactNode;
	/** A short line under the title. */
	description?: ReactNode;
	/** Sits at the right of the title, e.g. "New key". */
	action?: ReactNode;
	children: ReactNode;
	className?: string;
};

/** A settings group: a title and its rows, divided from the group above by a rule. No card around it. */
export function SettingsSection({ title, description, action, children, className }: SettingsSectionProps) {
	return (
		<section className={cn("form-content grid gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0", className)}>
			<div className="flex items-center justify-between gap-3">
				<div className="grid gap-0.5">
					<h2 className="type-section">{title}</h2>
					{description && <p className="type-body text-ink-2">{description}</p>}
				</div>
				{action}
			</div>
			{children}
		</section>
	);
}

type SettingsRowProps = {
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
};

/** Keep a setting's label, explanation and control in one readable group. */
export function SettingsRow({ title, description, children }: SettingsRowProps) {
	return (
		<div data-slot="settings-row" className="settings-row items-center gap-3 py-2">
			<div className="grid min-w-0 gap-0.5">
				<span className="type-label wrap-anywhere">{title}</span>
				{description && <span className="type-body wrap-anywhere text-ink-2">{description}</span>}
			</div>
			<div
				data-slot="settings-row-action"
				className="flex min-w-0 items-center justify-end gap-2 max-sm:justify-self-end"
			>
				{children}
			</div>
		</div>
	);
}
