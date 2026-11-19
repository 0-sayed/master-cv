import sanitizeHtml from "sanitize-html";
import { masterFactInputSchema, type MasterFactInput } from "@reactive-resume/schema/career-master";

export function careerPlainText(value: string): string {
	if (!/<\/?[a-z][^>]*>/i.test(value)) return value;
	let result = "";
	const separated = value.replace(/<br\s*\/?\s*>|<\/(?:p|div|li|ul|ol|h[1-6]|blockquote|tr)>/gi, "\n");
	sanitizeHtml(`<div>${separated}</div>`, {
		allowedTags: ["div"],
		allowedAttributes: {},
		nonTextTags: ["script", "style", "noscript", "template", "textarea", "svg"],
		exclusiveFilter(frame) {
			if (frame.tag === "div") result = frame.text;
			return false;
		},
	});
	return result
		.replace(/\u00a0/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{2,}/g, "\n")
		.trim();
}

function plainValue(value: unknown): unknown {
	if (typeof value === "string") return careerPlainText(value);
	if (Array.isArray(value)) return value.map(plainValue);
	if (value && typeof value === "object")
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainValue(item)]));
	return value;
}

export function plainMasterFact(input: MasterFactInput): MasterFactInput {
	return masterFactInputSchema.parse({
		...input,
		value: plainValue(input.value),
		source: { ...input.source, quote: careerPlainText(input.source.quote) },
	});
}
