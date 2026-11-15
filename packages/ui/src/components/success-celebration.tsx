import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@reactive-resume/utils/style";
import { SuccessTick } from "./success-tick";

type SuccessCelebrationProps = Pick<ComponentProps<typeof SuccessTick>, "animated" | "onAnimationEnd">;

/** Decorative acknowledgment only; the existing status or toast owns its live message. */
export function SuccessCelebration({ animated = true, ...props }: SuccessCelebrationProps) {
	return (
		<span data-slot="success-celebration" data-animated={animated} aria-hidden="true" className="success-celebration">
			<SuccessTick animated={animated} {...props} />
		</span>
	);
}

type SuccessStatusProps = { complete: boolean; children: ReactNode; className?: string };

/** Stored outcomes stay still; only a newly acknowledged success draws the mark. */
export function SuccessStatus({ complete, children, className }: SuccessStatusProps) {
	const [acknowledgment, setAcknowledgment] = useState({ complete, animated: false });
	if (acknowledgment.complete !== complete) setAcknowledgment({ complete, animated: complete });
	return (
		<span role="status" aria-live="polite" className={cn("inline-flex items-center gap-2", className)}>
			{complete && <SuccessCelebration animated={acknowledgment.animated} />}
			{children}
		</span>
	);
}
