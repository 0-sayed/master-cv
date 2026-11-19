import type { UIEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { useEditorStore } from "../store";
import { REVIEW_HIGHLIGHT_MS } from "@/libs/motion";

/** Scroll belongs to the document, not the disposable desktop/drawer/mobile panel host. */
export function useCheckPanelScroll(active: boolean) {
	const ref = useRef<HTMLDivElement>(null);
	const tab = useEditorStore((state) => state.reviewTab);
	useLayoutEffect(() => {
		const panel = ref.current;
		if (!active || !panel) return;
		const { reviewScrollTop, checkReturnIssue, checkReturnAction, checkReturnIndex } = useEditorStore.getState();
		const checkScrollTop = reviewScrollTop[tab];
		panel.scrollTop = checkScrollTop;
		let clear: ReturnType<typeof setTimeout> | undefined;
		let focusFrame: number | undefined;
		let card: HTMLElement | null = null;
		const restore = () => {
			if (!checkReturnIssue) return;
			card = panel.querySelector<HTMLElement>(`[data-issue-card="${CSS.escape(checkReturnIssue)}"]`);
			if (!card) {
				const rows = panel.querySelectorAll<HTMLElement>("[data-issue-card]");
				card = rows[Math.min(checkReturnIndex ?? 0, rows.length - 1)] ?? null;
			}
			if (!card) {
				const heading = panel.querySelector<HTMLElement>("[data-review-empty]");
				if (heading) {
					heading.focus({ preventScroll: true });
					useEditorStore.getState().setCheckReturnIssue(null);
					observer.disconnect();
				}
				return;
			}
			observer.disconnect();
			panel.scrollTop = checkScrollTop;
			const box = card.getBoundingClientRect();
			const viewport = panel.getBoundingClientRect();
			if (box.top < viewport.top || box.bottom > viewport.bottom)
				panel.scrollTop += box.top - viewport.top - (viewport.height - box.height) / 2;
			const target =
				(checkReturnAction
					? card.querySelector<HTMLElement>(`[data-review-action="${CSS.escape(checkReturnAction)}"]`)
					: null) ??
				card.querySelector<HTMLElement>("button[aria-pressed]") ??
				card;
			if (target === card) target.tabIndex = -1;
			const focus = () => {
				if (!target.isConnected || !panel.contains(target)) return;
				target.focus({ preventScroll: true });
				if (document.activeElement !== target) focusFrame = requestAnimationFrame(focus);
			};
			focus();
			card.setAttribute("data-check-return", "true");
			useEditorStore.getState().setCheckReturnIssue(null);
			clear = setTimeout(() => card?.removeAttribute("data-check-return"), REVIEW_HIGHLIGHT_MS);
		};
		// Findings can arrive after the host mounts; restore only when the originating card exists.
		const observer = new MutationObserver(restore);
		observer.observe(panel, { childList: true, subtree: true });
		restore();
		return () => {
			observer.disconnect();
			clearTimeout(clear);
			if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
			card?.removeAttribute("data-check-return");
		};
	}, [active, tab]);
	return {
		ref,
		onScroll: (event: UIEvent<HTMLDivElement>) => {
			if (active) useEditorStore.getState().setReviewScrollTop(tab, event.currentTarget.scrollTop);
		},
	};
}
