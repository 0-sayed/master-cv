import type { ElementInfo, LayoutInfo } from "@formepdf/core";
import { NODE_CONTENT_PREFIX, NODE_SOURCE_PREFIX, parseResumeNodeKey } from "../page-map";
import { LIST_ROLE } from "./to-forme";

const sourceKey = (element: ElementInfo) => {
	const source = element.sourceLocation?.file;
	return source?.startsWith(NODE_SOURCE_PREFIX) || source?.startsWith(NODE_CONTENT_PREFIX)
		? source.slice(source.indexOf(":") + 1)
		: undefined;
};

/** Natural heights come from an unfragmented measurement at the same page/column widths. */
export function shortEntries(measured: LayoutInfo, layout: LayoutInfo): Set<string> {
	const limits = new Map<string, number>();
	const visit = (element: ElementInfo, limit: number) => {
		const key = sourceKey(element);
		if (key && parseResumeNodeKey(key)?.kind === "item") limits.set(key, limit);
		element.children.forEach((child) => visit(child, limit));
	};
	for (const page of layout.pages) page.elements.forEach((element) => visit(element, page.contentHeight / 3));
	const kept = new Set<string>();
	const measure = (element: ElementInfo) => {
		const key = sourceKey(element);
		const limit = key ? limits.get(key) : undefined;
		if (
			key &&
			limit &&
			element.sourceLocation?.file.startsWith(NODE_SOURCE_PREFIX) &&
			element.height > 0 &&
			element.height <= limit
		)
			kept.add(key);
		element.children.forEach(measure);
	};
	for (const page of measured.pages) page.elements.forEach(measure);
	return kept;
}

type Line = { page: number; key: string };

/** Forme 0.31 applies widow limits only at the first break of a Text, then uses raw overflow.
 * Reserve the final orphan on that first break too; text runs and Arabic shaping stay untouched. */
export function widowAdjustments(layout: LayoutInfo): Map<string, number> {
	const fragments = new Map<string, { page: number; count: number }[]>();
	for (const [pageIndex, page] of layout.pages.entries()) {
		const visit = (element: ElementInfo) => {
			const key = sourceKey(element);
			const lines = element.children.filter((child) => child.nodeType === "TextLine");
			if (key && lines.length > 0) {
				const counts = fragments.get(key) ?? [];
				counts.push({ page: pageIndex, count: lines.length });
				fragments.set(key, counts);
			}
			element.children.forEach(visit);
		};
		page.elements.forEach(visit);
	}
	return new Map(
		[...fragments].flatMap(([key, counts]) => {
			if (new Set(counts.map((fragment) => fragment.page)).size < 2 || counts.at(-1)?.count !== 1) return [];
			const total = counts.reduce((sum, fragment) => sum + fragment.count, 0);
			return [[key, Math.min(total - 2, total - (counts[0]?.count ?? 0) + 1)]];
		}),
	);
}

/** Keep a heading/header with the first two body lines, including across nested list/row wrappers. */
export function paginationBreaks(layout: LayoutInfo): string[] {
	const groups = new Map<string, Line[]>();
	layout.pages.forEach((page, index) => {
		const visit = (element: ElementInfo, inherited?: string, marker = false) => {
			const key = sourceKey(element) ?? inherited;
			const isMarker = marker || element.sourceLocation?.column === LIST_ROLE.marker;
			if (
				!isMarker &&
				key &&
				element.nodeType === "TextLine" &&
				element.textContent?.trim() &&
				Math.abs(element.y) < 1e6
			) {
				const section = key.match(/^(.+\/section-(?!items(?:\/|$)|heading(?:\/|$))[^/]+)/)?.[1];
				const item = key.match(/^(.+\/section-items\/item-[^/]+)/)?.[1];
				for (const owner of [section, item]) {
					if (!owner) continue;
					const lines = groups.get(owner) ?? [];
					lines.push({ page: index, key });
					groups.set(owner, lines);
				}
			}
			element.children.forEach((child) => visit(child, key, isMarker));
		};
		page.elements.forEach((element) => visit(element));
	});
	const breaks: string[] = [];
	for (const [key, lines] of groups) {
		const isSection = parseResumeNodeKey(key)?.kind === "section";
		const heading = lines.filter((line) => line.key.startsWith(`${key}/section-heading`));
		const content = lines.filter((line) => !line.key.includes("/section-heading"));
		// A section owns only its first entry's opening, not subsequent entries.
		const firstItem = content[0]?.key.match(/^(.+\/section-items\/item-[^/]+)/)?.[1];
		const opening = firstItem
			? content.filter((line) => line.key === firstItem || line.key.startsWith(`${firstItem}/`))
			: content;
		const header = opening.filter((line) => line.key.includes("/item-header"));
		const body = opening.filter((line) => !line.key.includes("/item-header"));
		if (isSection && heading.length === 0) continue;
		if (!isSection && header.length === 0) continue;
		const required = [...heading, ...header, ...body.slice(0, 2)];
		if (new Set(required.map((line) => line.page)).size > 1) breaks.push(key);
		// Paragraph-level widow limits cannot protect a final one-line paragraph or bullet.
		// Move its preceding paragraph too when the entry would otherwise end with one line.
		if (!isSection) {
			const last = body.at(-1);
			const previous = body.at(-2);
			if (last && previous && last.page !== previous.page && last.key !== previous.key) breaks.push(previous.key);
		}
	}
	// Moving the section also moves its first entry; do not break both (which creates a blank gap).
	return breaks.filter((key) => !breaks.some((parent) => key.startsWith(`${parent}/`)));
}
