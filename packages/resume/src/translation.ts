import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { TranslationTarget } from "@reactive-resume/schema/resume/variants";
import { translationTargetSchema } from "@reactive-resume/schema/resume/variants";
import { escapeHtml } from "@reactive-resume/utils/string";
import { isRenderedSection, walkSections } from "./ats/walk";
import { blockText } from "./proposals";
import { hashReviewTarget } from "./review-evidence";

const fields: Record<string, readonly string[]> = {
	experience: ["company", "position", "description"],
	education: ["school", "degree", "area", "description"],
	skills: ["name", "proficiency", "keywords"],
	interests: ["name", "keywords"],
	languages: ["language", "fluency"],
	awards: ["title", "awarder", "description"],
	certifications: ["title", "issuer", "description"],
	projects: ["name", "description"],
	publications: ["title", "publisher", "description"],
	volunteer: ["organization", "description"],
};
const officialFields = new Set([
	"company",
	"school",
	"degree",
	"area",
	"position",
	"issuer",
	"awarder",
	"publisher",
	"organization",
]);
export type TranslationSegment = {
	id: string;
	target: TranslationTarget;
	source: string;
	text: string;
	official: boolean;
};

/** Unsupported visible custom/letter content blocks full-translation claims rather than disappearing. */
export function buildTranslationInventory(data: ResumeData) {
	const segments: TranslationSegment[] = [];
	const blocking: string[] = [];
	const add = (raw: unknown, source: unknown) => {
		if (typeof source !== "string" || !blockText(source)) return;
		const target = translationTargetSchema.parse(raw);
		segments.push({
			id: `translation-${hashReviewTarget(JSON.stringify(target))}`,
			target,
			source,
			text: blockText(source),
			official: officialFields.has(target.field) || (target.sectionId === "certifications" && target.field === "title"),
		});
	};
	add({ sectionId: "basics", field: "headline" }, data.basics.headline);
	for (const section of walkSections(data).filter(isRenderedSection)) {
		if (["profiles", "references"].includes(section.id)) continue;
		if (section.id !== "summary" && !Object.hasOwn(fields, section.id)) {
			if (section.items.length) blocking.push(section.id);
			continue;
		}
		const definition =
			section.id === "summary" ? data.summary : data.sections[section.id as keyof ResumeData["sections"]];
		if (definition.showHeading !== false && section.items.length)
			add({ sectionId: section.id, field: "title" }, section.title);
		if (section.id === "summary") {
			add({ sectionId: "summary", field: "content" }, data.summary.content);
			continue;
		}
		for (const { value } of section.items) {
			for (const field of fields[section.id] ?? []) {
				if (field === "keywords" && Array.isArray(value.keywords))
					value.keywords.forEach((keyword, index) =>
						add({ sectionId: section.id, itemId: value.id, field, index }, keyword),
					);
				else add({ sectionId: section.id, itemId: value.id, field }, value[field]);
			}
			if (section.id === "experience" && Array.isArray(value.roles))
				for (const role of value.roles) {
					if (!role || typeof role !== "object" || !("id" in role)) continue;
					for (const field of ["position", "description"] as const)
						if (field in role) add({ sectionId: section.id, itemId: value.id, roleId: role.id, field }, role[field]);
				}
		}
	}
	return {
		segments,
		blocking,
		exclusions: [
			"personal-name-contact-location-photo-links-dates",
			"profile-and-reference-contact-content",
			"hidden-and-unplaced-content",
			...(blocking.length ? ["unsupported-visible-sections"] : []),
		],
	};
}

/** No arbitrary path setter: even callers inside a transaction must pass the closed schema. */
export function writeTranslationTarget(data: ResumeData, raw: TranslationTarget, value: string) {
	const target = translationTargetSchema.parse(raw);
	if (target.sectionId === "basics") {
		data.basics.headline = value;
		return;
	}
	if (target.sectionId === "summary") {
		if (target.field === "title") data.summary.title = value;
		else data.summary.content = `<p>${escapeHtml(value)}</p>`;
		return;
	}
	const section = data.sections[target.sectionId];
	if (!("itemId" in target)) {
		section.title = value;
		return;
	}
	const item = section.items.find((item) => item.id === target.itemId) as Record<string, unknown> | undefined;
	if (!item) throw new Error("TRANSLATION_TARGET_CHANGED");
	let record = item;
	if ("roleId" in target && target.roleId) {
		const role = Array.isArray(item.roles)
			? item.roles.find((role: Record<string, unknown>) => role.id === target.roleId)
			: undefined;
		if (!role) throw new Error("TRANSLATION_TARGET_CHANGED");
		record = role;
	}
	if (target.field === "keywords") {
		if (!Array.isArray(record.keywords) || typeof record.keywords[target.index] !== "string")
			throw new Error("TRANSLATION_TARGET_CHANGED");
		record.keywords[target.index] = value;
	} else record[target.field] = target.field === "description" ? `<p>${escapeHtml(value)}</p>` : value;
}

/** The registry stays in the owner's transaction; only tokens are sent to inference. */
export function translationPlaceholders(data: ResumeData) {
	const contacts = [
		data.basics.name,
		data.basics.email,
		data.basics.phone,
		data.basics.location,
		data.basics.website.url,
	];
	const official = buildTranslationInventory(data)
		.segments.filter((segment) => segment.official)
		.map((segment) => segment.text);
	return [...new Set([...contacts, ...official].filter(Boolean))]
		.sort((a, b) => b.length - a.length)
		.map((value, index) => ({ token: `[LOCAL_${index + 1}]`, value }));
}
