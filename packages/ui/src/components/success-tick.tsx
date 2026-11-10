import { cn } from "@reactive-resume/utils/style";

/** One acknowledgment glyph. Its reserved square never changes size or mirrors in RTL. */
export function SuccessTick({
	animated = true,
	className,
	onAnimationEnd,
}: {
	animated?: boolean;
	className?: string;
	onAnimationEnd?: React.AnimationEventHandler<SVGSVGElement>;
}) {
	return (
		<svg
			data-slot="success-tick"
			data-animated={animated}
			aria-hidden="true"
			viewBox="0 0 256 256"
			fill="none"
			onAnimationEnd={onAnimationEnd}
			className={cn("success-tick size-4 shrink-0", className)}
		>
			<path
				d="m48 128 56 56L216 72"
				pathLength="1"
				stroke="currentColor"
				strokeWidth="16"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
