type DiffPart = { type: "equal" | "removed" | "added"; value: string };

/** Match technical values before ordinary words so punctuation remains atomic. */
export function tokenizeDiff(value: string): string[] {
	return (
		value.match(
			/(?:https?:\/\/|www\.)[^\s<>]+|[\p{L}\p{N}_.+%-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:\+\p{Nd}|\(\p{Nd}+\)|\p{Nd})[\p{Nd} ()-]{5,}\p{Nd}|[-+]?\p{Nd}+(?:[/.,:٬٫-]\p{Nd}+)*%?|\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]+/gu,
		) ?? []
	);
}

/** Large or scattered edits read as complete values instead of alternating fragments. */
export function shouldStackDiff(before: string, after: string): boolean {
	const parts = diffWords(before, after);
	const count = (value: string) => tokenizeDiff(value).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
	const total = count(before) + count(after);
	const changed = parts.filter((part) => part.type !== "equal").reduce((sum, part) => sum + count(part.value), 0);
	if (!changed) return false;
	let runs = 0;
	let changing = false;
	for (const part of parts) {
		if (!count(part.value)) continue;
		if (part.type === "equal") changing = false;
		else if (!changing) {
			runs++;
			changing = true;
		}
	}
	const first = parts[0];
	const last = parts.at(-1);
	const boundary =
		(first?.type === "equal" ? count(first.value) : 0) +
		(parts.length > 1 && last?.type === "equal" ? count(last.value) : 0);
	return changed / total > 0.4 || runs > 2 || boundary < 2;
}

/** Preserve whitespace, punctuation, Arabic diacritics, and mixed-script words. */
export function diffWords(before: string, after: string): DiffPart[] {
	const oldWords = tokenizeDiff(before);
	const newWords = tokenizeDiff(after);
	let prefix = 0;
	while (prefix < oldWords.length && oldWords[prefix] === newWords[prefix]) prefix++;
	let oldEnd = oldWords.length;
	let newEnd = newWords.length;
	while (oldEnd > prefix && newEnd > prefix && oldWords[oldEnd - 1] === newWords[newEnd - 1]) {
		oldEnd--;
		newEnd--;
	}
	const rows = oldEnd - prefix;
	const columns = newEnd - prefix;
	const lengths = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1));
	for (let i = rows - 1; i >= 0; i--) {
		const row = new Uint32Array(columns + 1);
		const next = lengths[i + 1];
		for (let j = columns - 1; j >= 0; j--) {
			row[j] =
				oldWords[prefix + i] === newWords[prefix + j]
					? (next?.[j + 1] ?? 0) + 1
					: Math.max(next?.[j] ?? 0, row[j + 1] ?? 0);
		}
		lengths[i] = row;
	}
	const parts: DiffPart[] = [];
	const append = (type: DiffPart["type"], value: string | undefined) => {
		if (!value) return;
		const last = parts.at(-1);
		if (last?.type === type) last.value += value;
		else parts.push({ type, value });
	};
	append("equal", oldWords.slice(0, prefix).join(""));
	let i = 0;
	let j = 0;
	while (i < rows || j < columns) {
		if (i < rows && j < columns && oldWords[prefix + i] === newWords[prefix + j]) {
			append("equal", oldWords[prefix + i]);
			i++;
			j++;
		} else if (i < rows && (j === columns || (lengths[i + 1]?.[j] ?? 0) >= (lengths[i]?.[j + 1] ?? 0))) {
			append("removed", oldWords[prefix + i++]);
		} else {
			append("added", newWords[prefix + j++]);
		}
	}
	append("equal", oldWords.slice(oldEnd).join(""));
	return parts;
}
