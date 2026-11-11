import type { ResumeData, SectionType } from "@reactive-resume/schema/resume/data";
import { normalizeSectionHeading } from "@reactive-resume/resume/ats";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { parsePeriod, parseSingleDate } from "@reactive-resume/schema/resume/period";
import { generateId, normalizeNumericDigits } from "@reactive-resume/utils/string";
import { BULLET_PATTERN, toHtml } from "./html";
import { normalizeImportedText } from "./normalize";

export type ImportReviewIssue = {
	field: "name" | "headline" | "location" | "position" | "company" | "phone";
	source: string;
};
type ImportOptions = { locale?: string; onUncertain?: (issue: ImportReviewIssue) => void };

type SectionKey = SectionType | "summary";

type Segment = {
	key: SectionKey | null;
	title: string;
	lines: string[];
};

type RawEntry = {
	period: string;
	headerParts: string[];
	body: string[];
};

const MAX_HEADING_WORDS = 4;
const MAX_HEADING_LENGTH = 48;
const MAX_ENTRY_HEADER_WORDS = 8;
const MAX_LIST_ITEMS = 60;
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

const SECTION_ALIASES: Readonly<Record<string, SectionKey>> = {
	الملخص: "summary",
	"الملخص المهني": "summary",
	نبذة: "summary",
	"نبذة عني": "summary",
	الخبرة: "experience",
	"الخبرة العملية": "experience",
	"الخبرات العملية": "experience",
	"الخبرة المهنية": "experience",
	"الخبرات المهنية": "experience",
	الخبرات: "experience",
	التعليم: "education",
	"المؤهلات العلمية": "education",
	المهارات: "skills",
	"المهارات التقنية": "skills",
	المشاريع: "projects",
	اللغات: "languages",
	الشهادات: "certifications",
	"الدورات والشهادات": "certifications",
	الجوائز: "awards",
	المنشورات: "publications",
	التطوع: "volunteer",
	الاهتمامات: "interests",
	المراجع: "references",
	الروابط: "profiles",
	summary: "summary",
	"professional summary": "summary",
	"career summary": "summary",
	profile: "summary",
	"personal profile": "summary",
	about: "summary",
	"about me": "summary",
	objective: "summary",
	"career objective": "summary",
	experience: "experience",
	"work experience": "experience",
	"professional experience": "experience",
	employment: "experience",
	"employment history": "experience",
	"work history": "experience",
	"career history": "experience",
	education: "education",
	"academic background": "education",
	"education and training": "education",
	qualifications: "education",
	skills: "skills",
	"technical skills": "skills",
	"key skills": "skills",
	"core competencies": "skills",
	competencies: "skills",
	expertise: "skills",
	projects: "projects",
	"personal projects": "projects",
	"selected projects": "projects",
	"side projects": "projects",
	languages: "languages",
	interests: "interests",
	hobbies: "interests",
	"hobbies and interests": "interests",
	awards: "awards",
	honors: "awards",
	honours: "awards",
	"awards and honors": "awards",
	achievements: "awards",
	certifications: "certifications",
	certificates: "certifications",
	licenses: "certifications",
	"licenses and certifications": "certifications",
	publications: "publications",
	papers: "publications",
	research: "publications",
	volunteer: "volunteer",
	volunteering: "volunteer",
	"volunteer experience": "volunteer",
	"community involvement": "volunteer",
	references: "references",
	profiles: "profiles",
	links: "profiles",
	"social profiles": "profiles",
};

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]*\w/;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s,;|•·]+/gi;
const PHONE_CANDIDATE = /[+(]?\p{Nd}[\p{Nd} \t().+-]{5,}\p{Nd}/gu;
const URL_TEST = /\b(?:https?:\/\/|www\.)\S+/i;
const HEADER_SCAN_LINES = 6;
const ENTRY_PREAMBLE_LOOKAHEAD = 4;
// Match complete endpoints before their shared prefixes (2026-07 must not become 2026).
const DATE_ENDPOINT = String.raw`(?:(?:\p{L}{3,}\.?\s+)?(?:\p{Nd}{1,2}[/.])?\p{Nd}{4}(?:-\p{Nd}{1,2})?)`;
const PERIOD_CANDIDATE = new RegExp(
	String.raw`${DATE_ENDPOINT}\s*(?:[-–—~]|to|until|through)\s*(?:${DATE_ENDPOINT}|حتى\s+(?:الآن|اليوم)|to\s+date|\p{L}+)`,
	"giu",
);
const STRONG_SEPARATOR = /\s*[|•·]\s*|\s{2,}|\s+[–—]\s+/;
const SENTENCE_END = /[.!?]$/;
const TRAILING_DATES = [/(?:\p{L}{3,}\.?\s+)?(?:\d{1,2}[/.])?(?:19|20)\d{2}$/u, /(?:\d{1,2}[/.])?(?:19|20)\d{2}$/];

const normalizeHeading = normalizeSectionHeading;

function knownHeading(line: string): SectionKey | null {
	const normalized = normalizeHeading(line);
	if (!normalized || normalized.split(" ").length > MAX_HEADING_WORDS) return null;

	return SECTION_ALIASES[normalized] ?? null;
}

function looksLikeHeading(line: string): boolean {
	const trimmed = line.trim().replace(/[:：]$/, "");
	if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
	if (trimmed.split(/\s+/).length > MAX_HEADING_WORDS) return false;

	const letters = trimmed.replace(/[^\p{L}]/gu, "");
	if (letters.length < 3) return false;

	return letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase();
}

function looksLikeTitleCaseHeading(line: string): boolean {
	const trimmed = line.trim().replace(/[:：]$/, "");
	if (!trimmed || trimmed.length > MAX_HEADING_LENGTH || /\d/.test(trimmed)) return false;
	const words = trimmed.split(/\s+/);
	if (words.length > MAX_HEADING_WORDS) return false;

	return words.every((word) => {
		const letters = word.replace(/[^\p{L}]/gu, "");
		if (letters.length === 0) return false;
		return letters[0] === letters[0]?.toLocaleUpperCase() && letters.slice(1) === letters.slice(1).toLocaleLowerCase();
	});
}

/**
 * Whether a line could be the header of an entry rather than prose belonging to the previous one.
 *
 * Unbulleted descriptions are common, and without this test any narrative line that happens to sit
 * within the lookahead of the next role's dates would be promoted to a header, stealing the current
 * entry's description and seeding a garbage item from a sentence.
 */
function looksLikeEntryHeader(line: string): boolean {
	const trimmed = line.trim();
	if (STRONG_SEPARATOR.test(trimmed)) return true;
	if (SENTENCE_END.test(trimmed)) return false;

	return trimmed.split(/\s+/).length <= MAX_ENTRY_HEADER_WORDS;
}

function findPeriod(line: string, locale = "en-US"): string {
	// Explicit calendar labels and day-level numeric dates require review, not silent omission.
	if (
		/^\s*\p{Nd}{4}\s*(?:هـ?|هجري)(?:\s*[-–—]\s*\p{Nd}{4}\s*(?:هـ?|هجري))?\s*$/u.test(line) ||
		/^\s*\p{Nd}{1,2}[/.-]\p{Nd}{1,2}[/.-]\p{Nd}{4}\s*$/u.test(line)
	)
		return line.trim();
	PERIOD_CANDIDATE.lastIndex = 0;

	for (const match of line.match(PERIOD_CANDIDATE) ?? []) {
		if (parsePeriod(match, locale)) return match.trim();
	}

	return "";
}

function findSingleDate(text: string, locale = "en-US"): string {
	const trimmed = text.trim();
	if (parseSingleDate(trimmed, locale)) return trimmed;

	for (const pattern of TRAILING_DATES) {
		const value = pattern.exec(trimmed)?.[0]?.trim();
		if (value && parseSingleDate(value, locale)) return value;
	}

	return "";
}

function extractPhone(text: string): string {
	// Remove entire contact tokens before scanning, so a digit-leading email or URL cannot
	// contribute a numeric prefix. Preserve line boundaries and the phone's original grouping.
	const phoneText = text.replace(/\S*@\S*|\S*(?:[\p{L}]\.[\p{L}]|:\/\/|\/)[^\s]*/gu, " ");
	for (const candidate of phoneText.match(PHONE_CANDIDATE) ?? []) {
		const digits = normalizeNumericDigits(candidate).replace(/\D/g, "");
		if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) continue;
		if (parsePeriod(candidate)) continue;

		return candidate.trim();
	}

	return "";
}

