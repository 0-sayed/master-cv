import type { UIEvent } from "react";
import { useLayoutEffect, useRef } from "react";
import { useEditorStore } from "../store";
import { REVIEW_HIGHLIGHT_MS } from "@/libs/motion";

/** Scroll belongs to the document, not the disposable desktop/drawer/mobile panel host. */
export function useCheckPanelScroll(active: boolean) {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const panel = ref.current;
		if (!active || !panel) return;
		const { checkScrollTop, checkReturnIssue } = useEditorStore.getState();
		panel.scrollTop = checkScrollTop;
		let clear: ReturnType<typeof setTimeout> | undefined;
		let card: HTMLElement | null = null;
		const restore = () => {
			if (!checkReturnIssue) return;
			card = panel.querySelector<HTMLElement>(`[data-issue-card="${CSS.escape(checkReturnIssue)}"]`);
			if (!card) return;
			observer.disconnect();
			panel.scrollTop = checkScrollTop;
			const box = card.getBoundingClientRect();
			const viewport = panel.getBoundingClientRect();
			if (box.top < viewport.top || box.bottom > viewport.bottom)
				panel.scrollTop += box.top - viewport.top - (viewport.height - box.height) / 2;
			card.tabIndex = -1;
			card.focus({ preventScroll: true });
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
			card?.removeAttribute("data-check-return");
		};
	}, [active]);
	return {
		ref,
		onScroll: (event: UIEvent<HTMLDivElement>) => {
			if (active) useEditorStore.getState().setCheckScrollTop(event.currentTarget.scrollTop);
		},
	};
}
