import type { ResumeData, Website } from "@reactive-resume/schema/resume/data";
import type { Node } from "node-html-parser";
import { HTMLElement, NodeType, parse } from "node-html-parser";

// Source-only traversal: inline formatting preserves adjacency; blocks and breaks separate text.
const blocks = new Set([
	"P",
	"DIV",
	"LI",
	"UL",
	"OL",
	"BLOCKQUOTE",
	"PRE",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"BR",
	"HR",
]);
function visibleText(node: Node): string {
	if (node.nodeType === NodeType.TEXT_NODE) return node.textContent;
	if (!(node instanceof HTMLElement)) return "";
	const tag = node.tagName;
	if (
		["SCRIPT", "STYLE"].includes(tag) ||
		/(?:^|;)\s*display\s*:\s*none\s*(?:!important\s*)?(?:;|$)/iu.test(node.getAttribute("style") ?? "")
	)
		return "";
	const text = node.childNodes.map(visibleText).join("");
	return blocks.has(tag) ? ` ${text} ` : text;
}
const plainText = (html: string) =>
	visibleText(parse(html, { comment: false }))
		.replace(/\s+/gu, " ")
		.trim();
const websiteText = (website: Website & { inlineLink?: boolean }) =>
	website.url && !website.inlineLink ? website.label.trim() || website.url : "";

/** Every visible authored source string, including its number multiplicity. Metadata and link targets are excluded. */
export function sourceGoldText(data: ResumeData): string {
	const values = [
		data.basics.name,
		data.basics.headline,
		data.basics.email,
		data.basics.phone,
		data.basics.location,
		websiteText(data.basics.website),
		...data.basics.customFields.map((field) => field.text),
	];
	for (const page of data.metadata.layout.pages)
		for (const id of [...page.main, ...(page.fullWidth ? [] : page.sidebar)]) {
			if (id === "summary") {
				const content = plainText(data.summary.content);
				if (!data.summary.hidden && content) {
					if (data.summary.showHeading !== false) values.push(data.summary.title);
					values.push(content);
				}
				continue;
			}
			if (!(id in data.sections)) throw new Error(`Source gold factory does not support section ${id}`);
			const section = data.sections[id as keyof typeof data.sections];
			if (section.hidden) continue;
			const visible = section.items.filter((item) => {
				if (item.hidden) return false;
				const title =
					"company" in item
						? item.company
						: "school" in item
							? item.school
							: "title" in item
								? item.title
								: "name" in item
									? item.name
									: undefined;
				return title === undefined || Boolean(title.trim());
			});
			if (!visible.length) continue;
			if (section.showHeading !== false) values.push(section.title);
			switch (id) {
				case "experience":
					for (const job of data.sections.experience.items.filter((item) => !item.hidden && item.company.trim())) {
						const roles = job.roles.filter((role) => role.position.trim());
						values.push(
							job.company,
							roles.some((role) => role.position.trim() === job.position.trim()) ? "" : job.position,
							job.location,
							job.period,
							plainText(job.description),
							websiteText(job.website),
						);
						for (const role of roles) values.push(role.position, role.period, plainText(role.description));
					}
					break;
				case "education":
					for (const item of data.sections.education.items.filter((item) => !item.hidden && item.school.trim()))
						values.push(
							item.school,
							item.degree,
							item.area,
							item.grade,
							item.location,
							item.period,
							plainText(item.description),
							websiteText(item.website),
						);
					break;
				case "projects":
					for (const item of data.sections.projects.items.filter((item) => !item.hidden && item.name.trim()))
						values.push(item.name, item.period, plainText(item.description), websiteText(item.website));
					break;
				case "certifications":
					for (const item of data.sections.certifications.items.filter((item) => !item.hidden && item.title.trim()))
						values.push(item.title, item.issuer, item.date, plainText(item.description), websiteText(item.website));
					break;
				case "skills":
					for (const item of data.sections.skills.items.filter((item) => !item.hidden && item.name.trim()))
						values.push(item.name, item.proficiency, ...item.keywords);
					break;
				default:
					throw new Error(`Source gold factory does not support populated section ${id}`);
			}
		}
	return values.filter(Boolean).join(" ");
}
