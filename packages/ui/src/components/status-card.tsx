import type { ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { ActionGroup } from "./action-group";
import { Icon, type IconName } from "./icon";

type StatusCardProps = {
	icon: IconName;
	title: ReactNode;
	children: ReactNode;
	actions: ReactNode;
	secondary?: ReactNode;
	tone?: "accent" | "warn";
};

/** Focused public/auth outcome; directions and actions follow the surrounding interface. */
export function StatusCard({ icon, title, children, actions, secondary, tone = "accent" }: StatusCardProps) {
	return (
		<section
			data-slot="status-card"
			className="mx-auto grid w-full max-w-lg justify-items-center gap-6 rounded-2xl border border-line bg-surface p-6 text-center sm:p-8"
		>
			<span
				className={cn(
					"grid size-16 place-items-center rounded-full",
					tone === "warn" ? "bg-warn-soft text-warn-text" : "bg-accent-soft text-accent-text",
				)}
			>
				<Icon name={icon} size={32} />
			</span>
			<h1 className="type-title-s">{title}</h1>
			<div className="grid min-w-0 gap-3 type-body wrap-anywhere text-ink-2">{children}</div>
			<ActionGroup responsive="stack">{actions}</ActionGroup>
			{secondary}
		</section>
	);
}
