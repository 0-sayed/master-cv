import type { WebAccessContext } from "../web-access/contracts";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { htmlToText } from "../web-access/builtin";
import { MAX_CONTENT_CHARS, WebAccessError } from "../web-access/contracts";
import { readPage, searchWeb } from "../web-access/service";

export { htmlToText } from "../web-access/builtin";
export { WebAccessError as PostingFetchError } from "../web-access/contracts";

/** Matches the applications feature's cap on a saved posting. */
export const MAX_POSTING_CHARS = MAX_CONTENT_CHARS;

/** A lone http(s) link, as opposed to pasted posting text. */
export const isPostingLink = (input: string) => /^https?:\/\/\S+$/i.test(input.trim());

export async function fetchJobPosting(input: string, context: WebAccessContext) {
	const { content, html, ...source } = await readPage(input, context);
	if (isListingUrl(source.resolvedUrl ?? input) || jobPostingsIn(html ?? "").length > 1)
		throw new WebAccessError("not-a-page");
	const extracted = extractJobContent(html ?? "", content);
	const structured = readJobPosting(html ?? "");
	const page = structured?.description ? structured : extracted.page;
	const text = cleanPostingText(page?.description || extracted.text);
	assertJobContent(text);
	const truncated = source.truncated || text.length > MAX_POSTING_CHARS;
	return {
		page,
		text: text.slice(0, MAX_POSTING_CHARS),
		source: {
			...source,
			...(page?.description ? { format: "text" as const } : {}),
			truncated,
			completeness: truncated ? ("incomplete" as const) : source.completeness,
		},
	};
}

/** Do not retain navigation, application controls or authentication chrome as job evidence. */
function cleanPostingText(text: string) {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(
			(line) =>
				line &&
				!/^(?:skip to main content|show (?:more|less)|apply(?: now)?|save(?: job)?|sign in|join now|forgot password\??|email or phone|password|privacy policy|cookie policy|user agreement)$/i.test(
					line,
				),
		)
		.join("\n");
}

function assertJobContent(text: string) {
	if (!text.trim()) throw new WebAccessError("empty");
	if (
		/just a moment|checking your browser|verify (?:that )?you(?:'re| are) human|access denied|captcha challenge|enable javascript and cookies/i.test(
			text,
		)
	)
		throw new WebAccessError("challenge");
	if (
		/join or sign in|sign in to (?:view|see|read|continue|find)|log in to (?:view|see|read|continue)|email or phone|forgot (?:your )?password|تسجيل الدخول (?:لعرض|لمتابعة)/i.test(
			text,
		)
	)
		throw new WebAccessError("auth");
}

