import { useLayoutEffect, useRef, type UIEvent } from "react";
import { useEditorStore } from "./store";

/** Keep each tab's scroll position through modal suspension and Review. */
export function useExportHistoryScroll(tab: "download" | "history") {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const node = ref.current;
		if (node) node.scrollTop = useEditorStore.getState().exportHistorySession?.scrollTop[tab] ?? 0;
		return () => {
			if (node) useEditorStore.getState().setExportHistoryScrollTop(tab, node.scrollTop);
		};
	}, [tab]);
	const onScroll = (event: UIEvent<HTMLDivElement>) =>
		useEditorStore.getState().setExportHistoryScrollTop(tab, event.currentTarget.scrollTop);
	return { ref, onScroll };
}
