import type { PageMapTarget } from "@reactive-resume/pdf/page-map";
import type { AtsCategory, AtsFinding, AtsReport } from "@reactive-resume/resume/ats";
import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import type { IconName } from "@reactive-resume/ui/components/icon";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { atsRuleCategory } from "@reactive-resume/resume/ats";
import { describeEntry, findEntry, getSectionObject, resolveSection } from "../write/model";
import { formatPageNumberInSentence } from "@/libs/page-number";
import { getSectionTitle } from "@/libs/resume/section";

/** How a card fixes its issue: in one step on the resume (with undo), or by opening the entry in Write. */
type IssueFix =
	| { kind: "apply"; label: string; icon: IconName; done: string; apply: (draft: ResumeData) => void }
	| { kind: "write"; label: string; target: PageMapTarget };

export type CheckIssue = {
	key: string;
	/** 1-based, in the order the cards list them; the pin on the page carries the same number. */
	number: number;
	finding: AtsFinding;
	category: AtsCategory;
	title: string;
	body: string;
	fix: IssueFix;
	/** "Keep" instead of "Ignore": the issue follows from a design choice that is the author's to make. */
	keepLabel: boolean;
	/** The block on the page the issue is about, for its pin; null for page-wide settings. */
	target: PageMapTarget | null;
};

const decodeToken = (token: string) => token.replace(/~1/g, "/").replace(/~0/g, "~");

const tokensOf = (pointer: string) => pointer.split("/").slice(1).map(decodeToken);

/** The section a pointer is in: the summary, a built-in section's key or a custom section's id. */
function sectionIdOf(tokens: readonly string[], data: ResumeData): string | undefined {
	const [head, next] = tokens;
	if (head === "summary") return "summary";
	if (head === "sections") return next;
	if (head === "customSections") return data.customSections[Number(next)]?.id;
	return undefined;
}

function itemIdOf(tokens: readonly string[], data: ResumeData): string | undefined {
	const itemsIndex = tokens.indexOf("items");
	if (itemsIndex === -1) return undefined;

	let node: unknown = data;
	for (const token of tokens.slice(0, itemsIndex + 2)) node = (node as Record<string, unknown> | undefined)?.[token];

	const id = (node as { id?: unknown } | undefined)?.id;
	return typeof id === "string" ? id : undefined;
}

/** The block a finding is about: the header for contact details, else its section or entry. */
function getFindingTarget(finding: AtsFinding, data: ResumeData): PageMapTarget | null {
	const tokens = tokensOf(finding.pointer);
	if (tokens[0] === "basics" || tokens[0] === "picture") return { kind: "header" };

	const sectionId = sectionIdOf(tokens, data);
	if (!sectionId) return null;

	const itemId = itemIdOf(tokens, data);
	return itemId ? { kind: "item", sectionId, itemId } : { kind: "section", sectionId };
}

/** The printed name of a section: the title the author gave it, else its type's name. */
export function getSectionName(data: ResumeData, sectionId: string): string {
	const section = resolveSection(data, sectionId);
	if (!section) return sectionId;

	const title = getSectionObject(data, section)?.title.trim();
	return title || getSectionTitle(section.kind === "custom" ? section.type : (section.id as SectionType | "summary"));
}

function getEntryName(data: ResumeData, target: PageMapTarget | null): string {
	if (target?.kind !== "item") return t`This entry`;

	const section = resolveSection(data, target.sectionId);
	const entry = findEntry(data, target.sectionId, target.itemId);
	const title = section && entry ? describeEntry(section.type, entry).title : "";
	return title ? `“${title}”` : t`This entry`;
}

/** Sets the value a finding's pointer names (the pointer still has array indexes, which match `draft`). */
function setAt(draft: ResumeData, pointer: string, value: unknown) {
	const tokens = tokensOf(pointer);
	const last = tokens.pop();
	let node: unknown = draft;
	for (const token of tokens) node = (node as Record<string, unknown> | undefined)?.[token];
	if (node && last !== undefined) (node as Record<string, unknown>)[last] = value;
}

const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i;

type Message = { title: string; body: string; fix: IssueFix; keepLabel?: boolean };

