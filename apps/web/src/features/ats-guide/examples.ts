import type { GuideCode } from "./model";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { ATS_RULE_CODES, ATS_TYPOGRAPHY_THRESHOLDS } from "@reactive-resume/resume/ats";
import { PDF_ATS_RULE_CODES } from "@reactive-resume/resume/ats-pdf";

const { bodyFontSize, lineHeight, pageMargin } = ATS_TYPOGRAPHY_THRESHOLDS;
export const GUIDE_EXAMPLES = {
	NO_TEXT_LAYER: { before: msg`A scan with no selectable text`, after: msg`An exported PDF with selectable text` },
	IMAGE_ONLY_DOCUMENT: {
		before: msg`A screenshot of the whole page`,
		after: msg`The original document exported as PDF`,
	},
	GARBLED_TEXT: { before: msg`Copied text: □□□`, after: msg`Copied text: Experience` },
	TYPE3_FONT: { before: msg`Type 3 font`, after: msg`TrueType or OpenType font` },
	INVALID_EMBEDDED_FONT: {
		before: msg`An embedded font cannot be read`,
		after: msg`A fresh export with a valid embedded font`,
	},
	FILE_TOO_LARGE: { before: msg`PDF: 4 MB`, after: msg`PDF: under 2.5 MB after image compression` },
	ENCRYPTED_PDF: {
		before: msg`Password required to open the CV`,
		after: msg`Application copy opens without a password`,
	},
	XFA_FORM: { before: msg`Interactive XFA fields`, after: msg`Completed fields flattened into the page` },
	PDF_PORTFOLIO: { before: msg`A PDF collection containing the CV`, after: msg`One separate CV.pdf file` },
	REPLACEMENT_CHARACTERS: { before: msg`Devel�per`, after: msg`Developer after correcting font export` },
	PRIVATE_USE_CHARACTERS: { before: msg`An icon-font glyph as the contact label`, after: msg`A text label: Email` },
	LIGATURE_CHARACTERS: { before: msg`Copied text: ﬁnance`, after: msg`Copied text: finance` },
	NON_EMBEDDED_FONTS: { before: msg`Font export: not embedded`, after: msg`Font export: embedded` },
	INVISIBLE_TEXT: {
		before: msg`Visible: Designer / hidden: Engineer`,
		after: msg`Visible and recognition text both say Designer`,
	},
	WHITE_TEXT: { before: msg`Hidden white keywords`, after: msg`Only relevant, visible content` },
	LOW_TEXT_DENSITY: {
		before: msg`Experience appears only as an image`,
		after: msg`Experience can be selected and copied`,
	},
	HIGH_IMAGE_COVERAGE: { before: msg`Skills as an image`, after: msg`Skills as real text` },
	LOST_WORD_SPACING: { before: msg`ProductDesigner`, after: msg`Product Designer` },
	SPLIT_CHARACTER_SPACING: { before: msg`D e s i g n e r`, after: msg`Designer` },
	VERTICAL_TEXT: { before: msg`A job title rotated 90°`, after: msg`A horizontal job title` },
	ROTATED_PAGES: { before: msg`Page two is sideways`, after: msg`Every page is upright` },
	ACROFORM_FIELDS: {
		before: msg`Contact details remain editable form fields`,
		after: msg`Completed contact fields flattened into PDF text`,
	},
	NON_STANDARD_PAGE_SIZE: { before: msg`A custom square page`, after: msg`A4 or US Letter` },
	UNTAGGED_PDF: { before: msg`Tagged PDF export: off`, after: msg`Tagged PDF export: on, when supported` },
	MISSING_DOCUMENT_LANGUAGE: {
		before: msg`Document language: unset`,
		after: msg`Document language: Arabic for Arabic content`,
	},
	LARGE_FILE_SIZE: { before: msg`Large decorative images`, after: msg`Compressed images with readable text preserved` },
	TRUNCATED_ANALYSIS: { before: msg`More than 30 pages`, after: msg`Review the pages beyond 30 yourself` },
	MULTI_COLUMN_LAYOUT: {
		before: msg`One role description flows across columns`,
		after: msg`The same description stays in one column`,
	},
	READING_ORDER_INVERSION: {
		before: msg`Copied order: employer, next role, first role`,
		after: msg`Copied order: role, employer, description`,
	},
	READING_ORDER_RISK: {
		before: msg`The role title separates from its description`,
		after: msg`The title and description stay together`,
	},
	COLUMN_GUTTER: { before: msg`A long job description in the sidebar`, after: msg`The description in the main column` },
	TABLE_LIKE_LAYOUT: {
		before: msg`A role description split across table cells`,
		after: msg`The description as a paragraph or list`,
	},
	TEXT_IN_MARGIN_ZONE: { before: msg`Email at the edge of the page`, after: msg`Email inside the page body` },
	TIGHT_LINE_SPACING: { before: msg`Lines overlap after export`, after: msg`Lines have clear space between them` },
	SMALL_BODY_TEXT: { before: msg`Body text: 7 pt`, after: msg`Body text: at least 9 pt` },
	MANY_DISTINCT_FONTS: { before: msg`Six font families`, after: msg`Two or three font families` },
	NARROW_PAGE_MARGINS: {
		before: msg`Text almost touches the page edge`,
		after: msg`At least half an inch around the page`,
	},
	TEXT_OUTSIDE_PAGE: {
		before: msg`A contact line is clipped at the edge`,
		after: msg`The full contact line stays inside the page`,
	},
	NON_STANDARD_BULLET_GLYPHS: {
		before: msg`A decorative icon before every point`,
		after: msg`The editor’s built-in bullet list`,
	},
	REPEATED_HEADER_FOOTER: {
		before: msg`A long repeated paragraph on every page`,
		after: msg`A brief repeated header, or no repeat`,
	},
	DENSE_PAGE: { before: msg`All sections run together`, after: msg`Space separates the same sections` },
	NO_EXPERIENCE_SECTION: { before: msg`Heading: My journey`, after: msg`Heading: Experience` },
	NO_RECOGNIZED_HEADINGS: { before: msg`Unlabeled groups of text`, after: msg`Experience / Education / Skills` },
	FEW_SECTION_HEADINGS: {
		before: msg`Experience and education in one unlabeled block`,
		after: msg`Separate Experience and Education headings`,
	},
	NO_EDUCATION_SECTION: {
		before: msg`A qualification has no section heading`,
		after: msg`The qualification under Education`,
	},
	NO_SKILLS_SECTION: {
		before: msg`Actual tools are not listed`,
		after: msg`A Skills section lists the tools actually used`,
	},
	HEADINGS_NOT_DISTINGUISHED: {
		before: msg`Experience looks like body text`,
		after: msg`Experience is bold or larger`,
	},
	VERY_SHORT_DOCUMENT: {
		before: msg`Only the first paragraph is selectable`,
		after: msg`All intended content is present and selectable`,
	},
	NO_BULLET_POINTS: { before: msg`One dense role description`, after: msg`The same facts split into clear bullets` },
	NO_ROLE_LINES: { before: msg`Employer and dates far from the role`, after: msg`Role · Employer · Dates together` },
	NO_SUMMARY_SECTION: {
		before: msg`No overview of existing experience`,
		after: msg`Two or three lines about actual work`,
	},
	NO_EMAIL: { before: msg`No visible email address`, after: msg`name@example.com near the top of page one` },
	NO_PHONE: { before: msg`No phone number`, after: msg`A phone number with its country code` },
	NO_NAME_LINE: { before: msg`No name above the contact details`, after: msg`Your name on its own line` },
	CONTACT_NOT_ON_FIRST_PAGE: {
		before: msg`Email and phone on page two`,
		after: msg`Email and phone near the top of page one`,
	},
	EMAIL_SPLIT_ACROSS_ITEMS: { before: msg`name @ example . com`, after: msg`name@example.com` },
	LINK_TEXT_URL_MISMATCH: {
		before: msg`Visible address differs from link destination`,
		after: msg`Visible address matches link destination`,
	},
	MULTIPLE_EMAILS: { before: msg`Two application email addresses`, after: msg`One application email address` },
	NO_PROFESSIONAL_LINK: { before: msg`No relevant professional link`, after: msg`A relevant portfolio or profile URL` },
	BARE_URL_WITHOUT_PROTOCOL: { before: msg`example.com`, after: msg`https://example.com` },
	PHONE_FORMAT_UNUSUAL: {
		before: msg`Phone digits with no clear country code`,
		after: msg`Country code followed by the phone number`,
	},
	NO_DATES_FOUND: { before: msg`Designer · Company`, after: msg`Designer · Company · 2021–2023` },
	FEW_DATES: { before: msg`Only one role has dates`, after: msg`Each role has its actual date range` },
	UNPARSEABLE_DATE_RANGE: { before: msg`Early 2020 to a while later`, after: msg`Jan 2020 – Mar 2022, if accurate` },
	REVERSED_DATE_RANGE: { before: msg`2023–2021`, after: msg`2021–2023, if these are the actual endpoints` },
	FUTURE_DATED_ENTRY: {
		before: msg`An accidental future end year`,
		after: msg`The actual year, or Present for ongoing work`,
	},
	MIXED_DATE_FORMATS: { before: msg`01/2020 and Mar 2022`, after: msg`Jan 2020 and Mar 2022` },
	NO_CURRENT_ROLE_MARKER: {
		before: msg`An ongoing role without an end marker`,
		after: msg`2022–Present, only if the role is ongoing`,
	},
	AMBIGUOUS_NUMERIC_DATE: { before: msg`03/04/2022`, after: msg`Mar 2022, if March is intended` },
	NO_QUANTIFIED_IMPACT: { before: msg`Supported a team`, after: msg`Supported a team of 4, only if 4 is known` },
	WEAK_ACTION_VERBS: {
		before: msg`Responsible for support`,
		after: msg`Supported customers, if this describes the role`,
	},
	FIRST_PERSON_PRONOUNS: { before: msg`I built the dashboard`, after: msg`Built the dashboard` },
	LONG_BULLETS: {
		before: msg`A long bullet with several separate facts`,
		after: msg`Shorter bullets preserving those facts`,
	},
	HIGH_PAGE_COUNT: {
		before: msg`Repeated or irrelevant pages`,
		after: msg`The relevant pages, without an arbitrary page limit`,
	},
	EMPLOYMENT_GAP: {
		before: msg`An unexplained period between roles`,
		after: msg`An optional factual note, only if useful`,
	},
	ALL_CAPS_RUNS: { before: msg`BUILT CUSTOMER INTERFACES`, after: msg`Built customer interfaces` },
	REPEATED_PHRASES: {
		before: msg`Responsible for… / Responsible for…`,
		after: msg`Open each point with the action actually performed`,
	},
	MISSING_NAME: { before: msg`Name field: empty`, after: msg`Name field: your actual name` },
	MISSING_EMAIL: { before: msg`Email field: empty`, after: msg`Email field: name@example.com` },
	MALFORMED_EMAIL: { before: msg`name@`, after: msg`name@example.com` },
	MISSING_PHONE: { before: msg`Phone field: empty`, after: msg`Phone field: your contact number` },
	MISSING_LOCATION: { before: msg`Location field: empty`, after: msg`Location field: your city` },
	MALFORMED_URL: { before: msg`example.com`, after: msg`https://example.com` },
	PICTURE_PRESENT: { before: msg`Photo: visible`, after: msg`Photo: hidden` },
	EMPTY_PERIOD: { before: msg`Role period: empty`, after: msg`Role period: the actual dates` },
	UNPARSEABLE_PERIOD: { before: msg`A while ago`, after: msg`2021–2023, if accurate` },
	UNPARSEABLE_DATE: { before: msg`An unclear date`, after: msg`Mar 2022, if accurate` },
	REVERSED_PERIOD: { before: msg`2023–2021`, after: msg`2021–2023, if accurate` },
	FUTURE_DATED_PERIOD: { before: msg`An accidental future start date`, after: msg`The actual start date` },
	SECTION_MISSING_FROM_LAYOUT: {
		before: msg`Skills exists but is not placed on a page`,
		after: msg`Skills placed on the intended page`,
	},
	NO_VISIBLE_EXPERIENCE: { before: msg`Experience exists but is hidden`, after: msg`Relevant experience is visible` },
	MISSING_EXPERIENCE_DESCRIPTION: {
		before: msg`A role title without a description`,
		after: msg`A brief description of the actual work`,
	},
	NON_STANDARD_SECTION_TITLE: { before: msg`My journey`, after: msg`Experience` },
	MULTI_COLUMN_PROSE_SECTION: {
		before: msg`Experience description in two columns`,
		after: msg`Experience description in one column`,
	},
	PROSE_SECTION_IN_SIDEBAR: {
		before: msg`Experience description in the sidebar`,
		after: msg`Experience description in the main column`,
	},
	TWO_COLUMN_LAYOUT: { before: msg`Two-column document layout`, after: msg`Single-column document layout` },
	SMALL_BODY_FONT: { before: msg`Body font: 7 pt`, after: msg`Body font: at least ${bodyFontSize} pt` },
	TIGHT_LINE_HEIGHT: { before: msg`Line height: 1`, after: msg`Line height: at least ${lineHeight}` },
	TIGHT_PAGE_MARGINS: { before: msg`Margins: 4 pt`, after: msg`Margins: at least ${pageMargin} pt` },
} satisfies Record<GuideCode, { before: MessageDescriptor; after: MessageDescriptor }>;

export function assertGuideExamples(examples: Record<string, unknown>): void {
	const codes: readonly string[] = [...PDF_ATS_RULE_CODES, ...ATS_RULE_CODES];
	const missing = codes.filter((code) => !(code in examples));
	const obsolete = Object.keys(examples).filter((code) => !codes.includes(code));
	if (missing.length || obsolete.length)
		throw new Error(`Guide examples: missing ${missing.join(", ")}; obsolete ${obsolete.join(", ")}`);
}
assertGuideExamples(GUIDE_EXAMPLES);
export function getGuideExample(code: GuideCode, translator: I18n): { before: string; after: string } {
	const example = GUIDE_EXAMPLES[code];
	return { before: translator._(example.before), after: translator._(example.after) };
}
