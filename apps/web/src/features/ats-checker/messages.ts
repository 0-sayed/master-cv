import type { PdfRuleCode, PdfSeverity } from "@reactive-resume/resume/ats-pdf";
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
export function getPdfFindingMessage(code: PdfRuleCode): PdfFindingMessage {
	return (
		match(code)
			// ---- Parseability: nothing readable came out ----
			.with("NO_TEXT_LAYER", () => ({
				why: t`Hiring systems need text they can select and read.`,
				title: t`Export a PDF with selectable text`,
				action: t`Export as text, rather than a scan or image.`,
			}))
			.with("IMAGE_ONLY_DOCUMENT", () => ({
				why: t`Text inside images may be missed.`,
				title: t`Replace page images with real text`,
				action: t`Export directly from the original document.`,
			}))
			.with("GARBLED_TEXT", () => ({
				why: t`Unreadable characters can hide your experience.`,
				title: t`Check the text in your exported PDF`,
				action: t`Embed fonts, then check that copied text reads correctly.`,
			}))
			.with("TYPE3_FONT", () => ({
				why: t`Type 3 fonts can make words unreadable to software.`,
				title: t`Replace drawing-based fonts`,
				action: t`Use a TrueType or OpenType font and export again.`,
			}))
			.with("INVALID_EMBEDDED_FONT", () => ({
				why: t`A damaged embedded font can hide words.`,
				title: t`Export again with readable fonts`,
				action: t`Embed fonts from the original document and export again.`,
			}))
			// ---- Parseability: the file is the wrong kind of thing ----
			.with("FILE_TOO_LARGE", () => ({
				why: t`Some application forms limit upload size.`,
				title: t`Reduce the PDF file size`,
				action: t`Keep the file under 2.5 MB by shrinking or removing images.`,
			}))
			.with("ENCRYPTED_PDF", () => ({
				why: t`Protection can prevent software from reading the file.`,
				title: t`Save a copy without password protection`,
				action: t`Remove the password and reading restrictions from the copy.`,
			}))
			.with("XFA_FORM", () => ({
				why: t`Some software cannot read text inside XFA forms.`,
				title: t`Export the form as a regular PDF`,
				action: t`Print or export the completed form to a flat PDF.`,
			}))
			.with("PDF_PORTFOLIO", () => ({
				why: t`Software may read only the portfolio cover.`,
				title: t`Send the CV itself`,
				action: t`Export the CV separately from the PDF Portfolio.`,
			}))
			.with("ACROFORM_FIELDS", () => ({
				why: t`Form answers may be missing from extracted text.`,
				title: t`Save form answers as page text`,
				action: t`Flatten the completed form before sending it.`,
			}))
			// ---- Parseability: the characters came out wrong ----
			.with("REPLACEMENT_CHARACTERS", () => ({
				why: t`Missing letters can change names and search terms.`,
				title: t`Check missing letters in the PDF`,
				action: t`Embed fonts and check the copied text.`,
			}))
			.with("PRIVATE_USE_CHARACTERS", () => ({
				why: t`Some symbols have no meaning outside their font.`,
				title: t`Replace font symbols with plain text`,
				action: t`Use text labels instead of icon-font characters.`,
			}))
			.with("LIGATURE_CHARACTERS", () => ({
				why: t`Some joined shapes can lose letters during extraction.`,
				title: t`Check words with joined letter shapes`,
				action: t`Turn off optional ligatures and export again.`,
			}))
			.with("NON_EMBEDDED_FONTS", () => ({
				why: t`Missing fonts can change how words are read.`,
				title: t`Include fonts in the exported file`,
				action: t`Enable font embedding when exporting.`,
			}))
			.with("LOST_WORD_SPACING", () => ({
				why: t`Joined words can be harder to recognize.`,
				title: t`Restore spaces between words`,
				action: t`Export from the original document and check the copied text.`,
			}))
			.with("SPLIT_CHARACTER_SPACING", () => ({
				why: t`Widely separated letters may not be read as words.`,
				title: t`Reduce spacing between letters`,
				action: t`Remove extra letter spacing and export again.`,
			}))
			// ---- Parseability: what the document declares about itself ----
			.with("INVISIBLE_TEXT", () => ({
				why: t`Hidden text may differ from what the reader sees.`,
				title: t`Review text hidden behind the page`,
				action: t`Keep scan-recognition text only if it matches the visible page.`,
			}))
			.with("WHITE_TEXT", () => ({
				why: t`Hidden words can misrepresent the visible CV.`,
				title: t`Remove white text on white backgrounds`,
				action: t`Delete hidden keywords and keep the visible content.`,
			}))
			.with("LOW_TEXT_DENSITY", () => ({
				why: t`Only a small part of the page text was recovered.`,
				title: t`Check that all your content is readable`,
				action: t`Try selecting and copying each part of the PDF.`,
			}))
			.with("HIGH_IMAGE_COVERAGE", () => ({
				why: t`Text inside large images may be missed.`,
				title: t`Keep key information outside images`,
				action: t`Use real text for experience, skills and contact details.`,
			}))
			.with("VERTICAL_TEXT", () => ({
				why: t`Rotated text may be skipped or read out of order.`,
				title: t`Keep text horizontal`,
				action: t`Rotate text back to a horizontal reading direction.`,
			}))
			.with("ROTATED_PAGES", () => ({
				why: t`Rotated pages can affect reading order.`,
				title: t`Make every page upright`,
				action: t`Save all pages in their normal upright orientation.`,
			}))
			.with("NON_STANDARD_PAGE_SIZE", () => ({
				why: t`Unusual sizes can crop content in other viewers.`,
				title: t`Use a standard page size`,
				action: t`Choose A4 or US Letter and export again.`,
			}))
			.with("UNTAGGED_PDF", () => ({
				why: t`Tags help software follow the reading order.`,
				title: t`Add accessibility tags when available`,
				action: t`Enable tagged PDF export if your editor supports it.`,
			}))
			.with("MISSING_DOCUMENT_LANGUAGE", () => ({
				why: t`The language setting helps software interpret the text.`,
				title: t`Set the PDF language`,
				action: t`Set the document language before exporting.`,
			}))
			.with("LARGE_FILE_SIZE", () => ({
				why: t`Large files take longer to upload.`,
				title: t`Make the PDF lighter`,
				action: t`Compress large images or remove unnecessary ones.`,
			}))
			.with("TRUNCATED_ANALYSIS", () => ({
				why: t`The result covers only the first pages.`,
				title: t`Review the pages beyond this check`,
				action: t`Check the remaining pages yourself; this is not a file defect.`,
			}))
			// ---- Layout ----
			.with("MULTI_COLUMN_LAYOUT", () => ({
				why: t`Columns can change the order software reads text.`,
				title: t`Keep related text in one column`,
				action: t`Use one column for content that needs a clear sequence.`,
			}))
			.with("READING_ORDER_INVERSION", () => ({
				why: t`The extracted text follows a different order from the page.`,
				title: t`Correct the PDF reading order`,
				action: t`Try a single-column layout, then copy the text to check its order.`,
			}))
			.with("READING_ORDER_RISK", () => ({
				why: t`A role may become separated from its description.`,
				title: t`Review lines that read out of order`,
				action: t`Copy the PDF text and check that related lines stay together.`,
			}))
			.with("COLUMN_GUTTER", () => ({
				why: t`A wide column gap can split the reading sequence.`,
				title: t`Check the order across columns`,
				action: t`Use one column, or keep the sidebar to short lists.`,
			}))
			.with("TABLE_LIKE_LAYOUT", () => ({
				why: t`Table cells may be read in the wrong order.`,
				title: t`Move key content out of tables`,
				action: t`Use paragraphs and lists for content that needs a sequence.`,
			}))
			.with("TEXT_IN_MARGIN_ZONE", () => ({
				why: t`Some software skips headers and footers.`,
				title: t`Move key text away from page edges`,
				action: t`Move important details into the page body.`,
			}))
			.with("TIGHT_LINE_SPACING", () => ({
				why: t`Tightly packed lines may merge during extraction.`,
				title: t`Give lines more space`,
				action: t`Increase line spacing and check the exported text.`,
			}))
			.with("SMALL_BODY_TEXT", () => ({
				why: t`Small text is harder to read.`,
				title: t`Increase the body text size`,
				action: t`Use a body font of at least 9 pt.`,
			}))
			.with("MANY_DISTINCT_FONTS", () => ({
				why: t`Each font adds another mapping for software to read.`,
				title: t`Use fewer font families`,
				action: t`Keep to two or three font families.`,
			}))
			.with("NARROW_PAGE_MARGINS", () => ({
				why: t`Text close to an edge can be cut off.`,
				title: t`Widen the page margins`,
				action: t`Leave at least half an inch around the page.`,
			}))
			.with("TEXT_OUTSIDE_PAGE", () => ({
				why: t`Content outside the page may be missed.`,
				title: t`Bring text inside the page`,
				action: t`Move all content inside the page boundaries.`,
			}))
			.with("NON_STANDARD_BULLET_GLYPHS", () => ({
				why: t`Unusual bullet symbols may appear inside words.`,
				title: t`Use standard list bullets`,
				action: t`Use your editor's built-in bullet list.`,
			}))
			.with("DENSE_PAGE", () => ({
				why: t`Crowded pages are harder to skim.`,
				title: t`Give sections more breathing room`,
				action: t`Add space between sections without removing useful facts.`,
			}))
			.with("REPEATED_HEADER_FOOTER", () => ({
				why: t`Repeated lines also appear in extracted text.`,
				title: t`Shorten repeated page headers`,
				action: t`Keep repeated headers brief or remove them.`,
			}))
			// ---- Sections ----
			.with("NO_EXPERIENCE_SECTION", () => ({
				why: t`A clear heading helps readers find your work history.`,
				title: t`Add a clear experience heading`,
				action: t`Use a heading such as "Experience" or "Work Experience".`,
			}))
			.with("NO_RECOGNIZED_HEADINGS", () => ({
				why: t`Clear headings help software separate your information.`,
				title: t`Use familiar section headings`,
				action: t`Use headings such as Experience, Education and Skills.`,
			}))
			.with("FEW_SECTION_HEADINGS", () => ({
				why: t`Only one familiar heading was found.`,
				title: t`Give each section a clear heading`,
				action: t`Separate your CV into clearly named sections.`,
			}))
			.with("NO_EDUCATION_SECTION", () => ({
				why: t`A clear heading makes qualifications easier to find.`,
				title: t`Add an education heading`,
				action: t`Put your qualifications under an Education heading.`,
			}))
			.with("NO_SKILLS_SECTION", () => ({
				why: t`A clear skills section helps readers find your tools.`,
				title: t`Add a skills heading`,
				action: t`List the tools and skills you actually use.`,
			}))
			.with("HEADINGS_NOT_DISTINGUISHED", () => ({
				why: t`Headings that look like body text are harder to spot.`,
				title: t`Make section headings stand out`,
				action: t`Make headings larger or bolder than body text.`,
			}))
			.with("VERY_SHORT_DOCUMENT", () => ({
				why: t`Very little text was recovered from the file.`,
				title: t`Check for missing PDF content`,
				action: t`Check that all expected content is present and selectable.`,
			}))
			.with("NO_BULLET_POINTS", () => ({
				why: t`Short bullets are easier to scan than long paragraphs.`,
				title: t`Use short lists for your experience`,
				action: t`Describe each role with a few clear bullets.`,
			}))
			.with("NO_ROLE_LINES", () => ({
				why: t`Readers need to know where you held each role.`,
				title: t`Pair each role with its employer`,
				action: t`Place the role, employer and dates together.`,
			}))
			.with("NO_SUMMARY_SECTION", () => ({
				why: t`A summary gives readers context for your experience.`,
				title: t`Add a short professional summary`,
				action: t`Write two or three lines about the work you do.`,
			}))
			// ---- Contact details ----
			.with("NO_EMAIL", () => ({
				why: t`An email gives recruiters a way to reach you.`,
				title: t`Add an email address`,
				action: t`Put a plain email address near the top of page one.`,
			}))
			.with("NO_PHONE", () => ({
				why: t`Some application forms require a phone number.`,
				title: t`Add a phone number`,
				action: t`Include a phone number with its country code.`,
			}))
			.with("NO_NAME_LINE", () => ({
				why: t`A clear name identifies whose CV this is.`,
				title: t`Put your name at the top`,
				action: t`Write your name on its own line at the top.`,
			}))
			.with("CONTACT_NOT_ON_FIRST_PAGE", () => ({
				why: t`Contact details are easier to find there.`,
				title: t`Move contact details to page one`,
				action: t`Place your email and phone near the top.`,
			}))
			.with("EMAIL_SPLIT_ACROSS_ITEMS", () => ({
				why: t`A split address may not be recognized as an email.`,
				title: t`Keep your email address together`,
				action: t`Write it as one continuous address with no added spacing.`,
			}))
			.with("LINK_TEXT_URL_MISMATCH", () => ({
				why: t`The destination differs from the address shown.`,
				title: t`Check where this link opens`,
				action: t`Make the displayed address and destination match.`,
			}))
			.with("MULTIPLE_EMAILS", () => ({
				why: t`Several addresses can leave readers unsure which to use.`,
				title: t`Choose one contact email`,
				action: t`Keep one email address for applications.`,
			}))
			.with("NO_PROFESSIONAL_LINK", () => ({
				why: t`A profile or portfolio can support your experience.`,
				title: t`Add a link that shows your work`,
				action: t`Add a relevant profile, portfolio or repository link.`,
			}))
			.with("BARE_URL_WITHOUT_PROTOCOL", () => ({
				why: t`A full address is easier to recognize as a link.`,
				title: t`Write the full web address`,
				action: t`Include https:// at the start of the address.`,
			}))
			.with("PHONE_FORMAT_UNUSUAL", () => ({
				why: t`A standard format makes your number easier to recognize.`,
				title: t`Use a clear international phone format`,
				action: t`Write the country code followed by your phone number.`,
			}))
			// ---- Dates ----
			.with("NO_DATES_FOUND", () => ({
				why: t`Dates help readers follow your work history.`,
				title: t`Add dates to your experience`,
				action: t`Give each role a clear start and end date.`,
			}))
			.with("FEW_DATES", () => ({
				why: t`Missing dates leave parts of your timeline unclear.`,
				title: t`Add dates to undated entries`,
				action: t`Add date ranges for roles and qualifications.`,
			}))
			.with("UNPARSEABLE_DATE_RANGE", () => ({
				why: t`This date format may be hard for software to read.`,
				title: t`Use a clearer date range`,
				action: t`Use a form such as "Jan 2020 – Mar 2022" or "2020 – 2022".`,
			}))
			.with("REVERSED_DATE_RANGE", () => ({
				why: t`The end date is earlier than the start date.`,
				title: t`Check the start and end dates`,
				action: t`Correct the dates so they reflect the actual period.`,
			}))
			.with("FUTURE_DATED_ENTRY", () => ({
				why: t`A future date can make your timeline unclear.`,
				title: t`Review this future date`,
				action: t`Check the year; mark ongoing work as current only if it is.`,
			}))
			.with("MIXED_DATE_FORMATS", () => ({
				why: t`Consistent dates are easier to follow.`,
				title: t`Use one date format throughout`,
				action: t`Choose one date format and use it for all entries.`,
			}))
			.with("NO_CURRENT_ROLE_MARKER", () => ({
				why: t`This helps readers distinguish current work from past roles.`,
				title: t`Mark your current role as ongoing`,
				action: t`If you still work there, use "Present" instead of an end date.`,
			}))
			.with("AMBIGUOUS_NUMERIC_DATE", () => ({
				why: t`Numeric dates can mean different months in different countries.`,
				title: t`Write the month name`,
				action: t`Use a month name, such as "Mar 2022".`,
			}))
			// ---- Content: unscored advice ----
			.with("NO_QUANTIFIED_IMPACT", () => ({
				why: t`Real figures help readers understand the scale of your work.`,
				title: t`Add figures you can support`,
				action: t`Add known volumes, time saved or team sizes; do not invent numbers.`,
			}))
			.with("WEAK_ACTION_VERBS", () => ({
				why: t`Concrete verbs make your contribution clearer.`,
				title: t`Start bullets with what you did`,
				action: t`Use verbs that match your actual role, such as built or supported.`,
			}))
			.with("FIRST_PERSON_PRONOUNS", () => ({
				why: t`Direct phrasing is easier to scan.`,
				title: t`Start with the action instead of “I”`,
				action: t`Remove unnecessary pronouns while keeping the meaning.`,
			}))
			.with("LONG_BULLETS", () => ({
				why: t`Shorter points are easier to scan.`,
				title: t`Shorten long bullet points`,
				action: t`Aim for roughly two lines per point without losing key facts.`,
			}))
			.with("HIGH_PAGE_COUNT", () => ({
				why: t`Useful content matters more than a fixed page limit.`,
				title: t`Review what each page adds`,
				action: t`Keep relevant pages; there is no universal one-page rule.`,
			}))
			.with("EMPLOYMENT_GAP", () => ({
				why: t`Context is optional and can help explain your timeline.`,
				title: t`Add timeline context if you want`,
				action: t`A gap is not a defect; add a brief explanation only if useful.`,
			}))
			.with("ALL_CAPS_RUNS", () => ({
				why: t`Long capitalized passages are harder to scan.`,
				title: t`Use capitals sparingly`,
				action: t`Reserve all-capitals text for short headings.`,
			}))
			.with("REPEATED_PHRASES", () => ({
				why: t`Distinct openings help readers see different contributions.`,
				title: t`Vary repeated bullet openings`,
				action: t`Use a different opening when it better describes the work.`,
			}))
			.exhaustive()
	);
}

export function getPdfSeverityLabel(severity: PdfSeverity): string {
	return match(severity)
		.with("blocker", () => t`Blocker`)
		.with("warning", () => t`Warning`)
		.with("tip", () => t`Tip`)
		.exhaustive();
}
