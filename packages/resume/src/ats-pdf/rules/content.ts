import type { PdfCheck, PdfCheckContext } from "../types";
import { hasArabicContent } from "../analyze/arabic-content";
import {
	bulletLines,
	firstPersonCount,
	isLongBullet,
	isQuantified,
	startsWithActionVerb,
	uppercaseHeavy,
} from "../analyze/semantics";
import {
	bulletEvidence,
	check,
	dateEvidence,
	fail,
	failIf,
	hasNoText,
	pass,
	roundRatio,
	skip,
	snippet,
	lineEvidence,
} from "./helpers";
import { THRESHOLDS } from "./thresholds";

/**
 * Content advice. Every rule in this file is a tip, and no tip moves any number in the report.
 *
 * These are human-preference items — how a reader reacts to a bullet, not whether software can
 * read it — and folding them into a score would be inventing precision that does not exist.
 */

function bulletBodies(context: PdfCheckContext): string[] {
	return context.doc.lines
		.map((line) => line.text.trim())
		.filter((text) => /^\s*(?:[•▪◦‣·∙●○■□▶▸*+]|[-–—]\s)/.test(text))
		.map((text) => text.replace(/^\s*(?:[•▪◦‣·∙●○■□▶▸*+]|[-–—])\s*/, "").trim())
		.filter(Boolean);
}

function guardBullets(context: PdfCheckContext, arabicSupported = true) {
	if (hasNoText(context)) return skip("no-text");
	if (!context.semantics.quality.isEnglish && !(arabicSupported && hasArabicContent(context.doc.fullText)))
		return skip("not-english");
	if (context.semantics.bulletLineCount < THRESHOLDS.content.minBulletsForContentAdvice) {
		return skip("insufficient-data");
	}
	return null;
}

export const contentChecks: readonly PdfCheck[] = [
	check("NO_QUANTIFIED_IMPACT", (context) => {
		const blocked = guardBullets(context);
		if (blocked) return blocked;

		const count = hasArabicContent(context.doc.fullText)
			? context.semantics.bulletLineCount
			: bulletBodies(context).length;
		if (count === 0) return skip("insufficient-data");

		const share = context.semantics.quantifiedBulletCount / count;
		return failIf(
			share < THRESHOLDS.content.quantifiedBulletShare,
			"NO_QUANTIFIED_IMPACT",
			{
				share: roundRatio(share),
			},
			bulletEvidence(bulletLines(context.doc).filter((bullet) => !isQuantified(bullet.text))),
		);
	}),

	check("WEAK_ACTION_VERBS", (context) => {
		const blocked = guardBullets(context);
		if (blocked) return blocked;

		const count = hasArabicContent(context.doc.fullText)
			? context.semantics.bulletLineCount
			: bulletBodies(context).length;
		if (count === 0) return skip("insufficient-data");

		const share = context.semantics.actionVerbBulletCount / count;
		return failIf(
			share < THRESHOLDS.content.actionVerbBulletShare,
			"WEAK_ACTION_VERBS",
			{
				share: roundRatio(share),
			},
			bulletEvidence(bulletLines(context.doc).filter((bullet) => !startsWithActionVerb(bullet.text))),
		);
	}),

	check("FIRST_PERSON_PRONOUNS", (context) => {
		if (hasNoText(context)) return skip("no-text");
		if (!context.semantics.quality.isEnglish && !hasArabicContent(context.doc.fullText)) return skip("not-english");

		const locations = context.doc.lines.flatMap((line) =>
			line.spans
				.filter((span) => firstPersonCount(span.text) > 0)
				.map((span) => ({
					page: line.page,
					snippet: snippet(span.text),
					box: { x: span.x, y: span.y, width: span.width, height: span.height },
				})),
		);
		const first = locations[0];
		return failIf(
			context.semantics.firstPersonCount > THRESHOLDS.content.maxFirstPersonMentions,
			"FIRST_PERSON_PRONOUNS",
			{ count: context.semantics.firstPersonCount },
			first ? { ...first, locations } : undefined,
		);
	}),

	check("LONG_BULLETS", (context) => {
		const blocked = guardBullets(context);
		if (blocked) return blocked;

		return failIf(
			context.semantics.longBulletCount > 0,
			"LONG_BULLETS",
			{
				count: context.semantics.longBulletCount,
			},
			bulletEvidence(bulletLines(context.doc).filter((bullet) => isLongBullet(bullet.text))),
		);
	}),

	check("HIGH_PAGE_COUNT", (context) =>
		failIf(context.raw.pageCount > THRESHOLDS.pages.highPageCount, "HIGH_PAGE_COUNT", {
			pages: context.raw.pageCount,
		}),
	),

	check("EMPLOYMENT_GAP", (context) => {
		const gaps = context.semantics.employmentGapYears;
		const [gap] = gaps;
		if (!gap) return pass;

		const tokens = [...new Set(gaps.flatMap((item) => [item.before, item.after]))].sort(
			(a, b) => a.lineIndex - b.lineIndex,
		);
		return fail(
			"EMPLOYMENT_GAP",
			{ from: gap.from, to: gap.to, count: gaps.length },
			dateEvidence(tokens, context.doc.lines),
		);
	}),

	check("ALL_CAPS_RUNS", (context) => {
		if (hasNoText(context)) return skip("no-text");

		return failIf(
			context.semantics.allCapsLineCount > THRESHOLDS.content.allCapsLineCount,
			"ALL_CAPS_RUNS",
			{
				count: context.semantics.allCapsLineCount,
			},
			lineEvidence(context.doc.lines.filter((line) => uppercaseHeavy(line.text))),
		);
	}),

	check("REPEATED_PHRASES", (context) => {
		const blocked = guardBullets(context, false);
		if (blocked) return blocked;

		const [repeated] = context.semantics.repeatedBulletOpenings;
		if (!repeated) return pass;

		return fail(
			"REPEATED_PHRASES",
			{ count: context.semantics.repeatedBulletOpenings.length },
			{
				snippet: snippet(repeated),
			},
		);
	}),
];
