import type { Gold, QualificationCase } from "./types";
import assert from "node:assert/strict";
import { expectedExportDateDisplay, expectedExportTextDisplay } from "./expected-display";

// Source metadata and the curated AR/EN section labels, never harvested reader output.
const headings: Record<string, [string, string]> = {
	summary: ["Summary", "الملخّص"],
	profiles: ["Profiles", "الملفات الشخصية"],
	experience: ["Experience", "الخبرة"],
	education: ["Education", "التعليم"],
	projects: ["Projects", "المشاريع"],
	skills: ["Skills", "المهارات"],
	languages: ["Languages", "اللغات"],
	interests: ["Interests", "الاهتمامات"],
	awards: ["Awards", "الجوائز"],
	certifications: ["Certifications", "الشهادات"],
	publications: ["Publications", "المنشورات"],
	volunteer: ["Volunteer", "التطوع"],
	references: ["References", "المراجعون"],
};

/** A derived policy-specific copy: historical source gold and saved CV data stay byte-for-byte intact. */
export function expectedDisplayGold(input: QualificationCase): Gold {
	const gold = structuredClone(input.gold);
	const data = input.data;
	const dateDisplay = (value: string) =>
		expectedExportTextDisplay(expectedExportDateDisplay(value, data.metadata.page.locale === "ar-SA"));
	if (!["ar-SA", "en-US"].includes(data.metadata.page.locale))
		throw new Error("v2.1 source bounds require curated AR/EN headings");
	const sectionIds = [
		...new Set(data.metadata.layout.pages.flatMap((page) => [...page.main, ...(page.fullWidth ? [] : page.sidebar)])),
	];
	const heading = (id: string) => {
		const pair = headings[id];
		assert(pair, `Unknown source heading ${id}`);
		return pair[data.metadata.page.locale === "ar-SA" ? 1 : 0];
	};
	const sectionHeadings: string[] = [];
	const owners: NonNullable<Gold["entrySpans"]> = [];
	const roleParents = new Set<string>();
	const sourceDates = new Set<string>();
	for (const id of sectionIds) {
		if (id === "summary") {
			if (!data.summary.hidden && data.summary.content && data.summary.showHeading !== false)
				sectionHeadings.push(data.summary.title || heading("summary"));
			continue;
		}
		if (!(id in data.sections)) throw new Error(`v2.1 source bounds do not support custom section ${id}`);
		const section = data.sections[id as keyof typeof data.sections];
		const items = section.items.filter((item) => !item.hidden);
		if (section.hidden || !items.length) continue;
		const sectionHeading = section.showHeading !== false ? section.title || heading(id) : undefined;
		if (sectionHeading) sectionHeadings.push(sectionHeading);
		const occurrences = new Map<string, number>();
		for (const [index, item] of items.entries()) {
			const anchor =
				"company" in item
					? item.company
					: "school" in item
						? item.school
						: "organization" in item
							? item.organization
							: "title" in item
								? item.title
								: "name" in item
									? item.name
									: "";
			if (!anchor.trim()) continue;
			const date = "period" in item ? item.period : "date" in item ? item.date : "";
			if (date) sourceDates.add(date);
			const ownerId = `span:${id}:${index}`;
			const occurrence = occurrences.get(expectedExportTextDisplay(anchor)) ?? 0;
			occurrences.set(expectedExportTextDisplay(anchor), occurrence + 1);
			owners.push({
				id: ownerId,
				anchor,
				dates: date ? [date] : [],
				next: [],
				section: sectionHeading,
				occurrence,
				allowLeading: data.metadata.page.locale === "ar-SA",
			});
			if ("roles" in item) {
				// Undated employers still bound roles belonging to the preceding employer.
				roleParents.add(ownerId);
				const roleOccurrences = new Map<string, number>();
				for (const [roleIndex, role] of item.roles.entries()) {
					if (!role.position.trim() || !role.period) continue;
					sourceDates.add(role.period);
					const occurrence = roleOccurrences.get(expectedExportTextDisplay(role.position)) ?? 0;
					roleOccurrences.set(expectedExportTextDisplay(role.position), occurrence + 1);
					owners.push({
						id: `${ownerId}:role:${roleIndex}`,
						anchor: role.position,
						dates: [role.period],
						next: [],
						section: sectionHeading,
						occurrence,
						after: ownerId,
						allowLeading: data.metadata.page.locale === "ar-SA",
					});
				}
			}
		}
	}
	gold.fields = gold.fields.map((field) => ({
		...field,
		value: expectedExportTextDisplay(field.value),
		...(field.match === "date" ||
		(/^(?:hijri|gregorian|ambiguous)-raw$/u.test(field.id) && sourceDates.has(field.value))
			? { value: dateDisplay(field.value), match: "date" as const }
			: {}),
	}));
	gold.entrySpans = owners
		.filter((owner) => owner.dates.length || roleParents.has(owner.id))
		.map((owner) => ({
			...owner,
			anchor: expectedExportTextDisplay(owner.anchor),
			section: owner.section ? expectedExportTextDisplay(owner.section) : undefined,
			headings: sectionHeadings.map(expectedExportTextDisplay),
			dates: owner.dates.map(dateDisplay),
			next: [...sectionHeadings, ...owners.filter((other) => other !== owner).map((other) => other.anchor)].map(
				expectedExportTextDisplay,
			),
		}));
	gold.text = expectedExportTextDisplay(gold.text);
	gold.order = gold.order.map(([a, b]) => [expectedExportTextDisplay(a), expectedExportTextDisplay(b)]);
	gold.forbidden = gold.forbidden.map(expectedExportTextDisplay);
	return gold;
}
