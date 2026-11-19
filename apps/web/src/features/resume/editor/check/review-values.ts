import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { i18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import {
	formatResumeDates,
	formatYearMonth,
	readLegacyDates,
	resumeDatesSchema,
} from "@reactive-resume/schema/resume/dates";
import { templateSchema } from "@reactive-resume/schema/templates";
import { parseColorString } from "@reactive-resume/utils/color";
import { getSectionName } from "./issues";
import { templates } from "@/dialogs/resume/template/data";

export type ReviewValue = { text: string; kind: "text" | "token" | "color"; color?: string };

const rawValue =
	/^(?:true|false|null|undefined|\[object Object\]|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}|c[a-z\d]{24,}|[a-f\d]{24,})$/i;

function safeText(value: string): string {
	const text = value.trim();
	if (!text || rawValue.test(text)) return t`Not set`;
	if (/^[{[]/.test(text)) {
		try {
			if (typeof JSON.parse(text) === "object") return t`CV content`;
		} catch {
			/* Candidate text can start with a bracket without being JSON. */
		}
	}
	return text;
}

function colorName(value: string): string | undefined {
	const color = parseColorString(value);
	if (!color || !Object.values(color).every(Number.isFinite)) return;
	const { r, g, b, a } = color;
	if (a === 0) return t`Transparent`;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	if (max - min < 25) return max < 50 ? t`Black` : min > 220 ? t`White` : t`Gray`;
	if (r > g * 1.5 && r > b * 1.5) return t`Red`;
	if (g > r * 1.2 && g > b * 1.2) return t`Green`;
	if (b > r * 1.2 && b > g * 1.2) return t`Blue`;
	if (r > b * 1.5 && g > b * 1.5) return t`Yellow`;
	if (r > g && b > g) return t`Purple`;
	return t`Teal`;
}

/** Display values stay separate from the typed values that explicit acceptance applies. */
export function formatReviewValue(path: readonly string[], value: unknown, data: ResumeData): ReviewValue {
	const field = path.at(-1);
	const text = (label: string): ReviewValue => ({ text: safeText(label), kind: "text" });
	if (value === null || value === undefined || value === "") return text(t`Not set`);
	if (field === "id") return text(t`CV item`);
	if (field === "fullWidth") return text(value ? t`One column` : t`Two columns`);
	if (typeof value === "boolean") {
		if (field === "hidden") {
			if (path[0] === "picture")
				return text(
					value
						? t({ message: "Hidden", context: "photo visibility" })
						: t({ message: "Visible", context: "photo visibility" }),
				);
			return text(value ? t`Hidden` : t`Visible`);
		}
		return text(value ? t`Enabled` : t`Off`);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) return text(t`Not set`);
		const count = value;
		const number = new Intl.NumberFormat(i18n.locale, { numberingSystem: "latn", maximumFractionDigits: 2 }).format(
			value,
		);
		if (field === "columns")
			return text(
				value === 1
					? t`One column`
					: value === 2
						? t`Two columns`
						: plural(count, { one: "# column", other: "# columns" }),
			);
		if (field === "fontSize" || field === "gapX" || field === "gapY")
			return text(plural(count, { one: "# point", other: "# points" }));
		if (field === "marginX" || field === "marginY") return text(t`${number} mm`);
		if (field === "lineHeight") return text(t`${number}× line height`);
		if (field === "sidebarWidth") return text(t`${number}% of page width`);
		return text(plural(count, { one: "# item", other: "# items" }));
	}
	const dateOptions = { locale: data.metadata.page.locale, format: data.metadata.page.dateFormat };
	if (field === "dates") {
		const dates = resumeDatesSchema.safeParse(value);
		return text(dates.success ? formatResumeDates(dates.data, dateOptions) : t`Not set`);
	}
	if (Array.isArray(value)) {
		if (path.includes("layout") && (field === "main" || field === "sidebar")) {
			return text(
				value
					.flatMap((id) => {
						if (
							typeof id !== "string" ||
							!(id in data.sections || id === "summary" || data.customSections.some((section) => section.id === id))
						)
							return [];
						return [getSectionName(data, id)];
					})
					.join(" · "),
			);
		}
		return text(t`CV content`);
	}
	if (typeof value !== "string") return text(t`CV content`);
	if (field === "template") {
		const template = templateSchema.safeParse(value);
		return text(template.success ? templates[template.data].name : t`Template`);
	}
	if (path.includes("colors") || /color$/i.test(field ?? "")) {
		const name = colorName(value);
		return name ? { kind: "color", text: name, color: value } : text(t`Not set`);
	}
	if (path.includes("dates") && /^\d{4}(?:-\d{2})?$/.test(value)) return text(formatYearMonth(value, dateOptions));
	if (field === "period" || field === "date")
		return text(
			formatResumeDates(readLegacyDates(value, { locale: dateOptions.locale, single: field === "date" }), dateOptions),
		);
	if (field === "layout" || field === "sidebarSide" || field === "dateFormat" || field === "format") {
		const labels: Record<string, string> = {
			inline: t`Inline`,
			grid: t`Grid`,
			stacked: t`Stacked`,
			left: t`Left`,
			right: t`Right`,
			short: t`Short date`,
			long: t`Long date`,
			numeric: t`Numeric date`,
			iso: t`ISO date`,
			a4: "A4",
			letter: t`US Letter`,
			"free-form": t`Free-form`,
		};
		return text(labels[value] ?? t`Custom layout`);
	}
	const display = safeText(value);
	return {
		text: display,
		kind:
			/^(?:https?:\/\/|mailto:)/i.test(value) ||
			/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
			field === "url" ||
			field === "email" ||
			field === "link"
				? "token"
				: "text",
	};
}
