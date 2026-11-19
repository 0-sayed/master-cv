import type { ExtractedDocument, TextLine } from "../types";
import { normalizeSectionHeading, PDF_SECTION_HEADING_LOOKUP } from "../../ats/section-aliases";
import { columnSegments } from "../extract";
import { hasArabicContent } from "./arabic-content";

const PREFIX = /^\s*(?:[•▪◦‣·∙●○■□▶▸\uE000-\uF8FF]|[-–—*+]\s)\s*/u;
const SUFFIX = /\s*[•▪◦‣·∙●○■□▶▸\uE000-\uF8FF]\s*$/u;

/** Join adjacent, aligned continuation lines in either language, never whole roles or columns. */
export function collectBullets(document: ExtractedDocument): { text: string; lines: TextLine[] }[] {
	const bullets: { text: string; lines: TextLine[] }[] = [];
	for (const line of document.lines.flatMap(columnSegments)) {
		const text = line.text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/gu, "").trim();
		if (PREFIX.test(text) || (hasArabicContent(text) && SUFFIX.test(text))) {
			bullets.push({ text: text.replace(PREFIX, "").replace(SUFFIX, "").trim(), lines: [line] });
			continue;
		}
		if (PDF_SECTION_HEADING_LOOKUP.has(normalizeSectionHeading(text))) continue;
		const bullet = bullets.findLast((candidate) => {
			const previous = candidate.lines.at(-1);
			if (!previous) return false;
			const gap = line.y - previous.y - previous.height;
			const aligned =
				Math.abs(line.x - previous.x) < line.fontSize * 2 ||
				Math.abs(line.x + line.width - previous.x - previous.width) < line.fontSize * 2;
			return (
				line.page === previous.page &&
				line.fontSize === previous.fontSize &&
				gap >= -1 &&
				gap <= line.fontSize * 0.6 &&
				aligned
			);
		});
		if (bullet) {
			bullet.text += ` ${text}`;
			bullet.lines.push(line);
		}
	}
	return bullets.filter((bullet) => Boolean(bullet.text));
}
