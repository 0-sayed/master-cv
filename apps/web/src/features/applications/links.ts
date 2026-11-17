/** Job and meeting links allow browser navigation only over HTTP(S). */
export function isHttpLink(value: string) {
	const text = value.trim();
	if (/\s/.test(text) || !URL.canParse(text)) return false;
	return ["http:", "https:"].includes(new URL(text).protocol);
}
