type PreviewLayer = { renderKey: string; phase: "active" | "exiting" | "staged" };

/** Keep the acknowledged canvas on identical echoes; abandon stale staged work on a revert. */
export function queuePreviewLayer<T extends PreviewLayer>(layers: T[], next: T): T[] {
	const matching = layers.find((layer) => layer.phase !== "exiting" && layer.renderKey === next.renderKey);
	if (matching) return layers.filter((layer) => layer.phase === "active" || layer === matching);
	return [...layers.filter((layer) => layer.phase === "active"), next];
}