function isDateLine(line: string, allowSingleDate = true, locale = "en-US"): boolean {
	if (findPeriod(line, locale)) return true;
	// A section grouped without single dates reads a bare "2022" as text, so the lookahead has to
	// agree with it: otherwise that line closes an entry that groupEntries then never reopens.
	if (!allowSingleDate) return false;

	const bare = line.replace(BULLET_PATTERN, "").trim();
	return bare !== "" && parseSingleDate(bare, locale) !== null;
}

function introducesEntry(lines: readonly string[], index: number, allowSingleDate = true, locale = "en-US"): boolean {
	for (let offset = 1; offset <= ENTRY_PREAMBLE_LOOKAHEAD; offset++) {
		const line = lines[index + offset];
		if (line === undefined || BULLET_PATTERN.test(line)) return false;
		if (isDateLine(line, allowSingleDate, locale)) return true;
	}

	return false;
}

function headerBoundary(lines: string[]): number {
	let boundary = 0;

	for (const [index, line] of lines.slice(0, HEADER_SCAN_LINES).entries()) {
		if (knownHeading(line)) break;
		if (EMAIL_PATTERN.test(line) || URL_TEST.test(line) || extractPhone(line)) boundary = index;
	}

	return boundary;
}

function splitHeaderParts(text: string): string[] {
	return text
		.split(STRONG_SEPARATOR)
		.map((part) => part.replace(/^[\s,;|•·–—-]+|[\s,;|•·–—-]+$/g, "").trim())
		.filter(Boolean);
}

