/** Independent source oracle: no renderer, formatter, or reader imports. D31 / Round 10. */
export function expectedExportDateDisplay(source: string, rtl = true): string {
	const value = source.replace(/[٠-٩۰-۹]/gu, (char) => String(char.charCodeAt(0) - (char <= "٩" ? 0x660 : 0x6f0)));
	if (!rtl) return value;
	// Whole date facts only. Contact, prose and identifier contexts never enter range recognition.
	const part = "(?:[12]\\d{3}(?:-\\d{2}(?:-\\d{2})?)?|\\d{1,2}/(?:\\d{1,2}/)?[12]\\d{3})";
	const closed = new RegExp(`^(${part})(\\s+هـ)?\\s*[–—-]\\s*(${part})(\\s+هـ)?$`, "u").exec(value);
	const open = new RegExp(`^(${part})\\s*[–—-]\\s*(Present|حتى الآن|حالياً)$`, "u").exec(value);
	if (open) return `${open[1]}- ${open[2]}`;
	if (!closed) return value;
	const first = closed[1];
	const last = closed[3];
	if (!first || !last) return value;
	const hijri = Boolean(closed?.[2]);
	if (Boolean(closed?.[2]) !== Boolean(closed?.[4])) return value;
	const parse = (token: string) => {
		const parts = token.split(/[-/]/u).map(Number);
		if (token.includes("/")) parts.reverse();
		const [year, month = 1, day = 1] = parts;
		if (
			!year ||
			year < 1300 ||
			year > 2199 ||
			month < 1 ||
			month > 12 ||
			day < 1 ||
			day > new Date(Date.UTC(year, month, 0)).getUTCDate()
		)
			return undefined;
		return { key: year * 10000 + month * 100 + day, precision: parts.length, slash: token.includes("/") };
	};
	const a = parse(first);
	const b = parse(last);
	if (!a || !b || a.key > b.key || a.precision !== b.precision || a.slash !== b.slash || (hijri && a.precision !== 1))
		return value;
	return `${first}-${last}${hijri ? " هـ" : ""}`;
}

/** D33 source-only display rule; observed reader output remains unchanged. */
export function expectedExportTextDisplay(source: string): string {
	return source
		.replace(/[٠-٩۰-۹]/gu, (char) => String(char.charCodeAt(0) - (char <= "٩" ? 0x660 : 0x6f0)))
		.replace(/[\u064B-\u0652\u0670]/gu, "");
}
