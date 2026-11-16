const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
export function sectionProgress(top: number, height: number, viewportHeight: number, pinned: boolean) {
	if (pinned) return clamp01(-top / Math.max(1, height - viewportHeight));
	return clamp01((viewportHeight - top) / Math.max(1, Math.min(height, viewportHeight)));
}