function describeFinding(finding: AtsFinding, data: ResumeData, target: PageMapTarget | null): Message {
	const value = String(finding.params?.value ?? "");
	const section = String(finding.params?.section ?? "");
	const minimum = Number(finding.params?.minimum ?? 0);
	const write = (label: string): IssueFix => ({ kind: "write", label, target: target ?? { kind: "header" } });
	const entry = getEntryName(data, target);

	switch (finding.code) {
		case "MISSING_NAME":
			return {
				title: t`Add your name`,
				body: t`Your name helps readers identify your CV.`,
				fix: write(t`Add your name`),
			};
		case "MISSING_EMAIL":
			return {
				title: t`Add an email address`,
				body: t`An email gives recruiters a way to reach you.`,
				fix: write(t`Add an email`),
			};
		case "MALFORMED_EMAIL":
			return {
				title: t`Check your email address`,
				body: t`“${value}” does not look like a complete email address.`,
				fix: write(t`Edit the email`),
			};
		case "MISSING_PHONE":
			return {
				title: t`Add a phone number`,
				body: t`Some application forms require a phone number.`,
				fix: write(t`Add a phone number`),
			};
		case "MISSING_LOCATION":
			return {
				title: t`Add your city and country`,
				body: t`Your location helps readers understand where you can work.`,
				fix: write(t`Add a location`),
			};
		case "MALFORMED_URL": {
			const url = `https://${value}`;
			return {
				title: t`Write the full web address`,
				body: t`“${value}” may read as plain text without https://.`,
				fix: HAS_SCHEME.test(value)
					? write(t`Edit the link`)
					: {
							kind: "apply",
							label: t`Use ${url}`,
							icon: "link-simple-horizontal",
							done: t`Link updated`,
							apply: (draft) => setAt(draft, finding.pointer, url),
						},
			};
		}
		case "PICTURE_PRESENT":
			return {
				title: t`Review whether to keep your photo`,
				body: t`Images may be missed, and photo conventions vary by country.`,
				fix: {
					kind: "apply",
					label: t`Hide the photo`,
					icon: "eye-slash",
					done: t`Photo hidden`,
					apply: (draft) => {
						draft.picture.hidden = true;
					},
				},
			};
		case "EMPTY_PERIOD":
			return {
				title: t`Add dates to this entry`,
				body: t`Dates help readers place ${entry} in your work history.`,
				fix: write(t`Add dates`),
			};
		case "UNPARSEABLE_PERIOD":
			return {
				title: t`Use a clearer date range`,
				body: t`“${value}” may be hard to read; use a form such as Mar 2020 – Present.`,
				fix: write(t`Fix the dates`),
			};
		case "UNPARSEABLE_DATE":
			return {
				title: t`Use a clearer date`,
				body: t`“${value}” may be hard to read; use a form such as March 2022.`,
				fix: write(t`Fix the date`),
			};
		case "REVERSED_PERIOD":
			return {
				title: t`Check the start and end dates`,
				body: t`In “${value}”, the end date is earlier than the start date.`,
				fix: write(t`Fix the dates`),
			};
		case "FUTURE_DATED_PERIOD":
			return {
				title: t`Review this future start date`,
				body: t`“${value}” starts after today; check that the date is correct.`,
				fix: write(t`Fix the dates`),
			};
		case "SECTION_MISSING_FROM_LAYOUT": {
			const name = getSectionName(data, section);
			const page = formatPageNumberInSentence(1, i18n.locale);
			return {
				title: t`Add ${name} to a page`,
				body: t`This section has information but is missing from the page layout.`,
				fix: {
					kind: "apply",
					label: t`Add it to page ${page}`,
					icon: "plus",
					done: t`${name} added to page ${page}`,
					apply: (draft) => {
						const [page] = draft.metadata.layout.pages;
						if (page) page.main.push(section);
						else draft.metadata.layout.pages.push({ fullWidth: false, main: [section], sidebar: [] });
					},
				},
			};
		}
		case "NO_VISIBLE_EXPERIENCE":
			return {
				title: t`Add experience readers can see`,
				body: t`Projects or volunteering can also show relevant experience.`,
				fix: { kind: "write", label: t`Add experience`, target: { kind: "section", sectionId: "experience" } },
			};
		case "MISSING_EXPERIENCE_DESCRIPTION":
			return {
				title: t`Describe what you did in this role`,
				body: t`${entry} names the role but does not describe your contribution.`,
				fix: write(t`Describe the role`),
			};
		case "NON_STANDARD_SECTION_TITLE": {
			const title = String(finding.params?.title ?? "");
			return {
				title: t`Use a familiar heading instead of “${title}”`,
				body: t`Headings such as Experience, Education and Skills are easier to recognize.`,
				fix: {
					kind: "apply",
					label: t`Use the standard heading`,
					icon: "text-t",
					done: t`Heading changed`,
					// An empty title prints the section type's name in the resume's language.
					apply: (draft) => setAt(draft, finding.pointer, ""),
				},
			};
		}
		case "MULTI_COLUMN_PROSE_SECTION": {
			const name = getSectionName(data, section);
			return {
				title: t`Keep ${name} in one column`,
				body: t`Columns can change the order software reads text.`,
				fix: {
					kind: "apply",
					label: t`Use one column`,
					icon: "list-dashes",
					done: t`${name} uses one column`,
					apply: (draft) => setAt(draft, finding.pointer, 1),
				},
			};
		}
		case "PROSE_SECTION_IN_SIDEBAR": {
			const name = getSectionName(data, section);
			return {
				title: t`Move ${name} to the main column`,
				body: t`Sidebar text may be read last or mixed with the main column.`,
				fix: {
					kind: "apply",
					label: t`Move it to the main column`,
					icon: "arrow-right",
					done: t`${name} moved to the main column`,
					apply: (draft) => {
						for (const page of draft.metadata.layout.pages) {
							if (!page.sidebar.includes(section)) continue;
							page.sidebar = page.sidebar.filter((id) => id !== section);
							page.main.push(section);
						}
					},
				},
			};
		}
		case "TWO_COLUMN_LAYOUT": {
			const names = String(finding.params?.sections ?? "")
				.split(",")
				.filter(Boolean)
				.map((id) => getSectionName(data, id))
				.join(", ");
			return {
				title: t`Review the sidebar reading order`,
				body: t`${names} appear after the main column in the extracted text.`,
				keepLabel: true,
				fix: {
					kind: "apply",
					label: t`Switch to one column`,
					icon: "list-dashes",
					done: t`Switched to one column`,
					// Full-width pages print no sidebar, so its sections move into the main column first.
					apply: (draft) => {
						for (const page of draft.metadata.layout.pages) {
							if (page.fullWidth || page.sidebar.length === 0) continue;
							page.main.push(...page.sidebar);
							page.sidebar = [];
							page.fullWidth = true;
						}
					},
				},
			};
		}
		case "SMALL_BODY_FONT":
			return {
				title: t`Increase the body text size`,
				body: t`Text smaller than ${minimum} pt can be hard to read.`,
				fix: {
					kind: "apply",
					label: t`Use ${minimum} pt`,
					icon: "text-aa",
					done: t`Body text set to ${minimum} pt`,
					apply: (draft) => setAt(draft, finding.pointer, minimum),
				},
			};
		case "TIGHT_LINE_HEIGHT":
			return {
				title: t`Give lines more space`,
				body: t`Close lines can merge when read; use spacing of at least ${minimum}.`,
				fix: {
					kind: "apply",
					label: t`Use ${minimum}`,
					icon: "sliders-horizontal",
					done: t`Line height set to ${minimum}`,
					apply: (draft) => setAt(draft, finding.pointer, minimum),
				},
			};
		case "TIGHT_PAGE_MARGINS":
			return {
				title: t`Widen the page margins`,
				body: t`Text near the edge can be cut off; leave at least ${minimum} pt.`,
				fix: {
					kind: "apply",
					label: t`Use ${minimum} pt margins`,
					icon: "sliders-horizontal",
					done: t`Margins set to ${minimum} pt`,
					apply: (draft) => setAt(draft, finding.pointer, minimum),
				},
			};
	}
}

/** The open findings as numbered cards, in the report's order (most severe first). */
export function buildIssues(report: AtsReport, data: ResumeData): CheckIssue[] {
	return report.findings.map((finding, index) => {
		const target = getFindingTarget(finding, data);
		const message = describeFinding(finding, data, target);

		return {
			key: finding.key,
			number: index + 1,
			finding,
			category: atsRuleCategory(finding.code),
			title: message.title,
			body: message.body,
			fix: message.fix,
			keepLabel: message.keepLabel ?? false,
			target,
		};
	});
}
