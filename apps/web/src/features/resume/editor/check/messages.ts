import type { I18n } from "@lingui/core";
import type { AtsRuleCode } from "@reactive-resume/resume/ats";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";

export type EditorFindingMessage = { title: string; body: string; action: string };
export type EditorFindingMessageParams = {
	value: string;
	url: string;
	entry: string;
	name: string;
	names: string;
	title: string;
	page: string;
	minimum: number;
	hasScheme: boolean;
};
export function getEditorFindingMessage(
	code: AtsRuleCode,
	params: EditorFindingMessageParams,
	translator: I18n = i18n,
): EditorFindingMessage {
	const { value, url, entry, name, names, title, page, minimum, hasScheme } = params;
	switch (code) {
		case "MISSING_NAME":
			return {
				title: t(translator)`Add your name`,
				body: t(translator)`Your name helps readers identify your CV.`,
				action: t(translator)`Add your name`,
			};
		case "MISSING_EMAIL":
			return {
				title: t(translator)`Add an email address`,
				body: t(translator)`An email gives recruiters a way to reach you.`,
				action: t(translator)`Add an email`,
			};
		case "MALFORMED_EMAIL":
			return {
				title: t(translator)`Check your email address`,
				body: t(translator)`“${value}” does not look like a complete email address.`,
				action: t(translator)`Edit the email`,
			};
		case "MISSING_PHONE":
			return {
				title: t(translator)`Add a phone number`,
				body: t(translator)`Some application forms require a phone number.`,
				action: t(translator)`Add a phone number`,
			};
		case "MISSING_LOCATION":
			return {
				title: t(translator)`Add your city and country`,
				body: t(translator)`Your location helps readers understand where you can work.`,
				action: t(translator)`Add a location`,
			};
		case "MALFORMED_URL":
			return {
				title: t(translator)`Write the full web address`,
				body: t(translator)`“${value}” may read as plain text without https://.`,
				action: hasScheme ? t(translator)`Edit the link` : t(translator)`Use ${url}`,
			};
		case "PICTURE_PRESENT":
			return {
				title: t(translator)`Review whether to keep your photo`,
				body: t(translator)`Images may be missed, and photo conventions vary by country.`,
				action: t(translator)`Hide the photo`,
			};
		case "EMPTY_PERIOD":
			return {
				title: t(translator)`Add dates to this entry`,
				body: t(translator)`Dates help readers place ${entry} in your work history.`,
				action: t(translator)`Add dates`,
			};
		case "UNPARSEABLE_PERIOD":
			return {
				title: t(translator)`Use a clearer date range`,
				body: t(translator)`“${value}” may be hard to read; use a form such as Mar 2020 – Present.`,
				action: t(translator)`Fix the dates`,
			};
		case "UNPARSEABLE_DATE":
			return {
				title: t(translator)`Use a clearer date`,
				body: t(translator)`“${value}” may be hard to read; use a form such as March 2022.`,
				action: t(translator)`Fix the date`,
			};
		case "REVERSED_PERIOD":
			return {
				title: t(translator)`Check the start and end dates`,
				body: t(translator)`In “${value}”, the end date is earlier than the start date.`,
				action: t(translator)`Fix the dates`,
			};
		case "FUTURE_DATED_PERIOD":
			return {
				title: t(translator)`Review this future start date`,
				body: t(translator)`“${value}” starts after today; check that the date is correct.`,
				action: t(translator)`Fix the dates`,
			};
		case "SECTION_MISSING_FROM_LAYOUT":
			return {
				title: t(translator)`Add ${name} to a page`,
				body: t(translator)`This section has information but is missing from the page layout.`,
				action: t(translator)`Add it to page ${page}`,
			};
		case "NO_VISIBLE_EXPERIENCE":
			return {
				title: t(translator)`Add experience readers can see`,
				body: t(translator)`Projects or volunteering can also show relevant experience.`,
				action: t(translator)`Add experience`,
			};
		case "MISSING_EXPERIENCE_DESCRIPTION":
			return {
				title: t(translator)`Describe what you did in this role`,
				body: t(translator)`${entry} names the role but does not describe your contribution.`,
				action: t(translator)`Describe the role`,
			};
		case "NON_STANDARD_SECTION_TITLE":
			return {
				title: t(translator)`Use a familiar heading instead of “${title}”`,
				body: t(translator)`Headings such as Experience, Education and Skills are easier to recognize.`,
				action: t(translator)`Use the standard heading`,
			};
		case "MULTI_COLUMN_PROSE_SECTION":
			return {
				title: t(translator)`Keep ${name} in one column`,
				body: t(translator)`Columns can change the order software reads text.`,
				action: t(translator)`Use one column`,
			};
		case "PROSE_SECTION_IN_SIDEBAR":
			return {
				title: t(translator)`Move ${name} to the main column`,
				body: t(translator)`Sidebar text may be read last or mixed with the main column.`,
				action: t(translator)`Move it to the main column`,
			};
		case "TWO_COLUMN_LAYOUT":
			return {
				title: t(translator)`Review the sidebar reading order`,
				body: t(translator)`${names} appear after the main column in the extracted text.`,
				action: t(translator)`Switch to one column`,
			};
		case "SMALL_BODY_FONT":
			return {
				title: t(translator)`Increase the body text size`,
				body: t(translator)`Text smaller than ${minimum} pt can be hard to read.`,
				action: t(translator)`Use ${minimum} pt`,
			};
		case "TIGHT_LINE_HEIGHT":
			return {
				title: t(translator)`Give lines more space`,
				body: t(translator)`Close lines can merge when read; use spacing of at least ${minimum}.`,
				action: t(translator)`Use ${minimum}`,
			};
		case "TIGHT_PAGE_MARGINS":
			return {
				title: t(translator)`Widen the page margins`,
				body: t(translator)`Text near the edge can be cut off; leave at least ${minimum} pt.`,
				action: t(translator)`Use ${minimum} pt margins`,
			};
	}
}