/** Parse public job content with the installed sanitizer, excluding page chrome. */
function extractJobContent(html: string, fallback: string): { page: PagePosting | null; text: string } {
	let main = "";
	let body = "";
	let description = "";
	let role = "";
	let company = "";
	let location = "";
	sanitizeHtml(html, {
		allowedTags: [
			"html",
			"body",
			"main",
			"article",
			"section",
			"div",
			"h1",
			"h2",
			"h3",
			"p",
			"ul",
			"ol",
			"li",
			"span",
			"a",
			"strong",
			"b",
			"em",
			"br",
		],
		allowedAttributes: { "*": ["class", "id", "itemprop", "role"] },
		nonTextTags: [
			"script",
			"style",
			"noscript",
			"template",
			"textarea",
			"head",
			"svg",
			"nav",
			"footer",
			"aside",
			"form",
			"button",
		],
		exclusiveFilter(frame) {
			const text = frame.text.trim();
			const marker = `${frame.attribs.class ?? ""} ${frame.attribs.id ?? ""} ${frame.attribs.itemprop ?? ""}`;
			if (/^(?:cookie|consent|navigation|sign-in|login)(?:[-_\s]|$)/i.test(marker.trim())) return true;
			if (frame.tag === "h1" && !role) role = text;
			if (/(?:topcard__org-name-link|hiringOrganization|company-name)/i.test(marker) && !company) company = text;
			if (/(?:topcard__flavor--bullet|job-location|jobLocation)/i.test(marker) && !location) location = text;
			if (
				/(?:show-more-less-html__markup|jobs-description__content|job-description|posting-description|description__text|^description$)/i.test(
					marker.trim(),
				) &&
				text.length > description.length
			)
				description = text;
			if (
				(frame.tag === "main" || frame.tag === "article" || frame.attribs.role === "main") &&
				text.length > main.length
			)
				main = text;
			if (frame.tag === "body") body = text;
			frame.text = text + "\n";
			return false;
		},
	});
	const text = description || main || body || (html ? htmlToText(html) : fallback);
	// A title teaser above a sign-in wall is not a job description.
	if (!description && !readJobPosting(html)?.description) {
		if (/<input\b[^>]*type\s*=\s*["']?password\b/i.test(html)) throw new WebAccessError("auth");
		assertJobContent(text);
	}
	return {
		text,
		page: description ? { role, company, location, description: cleanPostingText(description), closesAt: "" } : null,
	};
}

export const postingSearchResult = z.object({
	url: z.string(),
	title: z.string().max(1_000),
	description: z.string().max(5_000).default(""),
});

/** Job-specific query intent belongs here, never in the generic retrieval service. */
export async function searchJobPostings(query: string, context: WebAccessContext) {
	return (await searchWeb(`${query} job posting`, context))
		.filter(({ url, title }) => !isListingUrl(url) && !/\b\d[\d,]*\+?\s+(?:[\w-]+\s+){0,4}jobs\b/i.test(title))
		.map(({ url, title, snippet }) => ({
			url,
			title,
			description: snippet ?? "",
		}));
}

/** Exclude known board/search pages; unknown sites still get a chance to describe one posting. */
function isListingUrl(url: string) {
	try {
		const { hostname, pathname } = new URL(url);
		if (/(^|\.)linkedin\.com$/.test(hostname))
			return pathname.startsWith("/jobs") && !pathname.startsWith("/jobs/view/");
		if (/(^|\.)indeed\.com$/.test(hostname)) return pathname === "/jobs";
		if (/(^|\.)glassdoor\.[a-z.]+$/.test(hostname)) return pathname.startsWith("/Job/");
		if (
			/^(?:jobs\.(?:eu\.)?lever\.co|jobs\.ashbyhq\.com|(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io)$/.test(hostname)
		)
			return pathname.split("/").filter(Boolean).length < 2;
		return false;
	} catch {
		return true;
	}
}

export type PagePosting = {
	role: string;
	company: string;
	location: string;
	description: string;
	/** When the employer stops taking applications (ISO), or "". */
	closesAt: string;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function readLocation(value: unknown): string {
	const place = (Array.isArray(value) ? value[0] : value) as { address?: Record<string, unknown> } | undefined;
	const address = place?.address;
	if (!address || typeof address !== "object") return "";
	return (
		[address.addressLocality, address.addressRegion, address.addressCountry]
			.map((part) => (typeof part === "object" && part ? asText((part as { name?: unknown }).name) : asText(part)))
			// "State not Applicable" and the like are placeholders, not places.
			.filter((part) => part && !/not applicable|^n\/?a$/i.test(part))
			.join(", ")
	);
}

/**
 * Every JobPosting a page describes in its JSON-LD (most job boards publish one per posting). Openers are matched with
 * bounded attributes and each body is found with indexOf, so a hostile page can't make the scan quadratic.
 */
function jobPostingsIn(html: string): Record<string, unknown>[] {
	const postings: Record<string, unknown>[] = [];
	const lower = html.toLowerCase();
	for (const match of html.matchAll(/<script[^<>]{0,500}type=["']application\/ld\+json["'][^<>]{0,500}>/gi)) {
		const start = match.index + match[0].length;
		const end = lower.indexOf("</script>", start);
		if (end === -1) break;
		let json: unknown;
		try {
			json = JSON.parse(html.slice(start, end));
		} catch {
			continue;
		}

		const graph = (json as { "@graph"?: unknown } | null)?.["@graph"];
		const candidates = [json, ...(Array.isArray(json) ? json : []), ...(Array.isArray(graph) ? graph : [])];
		for (const item of candidates) {
			const type = (item as { "@type"?: unknown } | null)?.["@type"];
			if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting")))
				postings.push(item as Record<string, unknown>);
		}
	}
	return [
		...new Map(
			postings.map((item) => [`${asText(item.title)}|${JSON.stringify(item.hiringOrganization)}`, item]),
		).values(),
	];
}

/** Some boards escape the description's HTML ("&lt;p&gt;"), so the first pass leaves tags behind. */
const richText = (html: string) => {
	const text = htmlToText(html);
	return /<\/?[a-z][^<>]*>/i.test(text) ? htmlToText(text) : text;
};

function toPagePosting(posting: Record<string, unknown>): PagePosting {
	const organization = posting.hiringOrganization as { name?: unknown } | string | undefined;
	const remote = asText(posting.jobLocationType).toUpperCase() === "TELECOMMUTE";
	return {
		role: asText(posting.title),
		company: typeof organization === "string" ? organization.trim() : asText(organization?.name),
		location: [readLocation(posting.jobLocation), remote ? "Remote" : ""].filter(Boolean).join(" · "),
		description: richText(asText(posting.description)),
		closesAt: asText(posting.validThrough),
	};
}

/**
 * The JobPosting a page describes in its JSON-LD, read without any AI: title, hiring organisation, location and the
 * description as text.
 */
export function readJobPosting(html: string): PagePosting | null {
	const postings = jobPostingsIn(html);
	return postings.length === 1 && postings[0] ? toPagePosting(postings[0]) : null;
}

/**
 * Where one posting lives on the common applicant tracking systems and job boards, for pages without JobPosting data.
 * The first group, when there is one, is the company's name in the address. ponytail: a fixed list; a posting anywhere
 * else counts only when its page carries JobPosting data.
 */
const POSTING_URLS = [
	/^https:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([^/]+)\/jobs\/\d+/,
	/[?&]gh_jid=\d+/,
	/^https:\/\/jobs\.(?:eu\.)?lever\.co\/([^/]+)\/[\da-f-]{36}/,
	/^https:\/\/jobs\.ashbyhq\.com\/([^/]+)\/[\da-f-]{36}/,
	/^https:\/\/apply\.workable\.com\/([^/]+)\/j\/[\da-z]+/i,
	/^https:\/\/jobs\.smartrecruiters\.com\/([^/]+)\/\d+/,
	/^https:\/\/([^/.]+)\.wd\d+\.myworkdayjobs\.com\/.+\/job\//,
	/^https:\/\/(?:[\w-]+\.)?linkedin\.com\/jobs\/view\/(?:.+-at-([\w-]+?)-)?\d+(?:[/?]|$)/,
	/^https:\/\/([^/.]+)\.recruitee\.com\/o\//,
	/^https:\/\/([^/.]+)\.jobs\.personio\.(?:de|com)\/job\/\d+/,
	/^https:\/\/([^/.]+)\.teamtailor\.com\/jobs\/\d+/,
	/^https:\/\/wellfound\.com\/jobs\/\d+/,
	/^https:\/\/www\.welcometothejungle\.com\/[a-z]{2}\/companies\/([^/]+)\/jobs\//,
];

const CLOSED =
	/no longer accepting applications|(?:job|position|posting|role) (?:is )?no longer (?:available|open)|position has been filled/i;

/**
 * One role's posting, still open: the page describes exactly one JobPosting, or sits at a posting address. A job
 * board's list, a careers page or an article is null.
 */
export async function readOpenPosting(url: string, context: WebAccessContext) {
	const { content, html = "", resolvedUrl } = await readPage(url, context);
	// The same posting published twice (an SEO plugin beside the tracking system's own) is still one role.
	const postings = jobPostingsIn(html);
	const page = postings.length === 1 && postings[0] ? toPagePosting(postings[0]) : null;
	const address = POSTING_URLS.map((pattern) => pattern.exec(resolvedUrl ?? url)).find(Boolean);
	if (postings.length > 1 || (!page && !address)) return null;
	if (page?.closesAt && new Date(page.closesAt).getTime() < Date.now()) return null;
	// ponytail: without JobPosting data, only the page's own words say a role closed; common English phrasings only.
	if (!page && CLOSED.test(content)) return null;
	return {
		page,
		text: (page?.description || content).slice(0, MAX_POSTING_CHARS),
		/** The company as its address names it ("simpleclub"), for pages without JobPosting data. */
		company: address?.[1]?.replaceAll(/[-_]+/g, " ") ?? "",
	};
}
