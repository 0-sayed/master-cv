/**
 * Folds the cosmetic differences between a pasted job description and a PDF's extracted text:
 * compatibility characters, smart quotes, ligatures, and the several dashes that all mean "-".
 */
export function normalizeForMatching(value: string): string {
	return (
		value
			.normalize("NFKC")
			// Conservative orthographic comparison only; storage and calendar values stay untouched.
			.replace(/[\u0640\u064b-\u065f\u0670]/gu, "")
			.replace(/[٠-٩۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x0660 : 0x06f0)))
			.replaceAll("’", "'")
			.replaceAll("‘", "'")
			.replaceAll("“", '"')
			.replaceAll("”", '"')
			.replace(/[‐-―−]/g, "-")
			.replace(/[   ]/g, " ")
			.toLowerCase()
	);
}

/** Each normalized UTF-16 unit points back to its complete source grapheme. */
export function normalizeWithOffsets(value: string) {
	let text = "";
	const offsets: Array<{ start: number; end: number }> = [];
	for (const entry of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value)) {
		const normalized = normalizeForMatching(entry.segment);
		text += normalized;
		for (let unit = 0; unit < normalized.length; unit++)
			offsets.push({ start: entry.index, end: entry.index + entry.segment.length });
	}
	return { text, offsets };
}
