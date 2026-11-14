import { normalizeWithOffsets } from "./normalize";

/**
 * Word segmentation that keeps technical surface forms intact.
 *
 * `Intl.Segmenter` is the right tool for finding word boundaries across scripts, but it splits
 * "C++" into three pieces and "Node.js" into three more — and those are exactly the terms a
 * candidate is searched on. So segmentation runs first, then a merge pass glues the connector
 * characters that carry meaning back onto their words.
 */

/** Connectors that only join when a word follows immediately: `ci/cd`, `node.js`, `back-end`. */
const JOINING_CONNECTORS = new Set([".", "/", "-", "_"]);
/** Connectors that are meaningful on their own end of a token: `c++`, `c#`, `f#`. */
const TRAILING_CONNECTORS = new Set(["+", "#"]);

type Segment = { text: string; isWordLike: boolean };

function segment(text: string): Segment[] {
	if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
		const segmenter = new Intl.Segmenter("en", { granularity: "word" });
		return [...segmenter.segment(text)].map((entry) => ({
			text: entry.segment,
			isWordLike: entry.isWordLike ?? false,
		}));
	}

	// Older runtimes: fall back to a plain letter/number split. Same tokens for Latin text.
	return (text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]/gu) ?? []).map((piece) => ({
		text: piece,
		isWordLike: /[\p{L}\p{N}]/u.test(piece),
	}));
}

export function tokenize(text: string): string[] {
	const segments = segment(text);
	const tokens: string[] = [];

	let current = "";

	const flush = () => {
		const trimmed = current.replace(/^[._/-]+/, (prefix) => (prefix === "." ? "." : "")).replace(/[._/-]+$/, "");
		if (trimmed.length > 0 && /[\p{L}\p{N}]/u.test(trimmed)) tokens.push(trimmed);
		current = "";
	};

	for (let index = 0; index < segments.length; index += 1) {
		const piece = segments[index];
		if (!piece) continue;

		if (piece.isWordLike) {
			current += piece.text;
			continue;
		}

		const next = segments[index + 1];

		if (JOINING_CONNECTORS.has(piece.text)) {
			// ".net" opens a token; "node.js" continues one. A sentence-ending "." does neither,
			// because nothing word-like follows it immediately.
			if (next?.isWordLike) {
				current += piece.text;
				continue;
			}
		}

		if (TRAILING_CONNECTORS.has(piece.text) && current.length > 0) {
			current += piece.text;
			continue;
		}

		flush();
	}

	flush();

	return tokens;
}

/**
 * Splits text into the runs that n-grams may span. A phrase never crosses a sentence, a bullet,
 * or a line — "React. Node" is not the phrase "react node".
 */
export function splitIntoRuns(text: string): string[] {
	return text
		.split(/[\n\r]+|(?<=[.!?;:])\s+|[•▪◦‣·|,()[\]{}]/)
		.map((run) => run.trim())
		.filter(Boolean);
}

/** Token windows use the matcher's run boundaries, carrying original UTF-16 source positions. */
export function matchingWindows(value: string, maxLength: number) {
	const normalized = normalizeWithOffsets(value);
	const windows: Array<{ text: string; start: number; end: number; quote: string }> = [];
	let runCursor = 0;
	for (const run of splitIntoRuns(normalized.text)) {
		const runStart = normalized.text.indexOf(run, runCursor);
		runCursor = runStart + run.length;
		let cursor = runStart;
		const tokens = tokenize(run).map((text) => {
			const start = normalized.text.indexOf(text, cursor);
			cursor = start + text.length;
			return { text, start, end: cursor };
		});
		for (let size = 1; size <= maxLength; size++) {
			for (let index = 0; index + size <= tokens.length; index++) {
				const first = tokens[index];
				const last = tokens[index + size - 1];
				if (!first || !last) continue;
				const start = normalized.offsets[first.start]?.start;
				const end = normalized.offsets[last.end - 1]?.end;
				if (start === undefined || end === undefined) continue;
				windows.push({
					text: tokens
						.slice(index, index + size)
						.map((token) => token.text)
						.join(" "),
					start,
					end,
					quote: value.slice(start, end),
				});
			}
		}
	}
	return windows;
}
