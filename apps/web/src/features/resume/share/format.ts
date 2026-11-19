import type { RouterOutput } from "@/libs/orpc/client";
import { t } from "@lingui/core/macro";
import { formatInterfaceDate, getInterfaceDateLocale } from "@/libs/locale";
import { formatRelativeTimeUnit } from "@/libs/locale";

type DailyStat = { date: string; views: number; downloads: number };
export type VersionSummary = RouterOutput["resume"]["listVersions"][number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The Link tab's numbers: views and downloads over the last 30 days, and each day's views against the peak. */
export function summarizeViews(daily: readonly DailyStat[]) {
	const days = daily.slice(-30);
	const peak = Math.max(0, ...days.map((day) => day.views));

	return {
		views: days.reduce((sum, day) => sum + day.views, 0),
		downloads: days.reduce((sum, day) => sum + day.downloads, 0),
		peak,
		bars: days.map((day) => ({ date: day.date, views: day.views, height: peak > 0 ? day.views / peak : 0 })),
	};
}

const UNITS = [
	{ unit: "minute", ms: 60 * 1000, below: 60 },
	{ unit: "hour", ms: 60 * 60 * 1000, below: 24 },
	{ unit: "day", ms: DAY_MS, below: 7 },
	{ unit: "week", ms: 7 * DAY_MS, below: 52 },
	{ unit: "year", ms: 365 * DAY_MS, below: Number.POSITIVE_INFINITY },
] as const;

/** Time since a moment in the largest whole unit, using the interface locale's long relative-time phrase. */
export function formatTimeSince(date: Date, locale: string, now = Date.now()) {
	const elapsed = Math.max(0, now - date.getTime());
	const { unit, ms } = UNITS.find(({ ms, below }) => elapsed / ms < below) ?? UNITS[4];
	return formatRelativeTimeUnit(-Math.floor(elapsed / ms), unit, locale);
}

function riyadhDay(date: Date) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Riyadh",
		calendar: "gregory",
		numberingSystem: "latn",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
	const year = part("year");
	const month = part("month");
	const day = part("day");
	return {
		key: `${year}-${month}-${day}`,
		year,
		ordinal: Date.UTC(Number(year), Number(month) - 1, Number(day)) / DAY_MS,
	};
}

function dayLabel(date: Date, locale: string, now: Date) {
	const day = riyadhDay(date);
	const today = riyadhDay(now);
	const dateLabel = formatInterfaceDate(date, locale, {
		month: "short",
		day: "numeric",
		...(day.year !== today.year ? { year: "numeric" } : {}),
	});
	const difference = day.ordinal - today.ordinal;
	const relative =
		difference === 0 || difference === -1
			? new Intl.RelativeTimeFormat(getInterfaceDateLocale(locale), { numeric: "auto" }).format(difference, "day")
			: null;
	return {
		key: day.key,
		dateLabel,
		label: relative ? relative.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase(locale)) : dateLabel,
	};
}

export function groupVersionsByDay(
	versions: readonly VersionSummary[],
	locale: string,
	now = new Date(),
): Array<{ key: string; label: string; dateLabel: string; versions: VersionSummary[] }> {
	const groups = new Map<string, { key: string; label: string; dateLabel: string; versions: VersionSummary[] }>();
	for (const version of [...versions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
		const day = dayLabel(version.createdAt, locale, now);
		const group: { key: string; label: string; dateLabel: string; versions: VersionSummary[] } = groups.get(
			day.key,
		) ?? {
			...day,
			versions: [],
		};
		group.versions.push(version);
		groups.set(day.key, group);
	}
	return [...groups.values()];
}

export function formatVersionTime(date: Date, locale: string, now = new Date()) {
	const { label } = dayLabel(date, locale, now);
	return `${label} · ${formatInterfaceDate(date, locale, { hour: "2-digit", minute: "2-digit" })}`;
}

export const formatVersionMoment = (date: Date, locale: string) =>
	formatInterfaceDate(date, locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

/** A version's title in History: its name when the user named it, otherwise what made it. */
export function getVersionTitle(version: Pick<VersionSummary, "kind" | "name">) {
	switch (version.kind) {
		case "named":
			return version.name || t`Named version`;
		case "created":
			return t`Created`;
		case "import":
			return t`Imported`;
		case "auto":
			return t`Editing session`;
		case "before-restore":
			return t`Before restore`;
		case "restored":
			return t`Restored a version`;
		case "ai":
			return t`AI edit`;
		case "sent":
			// Sent versions are named after the company they went to.
			return version.name ? t`Sent to ${version.name}` : t`Sent`;
	}
}

/** The line under a version's title: how it was saved. */
export function getVersionDetail(version: Pick<VersionSummary, "kind">) {
	switch (version.kind) {
		case "named":
			return t`named`;
		case "auto":
		case "before-restore":
			return t`autosaved`;
		case "ai":
			return t`from the assistant or API`;
		default:
			return t`saved`;
	}
}