function splitList(lines: string[]): string[] {
	const values: string[] = [];

	for (const line of lines) {
		for (const piece of line.replace(BULLET_PATTERN, "").split(/[,;|•·]|\s{3,}/)) {
			const value = piece.trim();
			if (value) values.push(value);
		}
	}

	return [...new Set(values)].slice(0, MAX_LIST_ITEMS);
}

/**
 * Guarantees an entry has header text, because every section shape maps `headerParts[0]` onto a
 * field the resume schema requires to be non-empty. A section whose first line is a date opens an
 * entry with an empty header, and without this the whole import fails validation on that one item.
 */
function withHeaderText(entry: RawEntry): RawEntry {
	if (entry.headerParts.length > 0) return entry;

	const [first, ...rest] = entry.body;
	return { ...entry, headerParts: splitHeaderParts(first ?? ""), body: rest };
}

function groupEntries(lines: string[], allowSingleDate = false, locale = "en-US"): RawEntry[] {
	const cleaned = lines.map((line) => line.trim()).filter(Boolean);
	const entries: RawEntry[] = [];
	let current: RawEntry | null = null;

	const dateOf = (line: string) => {
		if (BULLET_PATTERN.test(line)) return "";

		const period = findPeriod(line, locale);
		if (period) return period;

		return allowSingleDate ? findSingleDate(line, locale) : "";
	};

	for (const [index, line] of cleaned.entries()) {
		const date = dateOf(line);

		if (date) {
			const remainder = splitHeaderParts(line.replace(date, " "));

			if (current && !current.period) {
				current.period = date;
				current.headerParts.push(...remainder);
				continue;
			}

			if (current) entries.push(current);
			current = { period: date, headerParts: remainder, body: [] };
			continue;
		}

		if (!current) {
			current = { period: "", headerParts: splitHeaderParts(line), body: [] };
			continue;
		}

		const isBullet = BULLET_PATTERN.test(line);
		const leadsToDate =
			!isBullet && looksLikeEntryHeader(line) && introducesEntry(cleaned, index, allowSingleDate, locale);

		if (leadsToDate && !current.period && current.body.length === 0) {
			current.headerParts.push(...splitHeaderParts(line));
			continue;
		}

		if (leadsToDate) {
			entries.push(current);
			current = { period: "", headerParts: splitHeaderParts(line), body: [] };
			continue;
		}

		current.body.push(line);
	}

	if (current) entries.push(current);

	return entries.map(withHeaderText).filter((entry) => entry.headerParts.length > 0);
}

function entryDescription(entry: RawEntry, usedParts: number): string {
	const leftover = entry.headerParts.slice(usedParts);
	return toHtml([...leftover, ...entry.body]);
}

const baseItem = () => ({ id: generateId(), hidden: false });

const emptyWebsite = { url: "", label: "", inlineLink: false };

// Recognition hints, not a title generator. Unrecognized fields stay reviewable.
const ROLE_WORD =
	/\b(?:engineer|developer|designer|manager|director|analyst|accountant|consultant|specialist|officer|lead|architect|administrator|coordinator|technician|teacher|researcher|intern|founder)\b|(?:مهندس|مهندسة|مطور|مطورة|مدير|مديرة|مصمم|مصممة|محلل|محللة|محاسب|محاسبة|استشاري|أخصائي|مسؤول|معلم|باحث)/iu;
