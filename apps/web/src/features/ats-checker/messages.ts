import type { I18n } from "@lingui/core";
import type { PdfRuleCode, PdfSeverity } from "@reactive-resume/resume/ats-pdf";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { match } from "ts-pattern";

export type PdfFindingMessage = {
	title: string;
	why: string;
	action: string;
};

/**
 * Every rule code the engine can report, in the reader's language.
 *
 * Flat and exhaustive on purpose. `.exhaustive()` over the engine's own code union makes a new
 * rule a compile error that names the missing code, so a raw code can never reach the UI, and
 * one arm per code means adding a rule is one edit here, not three.
 *
 * House style: say what is true about the file, then what to do about it. Never claim a file will
 * be rejected. No tool knows that.
 */
export function getPdfFindingMessage(code: PdfRuleCode, translator: I18n = i18n): PdfFindingMessage {
	return (
		match(code)
			// ---- Parseability: nothing readable came out ----
			.with("NO_TEXT_LAYER", () => ({
				why: t(translator)`Hiring systems need text they can select and read.`,
				title: t(translator)`Export a PDF with selectable text`,
				action: t(translator)`Export as text, rather than a scan or image.`,
			}))
			.with("IMAGE_ONLY_DOCUMENT", () => ({
				why: t(translator)`Text inside images may be missed.`,
				title: t(translator)`Replace page images with real text`,
				action: t(translator)`Export directly from the original document.`,
			}))
			.with("GARBLED_TEXT", () => ({
				why: t(translator)`Unreadable characters can hide your experience.`,
				title: t(translator)`Check the text in your exported PDF`,
				action: t(translator)`Embed fonts, then check that copied text reads correctly.`,
			}))
			.with("TYPE3_FONT", () => ({
				why: t(translator)`Type 3 fonts can make words unreadable to software.`,
				title: t(translator)`Replace drawing-based fonts`,
				action: t(translator)`Use a TrueType or OpenType font and export again.`,
			}))
			.with("INVALID_EMBEDDED_FONT", () => ({
				why: t(translator)`A damaged embedded font can hide words.`,
				title: t(translator)`Export again with readable fonts`,
				action: t(translator)`Embed fonts from the original document and export again.`,
			}))
			// ---- Parseability: the file is the wrong kind of thing ----
			.with("FILE_TOO_LARGE", () => ({
				why: t(translator)`Some application forms limit upload size.`,
				title: t(translator)`Reduce the PDF file size`,
				action: t(translator)`Keep the file under 2.5 MB by shrinking or removing images.`,
			}))
			.with("ENCRYPTED_PDF", () => ({
				why: t(translator)`Protection can prevent software from reading the file.`,
				title: t(translator)`Save a copy without password protection`,
				action: t(translator)`Remove the password and reading restrictions from the copy.`,
			}))
			.with("XFA_FORM", () => ({
				why: t(translator)`Some software cannot read text inside XFA forms.`,
				title: t(translator)`Export the form as a regular PDF`,
				action: t(translator)`Print or export the completed form to a flat PDF.`,
			}))
			.with("PDF_PORTFOLIO", () => ({
				why: t(translator)`Software may read only the portfolio cover.`,
				title: t(translator)`Send the CV itself`,
				action: t(translator)`Export the CV separately from the PDF Portfolio.`,
			}))
			.with("ACROFORM_FIELDS", () => ({
				why: t(translator)`Form answers may be missing from extracted text.`,
				title: t(translator)`Save form answers as page text`,
				action: t(translator)`Flatten the completed form before sending it.`,
			}))
			// ---- Parseability: the characters came out wrong ----
			.with("REPLACEMENT_CHARACTERS", () => ({
				why: t(translator)`Missing letters can change names and search terms.`,
				title: t(translator)`Check missing letters in the PDF`,
				action: t(translator)`Embed fonts and check the copied text.`,
			}))
			.with("PRIVATE_USE_CHARACTERS", () => ({
				why: t(translator)`Some symbols have no meaning outside their font.`,
				title: t(translator)`Replace font symbols with plain text`,
				action: t(translator)`Use text labels instead of icon-font characters.`,
			}))
			.with("LIGATURE_CHARACTERS", () => ({
				why: t(translator)`Some joined shapes can lose letters during extraction.`,
				title: t(translator)`Check words with joined letter shapes`,
				action: t(translator)`Turn off optional ligatures and export again.`,
			}))
			.with("NON_EMBEDDED_FONTS", () => ({
				why: t(translator)`Missing fonts can change how words are read.`,
				title: t(translator)`Include fonts in the exported file`,
				action: t(translator)`Enable font embedding when exporting.`,
			}))
			.with("LOST_WORD_SPACING", () => ({
				why: t(translator)`Joined words can be harder to recognize.`,
				title: t(translator)`Restore spaces between words`,
				action: t(translator)`Export from the original document and check the copied text.`,
			}))
			.with("SPLIT_CHARACTER_SPACING", () => ({
				why: t(translator)`Widely separated letters may not be read as words.`,
				title: t(translator)`Reduce spacing between letters`,
				action: t(translator)`Remove extra letter spacing and export again.`,
			}))
			// ---- Parseability: what the document declares about itself ----
			.with("INVISIBLE_TEXT", () => ({
				why: t(translator)`Hidden text may differ from what the reader sees.`,
				title: t(translator)`Review text hidden behind the page`,
				action: t(translator)`Keep scan-recognition text only if it matches the visible page.`,
			}))
			.with("WHITE_TEXT", () => ({
				why: t(translator)`Hidden words can misrepresent the visible CV.`,
				title: t(translator)`Remove white text on white backgrounds`,
				action: t(translator)`Delete hidden keywords and keep the visible content.`,
			}))
			.with("LOW_TEXT_DENSITY", () => ({
				why: t(translator)`Very little text was extracted per page on average.`,
				title: t(translator)`Check that all your content is readable`,
				action: t(translator)`Try selecting and copying each part of the PDF.`,
			}))
			.with("HIGH_IMAGE_COVERAGE", () => ({
				why: t(translator)`Text inside large images may be missed.`,
				title: t(translator)`Keep key information outside images`,
				action: t(translator)`Use real text for experience, skills and contact details.`,
			}))
			.with("VERTICAL_TEXT", () => ({
				why: t(translator)`Rotated text may be skipped or read out of order.`,
				title: t(translator)`Keep text horizontal`,
				action: t(translator)`Rotate text back to a horizontal reading direction.`,
			}))
			.with("ROTATED_PAGES", () => ({
				why: t(translator)`Rotated pages can affect reading order.`,
				title: t(translator)`Make every page upright`,
				action: t(translator)`Save all pages in their normal upright orientation.`,
			}))
			.with("NON_STANDARD_PAGE_SIZE", () => ({
				why: t(translator)`Unusual sizes can crop content in other viewers.`,
				title: t(translator)`Use a standard page size`,
				action: t(translator)`Choose A4 or US Letter and export again.`,
			}))
			.with("UNTAGGED_PDF", () => ({
				why: t(translator)`Tags help software follow the reading order.`,
				title: t(translator)`Add accessibility tags when available`,
				action: t(translator)`Enable tagged PDF export if your editor supports it.`,
			}))
			.with("MISSING_DOCUMENT_LANGUAGE", () => ({
				why: t(translator)`The language setting helps software interpret the text.`,
				title: t(translator)`Set the PDF language`,
				action: t(translator)`Set the document language before exporting.`,
			}))
			.with("LARGE_FILE_SIZE", () => ({
				why: t(translator)`Large files take longer to upload.`,
				title: t(translator)`Make the PDF lighter`,
				action: t(translator)`Compress large images or remove unnecessary ones.`,
			}))
			.with("TRUNCATED_ANALYSIS", () => ({
				why: t(translator)`The result covers only the first pages.`,
				title: t(translator)`Review the pages beyond this check`,
				action: t(translator)`Check the remaining pages yourself; this is not a file defect.`,
			}))
			// ---- Layout ----
			.with("MULTI_COLUMN_LAYOUT", () => ({
				why: t(translator)`Columns can change the order software reads text.`,
				title: t(translator)`Keep related text in one column`,
				action: t(translator)`Use one column for content that needs a clear sequence.`,
			}))
			.with("READING_ORDER_INVERSION", () => ({
				why: t(translator)`The extracted text follows a different order from the page.`,
				title: t(translator)`Correct the PDF reading order`,
				action: t(translator)`Try a single-column layout, then copy the text to check its order.`,
			}))
			.with("READING_ORDER_RISK", () => ({
				why: t(translator)`A role may become separated from its description.`,
				title: t(translator)`Review lines that read out of order`,
				action: t(translator)`Copy the PDF text and check that related lines stay together.`,
			}))
			.with("COLUMN_GUTTER", () => ({
				why: t(translator)`A wide column gap can split the reading sequence.`,
				title: t(translator)`Check the order across columns`,
				action: t(translator)`Use one column, or keep the sidebar to short lists.`,
			}))
			.with("TABLE_LIKE_LAYOUT", () => ({
				why: t(translator)`Table cells may be read in the wrong order.`,
				title: t(translator)`Move key content out of tables`,
				action: t(translator)`Use paragraphs and lists for content that needs a sequence.`,
			}))
			.with("TEXT_IN_MARGIN_ZONE", () => ({
				why: t(translator)`Some software skips headers and footers.`,
				title: t(translator)`Move key text away from page edges`,
				action: t(translator)`Move important details into the page body.`,
			}))
			.with("TIGHT_LINE_SPACING", () => ({
				why: t(translator)`Tightly packed lines may merge during extraction.`,
				title: t(translator)`Give lines more space`,
				action: t(translator)`Increase line spacing and check the exported text.`,
			}))
			.with("SMALL_BODY_TEXT", () => ({
				why: t(translator)`Small text is harder to read.`,
				title: t(translator)`Increase the body text size`,
				action: t(translator)`Use a body font of at least 9 pt.`,
			}))
			.with("MANY_DISTINCT_FONTS", () => ({
				why: t(translator)`Each font adds another mapping for software to read.`,
				title: t(translator)`Use fewer font families`,
				action: t(translator)`Keep to two or three font families.`,
			}))
			.with("NARROW_PAGE_MARGINS", () => ({
				why: t(translator)`Text close to an edge can be cut off.`,
				title: t(translator)`Widen the page margins`,
				action: t(translator)`Leave at least half an inch around the page.`,
			}))
			.with("TEXT_OUTSIDE_PAGE", () => ({
				why: t(translator)`Content outside the page may be missed.`,
				title: t(translator)`Bring text inside the page`,
				action: t(translator)`Move all content inside the page boundaries.`,
			}))
			.with("NON_STANDARD_BULLET_GLYPHS", () => ({
				why: t(translator)`Unusual bullet symbols may appear inside words.`,
				title: t(translator)`Use standard list bullets`,
				action: t(translator)`Use your editor's built-in bullet list.`,
			}))
			.with("DENSE_PAGE", () => ({
				why: t(translator)`Crowded pages are harder to skim.`,
				title: t(translator)`Give sections more breathing room`,
				action: t(translator)`Add space between sections without removing useful facts.`,
			}))
			.with("REPEATED_HEADER_FOOTER", () => ({
				why: t(translator)`Repeated lines also appear in extracted text.`,
				title: t(translator)`Shorten repeated page headers`,
				action: t(translator)`Keep repeated headers brief or remove them.`,
			}))
			// ---- Sections ----
			.with("NO_EXPERIENCE_SECTION", () => ({
				why: t(translator)`A clear heading helps readers find your work history.`,
				title: t(translator)`Add a clear experience heading`,
				action: t(translator)`Use a heading such as "Experience" or "Work Experience".`,
			}))
			.with("NO_RECOGNIZED_HEADINGS", () => ({
				why: t(translator)`Clear headings help software separate your information.`,
				title: t(translator)`Use familiar section headings`,
				action: t(translator)`Use headings such as Experience, Education and Skills.`,
			}))
			.with("FEW_SECTION_HEADINGS", () => ({
				why: t(translator)`Only one familiar heading was found.`,
				title: t(translator)`Give each section a clear heading`,
				action: t(translator)`Separate your CV into clearly named sections.`,
			}))
			.with("NO_EDUCATION_SECTION", () => ({
				why: t(translator)`A clear heading makes qualifications easier to find.`,
				title: t(translator)`Add an education heading`,
				action: t(translator)`Put your qualifications under an Education heading.`,
			}))
			.with("NO_SKILLS_SECTION", () => ({
				why: t(translator)`A clear skills section helps readers find your tools.`,
				title: t(translator)`Add a skills heading`,
				action: t(translator)`List the tools and skills you actually use.`,
			}))
			.with("HEADINGS_NOT_DISTINGUISHED", () => ({
				why: t(translator)`Headings that look like body text are harder to spot.`,
				title: t(translator)`Make section headings stand out`,
				action: t(translator)`Make headings larger or bolder than body text.`,
			}))
			.with("VERY_SHORT_DOCUMENT", () => ({
				why: t(translator)`Very little text was recovered from the file.`,
				title: t(translator)`Check for missing PDF content`,
				action: t(translator)`Check that all expected content is present and selectable.`,
			}))
			.with("NO_BULLET_POINTS", () => ({
				why: t(translator)`Short bullets are easier to scan than long paragraphs.`,
				title: t(translator)`Use short lists for your experience`,
				action: t(translator)`Describe each role with a few clear bullets.`,
			}))
			.with("NO_ROLE_LINES", () => ({
				why: t(translator)`Readers need to know where you held each role.`,
				title: t(translator)`Pair each role with its employer`,
				action: t(translator)`Place the role, employer and dates together.`,
			}))
			.with("NO_SUMMARY_SECTION", () => ({
				why: t(translator)`A summary gives readers context for your experience.`,
				title: t(translator)`Add a short professional summary`,
				action: t(translator)`Write two or three lines about the work you do.`,
			}))
			// ---- Contact details ----
			.with("NO_EMAIL", () => ({
				why: t(translator)`An email gives recruiters a way to reach you.`,
				title: t(translator)`Add an email address`,
				action: t(translator)`Put a plain email address near the top of page one.`,
			}))
			.with("NO_PHONE", () => ({
				why: t(translator)`Some application forms require a phone number.`,
				title: t(translator)`Add a phone number`,
				action: t(translator)`Include a phone number with its country code.`,
			}))
			.with("NO_NAME_LINE", () => ({
				why: t(translator)`A clear name identifies whose CV this is.`,
				title: t(translator)`Put your name at the top`,
				action: t(translator)`Write your name on its own line at the top.`,
			}))
			.with("CONTACT_NOT_ON_FIRST_PAGE", () => ({
				why: t(translator)`Contact details are easier to find there.`,
				title: t(translator)`Move contact details to page one`,
				action: t(translator)`Place your email and phone near the top.`,
			}))
			.with("EMAIL_SPLIT_ACROSS_ITEMS", () => ({
				why: t(translator)`A split address may not be recognized as an email.`,
				title: t(translator)`Keep your email address together`,
				action: t(translator)`Write it as one continuous address with no added spacing.`,
			}))
			.with("LINK_TEXT_URL_MISMATCH", () => ({
				why: t(translator)`The destination differs from the address shown.`,
				title: t(translator)`Check where this link opens`,
				action: t(translator)`Make the displayed address and destination match.`,
			}))
			.with("MULTIPLE_EMAILS", () => ({
				why: t(translator)`Several addresses can leave readers unsure which to use.`,
				title: t(translator)`Choose one contact email`,
				action: t(translator)`Keep one email address for applications.`,
			}))
			.with("NO_PROFESSIONAL_LINK", () => ({
				why: t(translator)`A profile or portfolio can support your experience.`,
				title: t(translator)`Add a link that shows your work`,
				action: t(translator)`Add a relevant profile, portfolio or repository link.`,
			}))
			.with("BARE_URL_WITHOUT_PROTOCOL", () => ({
				why: t(translator)`A full address is easier to recognize as a link.`,
				title: t(translator)`Write the full web address`,
				action: t(translator)`Include https:// at the start of the address.`,
			}))
			.with("PHONE_FORMAT_UNUSUAL", () => ({
				why: t(translator)`A standard format makes your number easier to recognize.`,
				title: t(translator)`Use a clear international phone format`,
				action: t(translator)`Write the country code followed by your phone number.`,
			}))
			// ---- Dates ----
			.with("NO_DATES_FOUND", () => ({
				why: t(translator)`Dates help readers follow your work history.`,
				title: t(translator)`Add dates to your experience`,
				action: t(translator)`Give each role a clear start and end date.`,
			}))
			.with("FEW_DATES", () => ({
				why: t(translator)`Missing dates leave parts of your timeline unclear.`,
				title: t(translator)`Add dates to undated entries`,
				action: t(translator)`Add date ranges for roles and qualifications.`,
			}))
			.with("UNPARSEABLE_DATE_RANGE", () => ({
				why: t(translator)`This date format may be hard for software to read.`,
				title: t(translator)`Use a clearer date range`,
				action: t(translator)`Use a form such as "Jan 2020 – Mar 2022" or "2020 – 2022".`,
			}))
			.with("REVERSED_DATE_RANGE", () => ({
				why: t(translator)`The end date is earlier than the start date.`,
				title: t(translator)`Check the start and end dates`,
				action: t(translator)`Correct the dates so they reflect the actual period.`,
			}))
			.with("FUTURE_DATED_ENTRY", () => ({
				why: t(translator)`A future date can make your timeline unclear.`,
				title: t(translator)`Review this future date`,
				action: t(translator)`Check the year; mark ongoing work as current only if it is.`,
			}))
			.with("MIXED_DATE_FORMATS", () => ({
				why: t(translator)`Consistent dates are easier to follow.`,
				title: t(translator)`Use one date format throughout`,
				action: t(translator)`Choose one date format and use it for all entries.`,
			}))
			.with("NO_CURRENT_ROLE_MARKER", () => ({
				why: t(translator)`This helps readers distinguish current work from past roles.`,
				title: t(translator)`Mark your current role as ongoing`,
				action: t(translator)`If you still work there, use "Present" instead of an end date.`,
			}))
			.with("AMBIGUOUS_NUMERIC_DATE", () => ({
				why: t(translator)`Numeric dates can mean different months in different countries.`,
				title: t(translator)`Write the month name`,
				action: t(translator)`Use a month name, such as "Mar 2022".`,
			}))
			// ---- Content: unscored advice ----
			.with("NO_QUANTIFIED_IMPACT", () => ({
				why: t(translator)`Real figures help readers understand the scale of your work.`,
				title: t(translator)`Add figures you can support`,
				action: t(translator)`Add known volumes, time saved or team sizes; do not invent numbers.`,
			}))
			.with("WEAK_ACTION_VERBS", () => ({
				why: t(translator)`Concrete verbs make your contribution clearer.`,
				title: t(translator)`Start bullets with what you did`,
				action: t(translator)`Use verbs that match your actual role, such as built or supported.`,
			}))
			.with("FIRST_PERSON_PRONOUNS", () => ({
				why: t(translator)`Direct phrasing is easier to scan.`,
				title: t(translator)`Start with the action instead of “I”`,
				action: t(translator)`Remove unnecessary pronouns while keeping the meaning.`,
			}))
			.with("LONG_BULLETS", () => ({
				why: t(translator)`Shorter points are easier to scan.`,
				title: t(translator)`Shorten long bullet points`,
				action: t(translator)`Aim for roughly two lines per point without losing key facts.`,
			}))
			.with("HIGH_PAGE_COUNT", () => ({
				why: t(translator)`Useful content matters more than a fixed page limit.`,
				title: t(translator)`Review what each page adds`,
				action: t(translator)`Keep relevant pages; there is no universal one-page rule.`,
			}))
			.with("EMPLOYMENT_GAP", () => ({
				why: t(translator)`Context is optional and can help explain your timeline.`,
				title: t(translator)`Add timeline context if you want`,
				action: t(translator)`A gap is not a defect; add a brief explanation only if useful.`,
			}))
			.with("ALL_CAPS_RUNS", () => ({
				why: t(translator)`Long capitalized passages are harder to scan.`,
				title: t(translator)`Use capitals sparingly`,
				action: t(translator)`Reserve all-capitals text for short headings.`,
			}))
			.with("REPEATED_PHRASES", () => ({
				why: t(translator)`Distinct openings help readers see different contributions.`,
				title: t(translator)`Vary repeated bullet openings`,
				action: t(translator)`Use a different opening when it better describes the work.`,
			}))
			.exhaustive()
	);
}

export function getPdfSeverityLabel(severity: PdfSeverity, translator: I18n = i18n): string {
	return match(severity)
		.with("blocker", () => t(translator)`Blocker`)
		.with("warning", () => t(translator)`Warning`)
		.with("tip", () => t(translator)`Tip`)
		.exhaustive();
}
