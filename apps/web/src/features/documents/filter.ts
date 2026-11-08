import type { RouterOutput } from "@/libs/orpc/client";
import type { UiLocale } from "@reactive-resume/utils/locale";
import { normalizeSearchText } from "@reactive-resume/utils/ui-format";

export type DocumentSummary = RouterOutput["documents"]["list"][number];
export type DocumentTypeFilter = "all" | "resume" | "letter";
export type DocumentSort = "edited" | "name" | "created";

type DocumentFilters = {
	type: DocumentTypeFilter;
	q: string;
	tags: readonly string[];
	sort: DocumentSort;
	/** Only resumes whose public link is on. */
	public?: boolean | undefined;
};

/** Search covers titles, tags and linked applications; every chosen tag must be on the document, and Public keeps shared resumes. */
export function filterDocuments(documents: readonly DocumentSummary[], filters: DocumentFilters, uiLocale: UiLocale) {
	const byName = new Intl.Collator(uiLocale, { sensitivity: "variant", numeric: true });
	const compareText = (value: string) => normalizeSearchText(value).toLocaleLowerCase(uiLocale);
	const query = compareText(filters.q.trim());

	return documents
		.filter((document) => filters.type === "all" || document.type === filters.type)
		.filter((document) => filters.tags.every((tag) => document.tags.includes(tag)))
		.filter((document) => !filters.public || document.isPublic)
		.filter((document) => {
			if (!query) return true;
			const haystack = [document.name, ...document.tags, document.application?.company, document.application?.role];
			return haystack.some((text) => text !== undefined && compareText(text).includes(query));
		})
		.sort((a, b) => {
			const primary =
				filters.sort === "name"
					? byName.compare(a.name, b.name)
					: filters.sort === "created"
						? b.createdAt.getTime() - a.createdAt.getTime()
						: b.updatedAt.getTime() - a.updatedAt.getTime();
			return primary || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.type.localeCompare(b.type, "en-US"));
		});
}

/** Every tag in use, alphabetically; the tag chips appear only when there are some. */
export const collectTags = (documents: readonly DocumentSummary[], uiLocale: UiLocale) =>
	[...new Set(documents.flatMap((document) => document.tags))].sort(
		new Intl.Collator(uiLocale, { numeric: true, sensitivity: "variant" }).compare,
	);

/** Days until a document in Trash is deleted for good (at least 0). */
export function daysLeftInTrash(trashedAt: Date, now = Date.now()) {
	const left = trashedAt.getTime() + 30 * 24 * 60 * 60 * 1000 - now;
	return Math.max(0, Math.ceil(left / (24 * 60 * 60 * 1000)));
}

/** A resume's public address, or null while its link is off. */
export const publicResumeUrl = (document: DocumentSummary, username: string | undefined) =>
	document.type === "resume" && document.isPublic && document.slug && username
		? `${window.location.origin}/${username}/${document.slug}`
		: null;