const WORK_MODE = /^(?:remote|hybrid|on[- ]site|عن بعد|هجين|حضوري)$/iu;
const PLACE =
	/^(?:Saudi Arabia|Egypt|United Arab Emirates|UAE|UK|United Kingdom|United States|USA|Germany|France|Canada|India|Berlin|London|Cairo|Riyadh|Dubai|السعودية|مصر|الإمارات|الرياض|القاهرة|جدة|دبي|المملكة العربية السعودية)$/iu;

function looksLikeRole(value: string): boolean {
	return (
		ROLE_WORD.test(value) &&
		value.split(/\s+/).length <= MAX_ENTRY_HEADER_WORDS &&
		!/[.!?•]/u.test(value) &&
		!/\b(?:built|reduced|developed|led|delivered|improved)\b/iu.test(value)
	);
}

function looksLikeLocation(value: string): boolean {
	return !looksLikeRole(value) && (WORK_MODE.test(value) || PLACE.test(value) || /[,،]/u.test(value));
}

function credibleLocation(value: string): boolean {
	return (
		!/[!?;:]/u.test(value) &&
		value.split(/[,،·]/u).every((part) => {
			const words = part.trim().split(/\s+/);
			if (words.length > 3) return false;
			// A recognized place followed by unexplained text has crossed a field boundary.
			return !words.some((_word, index) => index < words.length - 1 && PLACE.test(words.slice(0, index + 1).join(" ")));
		})
	);
}

function experienceFields(entry: RawEntry, options: ImportOptions) {
	let parts = [...entry.headerParts];
	const first = parts[0] ?? "";
	const at = /^(.+?)\s+(?:at|@|لدى|في)\s+(.+)$/iu.exec(first);
	if (at?.[1] && at[2] && looksLikeRole(at[1])) parts = [at[2], at[1], ...parts.slice(1)];
	else if (looksLikeRole(first)) {
		const comma = first.split(/[,،]\s*/u);
		if (comma.length >= 2)
			parts = [
				...(looksLikeRole(comma[0] ?? "") ? [comma[1] ?? "", comma[0] ?? ""] : comma.slice(0, 2)),
				comma.slice(2).join(first.includes("،") ? "، " : ", "),
				...parts.slice(1),
			].filter(Boolean);
		else if (parts[1] && !looksLikeLocation(parts[1]) && !looksLikeRole(parts[1]))
			parts = [parts[1], first, ...parts.slice(2)];
	}
	const company = parts.shift() ?? "";
	let position = "";
	const locations: string[] = [];
	const unused: string[] = [];
	for (const part of parts) {
		if (!position && looksLikeRole(part)) position = part;
		else if (looksLikeLocation(part)) locations.push(part);
		else unused.push(part);
	}
	const body = [...entry.body];
	// A role below the dated company/location row is a header, not the first achievement.
	const next = body[0];
	if (!position && next && !BULLET_PATTERN.test(next)) {
		const [title, ...bullets] = next.split(/\s+[•◦‣]\s+/u);
		if (title && looksLikeRole(title)) {
			position = title;
			body.shift();
			body.unshift(...bullets.map((bullet) => `• ${bullet}`));
		}
	}
	if (!position)
		options.onUncertain?.({ field: "position", source: unused.join(" | ") || entry.headerParts.join(" | ") });
	const location = locations.join(" · ");
	if (location && !credibleLocation(location)) options.onUncertain?.({ field: "location", source: location });
	return {
		company,
		position,
		location: credibleLocation(location) ? location : "",
		description: toHtml([...unused, ...body]),
	};
}

