import type { ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";

export function ProgressRing({
	value,
	label,
	compact = false,
	children,
}: {
	value: number;
	label: string;
	compact?: boolean;
	children?: ReactNode;
}) {
	const percentage = Math.max(0, Math.min(100, Math.round(value)));
	return (
		<span
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percentage}
			className={cn(
				"relative inline-grid shrink-0 place-items-center text-accent-text",
				compact ? "size-8" : "size-11",
			)}
		>
			<svg viewBox="0 0 36 36" className="absolute inset-0 size-full" aria-hidden="true">
				<circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="3" />
				<circle
					cx="18"
					cy="18"
					r="15"
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="butt"
					pathLength="100"
					strokeDasharray={`${percentage} ${100 - percentage}`}
					transform="rotate(-90 18 18)"
				/>
			</svg>
			{children ??
				(percentage === 100 ? (
					<Icon name="check" size={16} aria-hidden="true" />
				) : (
					<span
						dir="ltr"
						className={cn(
							"font-semibold tabular-nums",
							compact ? "progress-ring-label-compact" : "progress-ring-label",
						)}
					>
						{percentage}%
					</span>
				))}
		</span>
	);
}
