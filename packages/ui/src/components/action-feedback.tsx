import { useEffect, useState } from "react";
import { Icon } from "./icon";
import { Spinner } from "./spinner";
import { SuccessTick } from "./success-tick";

export type ActionFeedbackState = "idle" | "pending" | "ready" | "failed";
type AcknowledgmentPhase = "drawing" | "holding" | "complete";
const initialPhase = (): AcknowledgmentPhase =>
	globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "holding" : "drawing";

/** The resting label stays in flow; progress and acknowledgment occupy its exact box. */
export function ActionFeedback({
	state,
	label,
	pendingLabel,
	readyLabel,
	iconOnly = false,
}: {
	state: ActionFeedbackState;
	label: string;
	pendingLabel: string;
	readyLabel: string;
	iconOnly?: boolean;
}) {
	// View-only acknowledgment window; the caller retains its actual acknowledged result.
	const [acknowledgment, setAcknowledgment] = useState(() => ({ source: state, phase: initialPhase() }));
	if (acknowledgment.source !== state) setAcknowledgment({ source: state, phase: initialPhase() });
	useEffect(() => {
		if (state !== "ready" || acknowledgment.phase !== "holding") return;
		const timer = globalThis.setTimeout(
			() => setAcknowledgment({ source: state, phase: "complete" }),
			successHoldDuration(),
		);
		return () => globalThis.clearTimeout(timer);
	}, [state, acknowledgment.phase]);
	useEffect(() => {
		const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
		const stopDrawing = () => {
			if (media?.matches)
				setAcknowledgment((current) => (current.phase === "drawing" ? { ...current, phase: "holding" } : current));
		};
		media?.addEventListener?.("change", stopDrawing);
		return () => media?.removeEventListener?.("change", stopDrawing);
	}, []);
	const visualState = state === "ready" && acknowledgment.phase === "complete" ? "idle" : state;
	return (
		<>
			<span data-slot="action-feedback" data-state={visualState} className="action-feedback">
				<span data-slot="action-label" className="action-label">
					<Icon name="download-simple" />
					{!iconOnly && label}
				</span>
				{state === "pending" && (
					<span className="action-result" aria-hidden="true">
						<Spinner decorative />
						{!iconOnly && label}
					</span>
				)}
				{visualState === "ready" && (
					<span className="action-result" aria-hidden="true">
						<SuccessTick
							onAnimationEnd={(event) => {
								if (event.animationName === "signature-draw") setAcknowledgment({ source: state, phase: "holding" });
							}}
						/>
					</span>
				)}
			</span>
			<span role="status" aria-live="polite" className="sr-only">
				{state === "ready" ? readyLabel : state === "pending" ? pendingLabel : ""}
			</span>
		</>
	);
}

/** Read the same CSS timing token for state cleanup; never duplicate a duration at a call site. */
export function successHoldDuration() {
	const token = getComputedStyle(document.documentElement).getPropertyValue("--motion-success-hold").trim();
	return (Number.parseFloat(token) || 0) * (token.endsWith("ms") ? 1 : 1000);
}
