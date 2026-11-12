import { z } from "zod";

const selection = z.strictObject({
	section: z.enum(["summary", "experience", "education", "skills", "projects", "languages"]),
	confirmed: z.literal(true),
	text: z.string().max(128000),
});
const payloadSchema = z.strictObject({
	selections: z
		.array(z.strictObject({ section: selection.shape.section, text: z.string() }))
		.min(1)
		.max(50),
});
export type ModelPayload = z.infer<typeof payloadSchema>;
export type ModelPayloadInput = {
	selections: { section: string; confirmed: boolean; text: string }[];
	contactValues: string[];
};

export function buildModelPayload(input: ModelPayloadInput): ModelPayload {
	const parsed = z
		.object({ selections: z.array(selection).min(1).max(50), contactValues: z.array(z.string()).max(100) })
		.parse(input);
	const selections = parsed.selections.map(({ section, text }) => {
		// Markup, evidence locators, transcripts and attachments never enter the model contract.
		let clean = text
			.normalize("NFKC")
			.replace(/\p{Cf}/gu, "")
			.replace(/<[^>]*>/g, " ");
		// Reject entity-encoded input rather than bypass redaction with an alternate spelling.
		if (/&(?:#\w+|[a-z]+);/i.test(clean)) throw new Error("AI_PAYLOAD_ENCODING");
		for (const contact of parsed.contactValues.filter((v) => v.trim().length > 0).sort((a, b) => b.length - a.length)) {
			// Match rendered contact characters even when formatting inserts or removes whitespace.
			const characters = [...contact.normalize("NFKC").replace(/\p{Cf}/gu, "")].filter(
				(character) => !/\s/u.test(character),
			);
			if (!characters.length) continue;
			const pattern = characters.map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
			clean = clean.replaceAll(new RegExp(pattern, "giu"), "[redacted]");
		}
		clean = clean
			.replace(/[\p{L}\p{M}\p{N}_.+%-]+@[\p{L}\p{M}\p{N}.-]+\.(?:xn--[a-z0-9-]+|[\p{L}\p{M}]{2,})/giu, "[redacted]")
			.replace(/(?:https?:\/\/|www\.)[^\s<>]+/giu, "[redacted]")
			.replace(
				/(?<![\p{L}\p{M}\p{N}_])[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?(?:\.[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?)*\.(?:xn--[a-z0-9-]+|[\p{L}\p{M}]{2,})(?:[/?#][^\s<>]*)?/giu,
				"[redacted]",
			)
			.replace(/@[\p{L}\p{M}\p{N}_][\p{L}\p{M}\p{N}_.-]*/gu, "[redacted]");
		// Match factual dates/year ranges before phone candidates so chronology survives redaction.
		clean = clean.replace(
			/(?<!\p{N})(?:(?<date>(?:\d{2}\/)?(?:19|20)\d{2}\s*[-–—]\s*(?:\d{2}\/)?(?:19|20)\d{2}|(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/](?:19|20)\d{2})|\+?\p{Nd}[\p{Nd}\s()./-]{5,}\p{Nd})(?!\p{N})/gu,
			(value, date: string | undefined) => (date || (value.match(/\p{Nd}/gu)?.length ?? 0) < 7 ? value : "[redacted]"),
		);
		return { section, text: clean.replace(/\s+/gu, " ").trim() };
	});
	const payload = payloadSchema.parse({ selections });
	if ([...JSON.stringify(payload)].length > 32000) throw new Error("AI_INPUT_LIMIT");
	return payload;
}
