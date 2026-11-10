import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ActionFeedback } from "./action-feedback";

beforeEach(() => document.documentElement.style.setProperty("--motion-success-hold", "1500ms"));
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	document.documentElement.style.removeProperty("--motion-success-hold");
});

it("never removes an unfinished tick under load; holds the completed tick then restores the label", () => {
	vi.useFakeTimers();
	const { container } = render(
		<ActionFeedback state="ready" label="Download PDF" pendingLabel="Preparing…" readyLabel="PDF ready" />,
	);
	const feedback = container.querySelector('[data-slot="action-feedback"]');
	expect(feedback).toHaveAttribute("data-state", "ready");
	act(() => vi.advanceTimersByTime(2500));
	expect(feedback).toHaveAttribute("data-state", "ready");
	const path = container.querySelector('[data-slot="success-tick"] path');
	if (!path) throw new Error("Ready tick missing");
	fireEvent.animationEnd(path, { animationName: "signature-draw" });
	act(() => vi.advanceTimersByTime(1499));
	expect(feedback).toHaveAttribute("data-state", "ready");
	act(() => vi.advanceTimersByTime(1));
	expect(feedback).toHaveAttribute("data-state", "idle");
	expect(container.querySelector('[data-slot="success-tick"]')).toBeNull();
	expect(screen.getByRole("status")).toHaveTextContent("PDF ready");
});
it("holds the final static tick immediately under reduced motion without waiting for an animation event", () => {
	vi.useFakeTimers();
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const { container } = render(
		<ActionFeedback state="ready" label="PDF" pendingLabel="Preparing" readyLabel="Ready" />,
	);
	act(() => vi.advanceTimersByTime(1500));
	expect(container.querySelector('[data-slot="action-feedback"]')).toHaveAttribute("data-state", "idle");
});

it("reserves the original label through pending, ready and failed states and announces only the actual result", () => {
	const props = { label: "Download PDF", pendingLabel: "Preparing…", readyLabel: "PDF ready" };
	const { container, rerender } = render(<ActionFeedback {...props} state="idle" />);
	const reserved = container.querySelector('[data-slot="action-label"]');
	expect(reserved).toHaveTextContent("Download PDF");
	for (const state of ["pending", "ready", "failed", "idle"] as const) {
		rerender(<ActionFeedback {...props} state={state} />);
		expect(container.querySelector('[data-slot="action-label"]')).toBe(reserved);
		expect(screen.getByRole("status")).toHaveTextContent(
			state === "ready" ? "PDF ready" : state === "pending" ? "Preparing…" : "",
		);
		expect(container.querySelector('[data-slot="success-tick"]') !== null).toBe(state === "ready");
	}
});
