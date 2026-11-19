import type { ExtractedDocument, TextLine } from "../types";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { normalizeSectionHeading, PDF_SECTION_HEADING_LOOKUP } from "../../ats/section-aliases";

export const hasArabicContent = (text: string) => /\p{Script=Arabic}/u.test(text.replace(/[^\p{L}]/gu, ""));
export const startsWithArabicText = (text: string) => hasArabicContent(text.match(/[\p{L}\p{M}]+/u)?.[0] ?? "");

function normalize(text: string): string {
	return normalizeNumericDigits(text.normalize("NFKC"))
		.replace(/[\p{M}\u0640\u200B-\u200F\u202A-\u202E\u2066-\u2069]/gu, "")
		.replace(/[أإآ]/g, "ا");
}

const words = (text: string) => normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];

// Suffixes alone are ambiguous: تقني، سعودي، علي are not possessive pronouns.
const FIRST_PERSON = new Set("انا انني قمت عملت لي نفسي خبرتي مهاراتي انجازاتي مهامي قدرتي فريقي".split(" "));
export const arabicFirstPersonCount = (text: string) =>
	words(text).filter((word) => FIRST_PERSON.has(word) || (word.startsWith("و") && FIRST_PERSON.has(word.slice(1))))
		.length;

const WEAK_OPENINGS = /^(?:و)?(?:ساعدت|شاركت|ساهمت|عملت|كنت\s+مسؤولا?\s+عن|تم)(?![\p{L}\p{N}])/u;
const ACTIONS = new Set(
	"قاد قدت طور حسن خفض زاد زدت صمم نفذ انشا اطلق حقق حلل نسق ربط وثق وحد نظم بنى بنيت اعد اتم اتممت ادار ادرت ابتكر انتج عزز درب اسس خطط حل حللت اختبر راجع سلم وفر راس تراس اشرف نشر كتب كتبت صان صنت امن دمج بسط برمج صغت صاغ تفاوض استحدث استبدل استعاد استعدت قلص رفع اتمت قدم انجز استثمر".split(
		" ",
	),
);

export function startsWithArabicAction(text: string): boolean {
	const normalized = normalize(text).trim();
	if (WEAK_OPENINGS.test(normalized)) return false;
	const first = words(normalized)[0] ?? "";
	const verb = first.startsWith("و") && !ACTIONS.has(first) ? first.slice(1) : first;
	return ACTIONS.has(verb) || (verb.endsWith("ت") && ACTIONS.has(verb.slice(0, -1)));
}

const NUMBER_WORDS = new Set(
	"ثلاث ثلاثة اربع اربعة خمس خمسة ست ستة سبع سبعة ثمان ثماني ثمانية تسع تسعة عشر عشرة عشرين عشرون ثلاثين ثلاثون اربعين اربعون خمسين خمسون ستين ستون سبعين سبعون ثمانين ثمانون تسعين تسعون مئة مائة مئتين مائتين الف الفين الاف".split(
		" ",
	),
);
const METRIC_UNITS =
	/^(?:بالمئة|بالمائة|فرق|فريق|فريقا|طلب|طلبات|مشروع|مشاريع|عميل|عملاء|مستخدم|مستخدمين|موظف|موظفين|تقرير|تقارير|ساعة|ساعات|يوم|ايام|ريال|ريالات|مرحلة|مراحل|خدمة|خدمات)$/u;

export function isArabicQuantified(text: string): boolean {
	const normalized = normalize(text).replace(/[٬]/g, ",").replace(/[٫]/g, ".");
	if (/\d+(?:[.,]\d+)?\s*[%٪]|[$€£¥]\s*\d|\d+\s*[x×](?!\p{L})/iu.test(normalized)) return true;
	if (
		(normalized.match(/(?<![\p{L}\p{N}])\d[\d,.]*(?![\p{L}\p{N}])/gu) ?? []).some((value) => {
			const numeric = Number(value.replaceAll(",", ""));
			return Number.isFinite(numeric) && numeric >= 3 && !/^(?:19|20)\d{2}$/.test(value);
		})
	)
		return true;
	const tokens = words(normalized);
	return tokens.some((word, index) => NUMBER_WORDS.has(word) && METRIC_UNITS.test(tokens[index + 1] ?? ""));
}

export const isLongArabicBullet = (text: string) => words(text).length > 40;

const PREFIX = /^\s*(?:[•▪◦‣·∙●○■□▶▸*+\uE000-\uF8FF]|[-–—]\s)\s*/u;
const SUFFIX = /\s*[•▪◦‣·∙●○■□▶▸\uE000-\uF8FF]\s*$/u;

/** Join only adjacent, aligned Arabic continuation lines, never whole roles or columns. */
export function arabicBullets(document: ExtractedDocument): { text: string; lines: TextLine[] }[] {
	const bullets: { text: string; lines: TextLine[] }[] = [];
	let previous: TextLine | undefined;
	for (const line of document.lines) {
		const text = line.text.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/gu, "").trim();
		if (PREFIX.test(text) || (hasArabicContent(text) && SUFFIX.test(text))) {
			bullets.push({ text: text.replace(PREFIX, "").replace(SUFFIX, "").trim(), lines: [line] });
			previous = line;
			continue;
		}
		const gap = previous ? line.y - previous.y - previous.height : Infinity;
		const sameColumn =
			previous &&
			(Math.abs(line.x - previous.x) < line.fontSize * 2 ||
				Math.abs(line.x + line.width - previous.x - previous.width) < line.fontSize * 2);
		if (
			previous &&
			line.page === previous.page &&
			hasArabicContent(text) &&
			!PDF_SECTION_HEADING_LOOKUP.has(normalizeSectionHeading(text)) &&
			line.fontSize === previous.fontSize &&
			gap >= -1 &&
			gap <= line.fontSize * 0.6 &&
			sameColumn
		) {
			const bullet = bullets[bullets.length - 1];
			if (bullet) {
				bullet.text += ` ${text}`;
				bullet.lines.push(line);
			}
			previous = line;
		} else previous = undefined;
	}
	return bullets.filter((bullet) => Boolean(bullet.text));
}

export const arabicBulletBodies = (document: ExtractedDocument): string[] =>
	arabicBullets(document).map((bullet) => bullet.text);