function buildSectionItems(key: SectionKey, lines: string[], locale: string, options: ImportOptions): unknown[] {
	if (key === "skills" || key === "interests") {
		return splitList(lines).map((name) => ({
			...baseItem(),
			icon: "",
			iconColor: "",
			name,
			...(key === "skills" ? { proficiency: "", level: 0, keywords: [] } : { keywords: [] }),
		}));
	}

	if (key === "languages") {
		return lines
			.map((line) => line.replace(BULLET_PATTERN, "").trim())
			.filter(Boolean)
			.map((line) => {
				const match = /^(.+?)\s*[([–—-]\s*(.+?)\s*[)\]]?$/.exec(line);
				return {
					...baseItem(),
					language: (match?.[1] ?? line).trim(),
					fluency: (match?.[2] ?? "").trim(),
					level: 0,
				};
			});
	}

	if (key === "profiles") {
		return lines
			.map((line) => line.replace(BULLET_PATTERN, "").trim())
			.filter(Boolean)
			.map((line) => {
				const url = line.match(URL_PATTERN)?.[0] ?? "";
				const network = splitHeaderParts(line.replace(url, " "))[0] ?? line;
				return {
					...baseItem(),
					icon: "",
					iconColor: "",
					network,
					username: "",
					website: { url, label: "", inlineLink: false },
				};
			});
	}

	const dated = key === "awards" || key === "certifications" || key === "publications";
	const entries = groupEntries(lines, dated, locale);

	if (key === "experience") {
		return entries.map((entry) => ({
			...baseItem(),
			...experienceFields(entry, options),
			period: entry.period,
			website: emptyWebsite,
			roles: [],
		}));
	}

	if (key === "education") {
		return entries.map((entry) => ({
			...baseItem(),
			school: entry.headerParts[0] ?? "",
			degree: entry.headerParts[1] ?? "",
			area: "",
			grade: "",
			location: entry.headerParts[2] ?? "",
			period: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 3),
		}));
	}

	if (key === "projects") {
		return entries.map((entry) => ({
			...baseItem(),
			name: entry.headerParts[0] ?? "",
			period: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 1),
		}));
	}

	if (key === "volunteer") {
		return entries.map((entry) => ({
			...baseItem(),
			organization: entry.headerParts[0] ?? "",
			location: entry.headerParts[1] ?? "",
			period: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	if (key === "awards") {
		return entries.map((entry) => ({
			...baseItem(),
			title: entry.headerParts[0] ?? "",
			awarder: entry.headerParts[1] ?? "",
			date: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	if (key === "certifications") {
		return entries.map((entry) => ({
			...baseItem(),
			title: entry.headerParts[0] ?? "",
			issuer: entry.headerParts[1] ?? "",
			date: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	if (key === "publications") {
		return entries.map((entry) => ({
			...baseItem(),
			title: entry.headerParts[0] ?? "",
			publisher: entry.headerParts[1] ?? "",
			date: entry.period,
			website: emptyWebsite,
			description: entryDescription(entry, 2),
		}));
	}

	return entries.map((entry) => ({
		...baseItem(),
		name: entry.headerParts[0] ?? "",
		position: entry.headerParts[1] ?? "",
		phone: "",
		website: emptyWebsite,
		description: entryDescription(entry, 2),
	}));
}

function segment(lines: string[], locale: string): { header: string[]; segments: Segment[] } {
	const records = lines
		.map((line, index) => ({ line: line.trim(), precededByBlank: index > 0 && !lines[index - 1]?.trim() }))
		.filter((record) => record.line);
	const cleaned = records.map((record) => record.line);
	const boundary = headerBoundary(cleaned);
	const header: string[] = [];
	const segments: Segment[] = [];
	let current: Segment | null = null;

	for (const [index, { line, precededByBlank }] of records.entries()) {
		const key = knownHeading(line);
		const isolatedTitleCase = precededByBlank && looksLikeTitleCaseHeading(line);
		// With no section open the entry-preamble guard has nothing to protect: skipping it there keeps
		// a dated custom section that opens the body from being swallowed into the contact header.
		const unknown =
			key === null &&
			!(current?.key === "experience" && looksLikeRole(line)) &&
			index > boundary &&
			(looksLikeHeading(line) || isolatedTitleCase) &&
			(current === null || isolatedTitleCase || !introducesEntry(cleaned, index, true, locale));

		if (key !== null || unknown) {
			if (current) segments.push(current);
			current = { key, title: line.replace(/[:：]\s*$/, "").trim(), lines: [] };
			continue;
		}

		if (current) current.lines.push(line);
		else header.push(line);
	}

	if (current) segments.push(current);

	return { header, segments };
}

function parseHeader(lines: string[], options: ImportOptions) {
	// Split geometry-delimited fields BEFORE normalizing spaces; never scan across a line/column.
	const fields = lines
		.flatMap((line) => line.split(/\s*[|•]\s*/))
		.flatMap((field) => {
			const value = field.replace(/^(?:phone|tel|الهاتف)\s*[:：]\s*/iu, "").trim();
			// A standalone phone may deliberately use wide digit grouping. Keep its exact spacing.
			return value && extractPhone(value) === value ? [field] : field.split(/[ \t]{2,}/);
		})
		.map((field) => field.trim())
		.filter(Boolean);
	const email = fields.map((field) => field.match(EMAIL_PATTERN)?.[0]).find(Boolean) ?? "";
	const phone = fields.map(extractPhone).find(Boolean) ?? "";
	const urls = fields.flatMap((field) => field.match(URL_PATTERN) ?? []);
	const remaining: string[] = [];
	const labelled: Partial<Record<"name" | "headline" | "location", string>> = {};
	const labels: Record<string, "name" | "headline" | "location"> = {
		name: "name",
		"full name": "name",
		الاسم: "name",
		"الاسم الكامل": "name",
		headline: "headline",
		title: "headline",
		"job title": "headline",
		"المسمى الوظيفي": "headline",
		location: "location",
		"city and country": "location",
		"المدينة والدولة": "location",
		الموقع: "location",
	};
	for (const field of fields) {
		const label = /^([^:：]+)[:：]\s*(.*)$/u.exec(field);
		const key = label?.[1] ? labels[label[1].toLowerCase()] : undefined;
		if (key) {
			labelled[key] = label?.[2] ?? "";
			continue;
		}
		let value = field;
		if (email) value = value.replace(email, " ");
		if (phone) value = value.replace(phone, " ");
		for (const url of urls) value = value.replace(url, " ");
		// Contact labels on otherwise empty fields aren't candidate facts.
		value = value
			.replace(/^(?:e-?mail|phone|tel|website|البريد الإلكتروني|الهاتف|الموقع الإلكتروني)\s*[:：]\s*/iu, "")
			.trim();
		if (value && /\p{L}/u.test(value)) remaining.push(value);
	}
	const name = labelled.name ?? remaining.shift() ?? "";
	const locationIndex = remaining.findIndex(looksLikeLocation);
	const locationSource = labelled.location ?? (locationIndex >= 0 ? (remaining.splice(locationIndex, 1)[0] ?? "") : "");
	let location = locationSource;
	if (location && !credibleLocation(location)) {
		options.onUncertain?.({ field: "location", source: location });
		location = "";
	}
	const headlineSource = labelled.headline ?? remaining[0] ?? "";
	const headline = looksLikeRole(headlineSource) ? headlineSource : "";
	if (headlineSource && !headline) options.onUncertain?.({ field: "headline", source: headlineSource });
	return { name, headline, location, email, phone, website: urls[0] ?? "" };
}

export function parseResumeText(text: string, options: ImportOptions = {}): ResumeData {
	// Some native PDFs map shaped glyphs to Arabic presentation forms. Decode only those
	// compatibility glyphs; retain the raw extraction separately and never fold Arabic letters.
	const editableText = normalizeImportedText(text);
	const lines = editableText.replace(/\r\n?/g, "\n").split("\n");
	const locale = options.locale ?? defaultResumeData.metadata.page.locale;
	const { header, segments } = segment(lines, locale);
	const contact = parseHeader(header, options);

	const data: ResumeData = structuredClone(defaultResumeData);
	const order: string[] = [];

	data.metadata.page.locale = locale;
	data.basics.name = contact.name;
	data.basics.headline = contact.headline;
	data.basics.email = contact.email;
	data.basics.phone = contact.phone;
	data.basics.location = contact.location;
	data.basics.website = { url: contact.website, label: "" };

	for (const item of segments) {
		if (item.lines.length === 0) continue;

		if (item.key === "summary") {
			const content = toHtml(item.lines);
			data.summary.content = data.summary.content ? `${data.summary.content}${content}` : content;
			if (!order.includes("summary")) order.push("summary");
			continue;
		}

		if (item.key === null) {
			const id = generateId();
			data.customSections.push({
				id,
				type: "summary",
				title: item.title,
				icon: "",
				columns: 1,
				hidden: false,
				keepTogether: false,
				startOnNewPage: false,
				items: [{ id: generateId(), hidden: false, content: toHtml(item.lines) }],
			});
			order.push(id);
			continue;
		}

		const items = buildSectionItems(item.key, item.lines, data.metadata.page.locale, options);
		if (items.length === 0) continue;

		const section = data.sections[item.key];
		section.items = [...section.items, ...items] as typeof section.items;
		if (!order.includes(item.key)) order.push(item.key);
	}

	data.metadata.layout.pages = [{ fullWidth: true, main: order, sidebar: [] }];

	return parseResumeData(data);
}
