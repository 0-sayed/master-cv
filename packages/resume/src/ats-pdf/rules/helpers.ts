import type { PdfRuleCode } from "../catalog";
import type {
	PdfCheck,
	PdfCheckContext,
	PdfCheckOutcome,
	PdfEvidence,
	PdfFinding,
	PdfFindingParams,
	PdfSkipReason,
	TextLine,
	DateToken,
} from "../types";
import { pdfRuleCategory, pdfRuleSeverity } from "../catalog";
import { columnSegments, orderTextSpans } from "../extract";

export const pass: PdfCheckOutcome = { status: "pass" };

export const skip = (reason: PdfSkipReason): PdfCheckOutcome => ({ status: "skip", reason });

function finding(code: PdfRuleCode, params?: PdfFindingParams, evidence?: PdfEvidence): PdfFinding {
	return {
		code,
		severity: pdfRuleSeverity(code),
		category: pdfRuleCategory(code),
		...(params ? { params } : {}),
		...(evidence ? { evidence } : {}),
	};
}

export const fail = (code: PdfRuleCode, params?: PdfFindingParams, evidence?: PdfEvidence): PdfCheckOutcome => ({
	status: "fail",
	findings: [finding(code, params, evidence)],
});

/** `condition ? fail : pass`, for the many checks that are exactly that. */
export const failIf = (
	condition: boolean,
	code: PdfRuleCode,
	params?: PdfFindingParams,
	evidence?: PdfEvidence,
): PdfCheckOutcome => (condition ? fail(code, params, evidence) : pass);

export function check(code: PdfRuleCode, run: (context: PdfCheckContext) => PdfCheckOutcome): PdfCheck {
	return { code, run };
}

/** True when extraction contains no usable letters or digits. */
export const hasNoText = (context: PdfCheckContext) => !/[\p{L}\p{N}]/u.test(context.doc.fullText);

/** Trims a snippet down to something a report row can show without wrapping three times. */
export function snippet(value: string, maxLength = 120): string {
	const collapsed = value.replace(/\s+/g, " ").trim();
	return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength - 1)}…`;
}

export const roundRatio = (value: number) => Math.round(value * 100);

export function lineEvidence(lines: readonly TextLine[]): PdfEvidence | undefined {
	const locations = lines.map((line) => ({
		page: line.page,
		box: { x: line.x, y: line.y, width: line.width, height: line.height },
		snippet: snippet(line.text),
	}));
	const first = locations[0];
	return first ? { ...first, locations } : undefined;
}

export function bulletEvidence(bullets: readonly { text: string; lines: TextLine[] }[]): PdfEvidence | undefined {
	const lines = bullets.flatMap((bullet) => {
		const first = bullet.lines[0];
		if (!first) return [];
		const marker = first.spans.find((span) => /[•▪◦‣·∙●○■□▶▸*+\uE000-\uF8FF]|^\s*[-–—]\s/u.test(span.text));
		if (!marker) return [];
		const body = marker.text.replace(/[•▪◦‣·∙●○■□▶▸*+\uE000-\uF8FF]/gu, "").trim()
			? marker
			: first.spans
					.filter((span) => span !== marker)
					.sort((a, b) => Math.abs(a.x + a.width / 2 - marker.x) - Math.abs(b.x + b.width / 2 - marker.x))[0];
		if (!body) return [];
		const left = body.x;
		const right = body.x + body.width;
		return bullet.lines.flatMap((line) => {
			const spans = line.spans.filter((span) => span === marker || (span.x < right && span.x + span.width > left));
			if (!spans.length) return [];
			const x = Math.min(...spans.map((span) => span.x));
			const y = Math.min(...spans.map((span) => span.y));
			return [
				{
					...line,
					text: orderTextSpans(spans)
						.map((span) => span.text)
						.join(" "),
					x,
					y,
					width: Math.max(...spans.map((span) => span.x + span.width)) - x,
					height: Math.max(...spans.map((span) => span.y + span.height)) - y,
				},
			];
		});
	});
	return lineEvidence(lines);
}

export function dateEvidence(tokens: readonly DateToken[], lines: readonly TextLine[]): PdfEvidence | undefined {
	const locations = tokens.flatMap((token) => {
		const line = lines[token.lineIndex];
		if (!line) return [];
		const needle = token.raw.replace(/\s/g, "");
		const segment =
			token.segmentX === undefined ? line : columnSegments(line).find((item) => item.x === token.segmentX);
		const spans = orderTextSpans(segment?.spans ?? []);
		for (let start = spans.length - 1; start >= 0; start--) {
			let text = "";
			for (let end = start; end < spans.length; end++) {
				text += spans[end]?.text.replace(/\s/g, "") ?? "";
				if (!text.includes(needle)) continue;
				const matches = spans.slice(start, end + 1);
				const x = Math.min(...matches.map((span) => span.x));
				const y = Math.min(...matches.map((span) => span.y));
				return [
					{
						page: line.page,
						snippet: token.raw,
						box: {
							x,
							y,
							width: Math.max(...matches.map((span) => span.x + span.width)) - x,
							height: Math.max(...matches.map((span) => span.y + span.height)) - y,
						},
					},
				];
			}
		}
		return [];
	});
	const first = locations[0];
	return first ? { ...first, locations } : undefined;
}
