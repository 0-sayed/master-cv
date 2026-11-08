import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { forEachDatedEntry, formatResumeDates } from "@reactive-resume/schema/resume/dates";
import { isRTL } from "@reactive-resume/utils/locale";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";

// Numeric endpoints only: never infer calendars or rewrite a labelled/raw date.
const endpoint = String.raw`(?:\d{4}(?:-\d{2})?|\d{1,2}/\d{4}|\d{1,2}/\d{1,2}/\d{4})`;
const range = new RegExp(`^(${endpoint})\\s*[–—-]\\s*(${endpoint})$`, "u");
const ongoing = new RegExp(`^(${endpoint})\\s*[–—-]\\s*(.+)$`, "u");

const displayEndpoint = (value: string): string => value.replace(/^(\d{4})-(\d{2})$/u, "$2/$1");

type DateDisplay = { text: string };

/** PDF-only projection: structured RTL months use MM/YYYY regardless of the saved display preference. */
export function pdfDateDisplayData(data: ResumeData): ResumeData {
	if (!isRTL(data.metadata.page.locale)) return data;
	const display = structuredClone(data);
	forEachDatedEntry(display, (entry, field) => {
		if (!entry.dates || entry.dates.raw !== undefined) return;
		const text = formatResumeDates(entry.dates, { locale: data.metadata.page.locale, format: "numeric" });
		if (field === "period" && "period" in entry) entry.period = text;
		else if (field === "date" && "date" in entry) entry.date = text;
	});
	return display;
}

/** Display only: the text primitive places the start at the right in RTL documents. */
export function dateDisplay(value: string, locale: string): DateDisplay {
	const text = normalizeNumericDigits(value);
	if (!isRTL(locale)) return { text };
	const closed = range.exec(text);
	if (closed?.[1] && closed[2]) {
		const endpoints = [displayEndpoint(closed[1]), displayEndpoint(closed[2])] as const;
		return { text: endpoints.join(" - ") };
	}
	const open = ongoing.exec(text);
	if (open?.[1] && open[2] && /^(?:حتى الآن|حالياً|حاليا|الآن|الحاضر)$/u.test(open[2])) {
		const endpoints = [displayEndpoint(open[1]), open[2]] as const;
		return { text: endpoints.join(" - ") };
	}
	return { text: displayEndpoint(text) };
}
