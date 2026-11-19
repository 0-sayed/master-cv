import type { Locale } from "@reactive-resume/utils/locale";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { env } from "@reactive-resume/env/server";
import { getProductName, productBrand } from "@reactive-resume/utils/brand";
import {
	defaultUiLocale,
	getLocaleAlternates,
	isUiLocale,
	localizedUrl,
	productLocalePolicy,
} from "@reactive-resume/utils/locale";

function resolveWebDistPath() {
	const candidates = [
		// Source layout: apps/server/src/static/web.ts -> apps/web/dist
		fileURLToPath(new URL("../../../web/dist", import.meta.url)),
		// Bundled layout: apps/server/dist/index.mjs -> apps/web/dist
		fileURLToPath(new URL("../../web/dist", import.meta.url)),
	];
	const [fallback] = candidates;
	if (!fallback) throw new Error("Could not resolve web dist path");

	return candidates.find((candidate) => existsSync(candidate)) ?? fallback;
}

const staticRoot = resolveWebDistPath();
const indexHtmlPath = `${staticRoot}/index.html`;
// The marketing pages prerendered per locale by the web build (apps/web/vite.config.ts), as <page>/<locale>.html, kept
// beside dist/ so they're never served at an address of their own.
const prerenderRoot = `${staticRoot}-prerender`;
const noindexShellPrefixes = ["/auth", "/dashboard", "/builder", "/agent", "/templates"];
const accountShellPaths = new Set(["/help", "/deletion-requested", "/email-change", "/privacy-and-terms"]);
/**
 * Marketing pages the SPA owns that search engines should index.
 *
 * Without an entry here the fallback below returns 404 for the path in production — the dev Vite
 * server serves the shell for anything, so this failure only ever shows up once deployed.
 */
const indexableAppPaths = new Set<string>();
const reservedPublicResumeSegments = new Set([
	"api",
	"mcp",
	".well-known",
	"uploads",
	"auth",
	"dashboard",
	"builder",
	"agent",
	"templates",
	"ats-checker",
]);

function isAssetPath(pathname: string): boolean {
	return pathname.split("/").pop()?.includes(".") ?? false;
}

function getPathSegments(pathname: string) {
	return pathname.split("/").filter(Boolean);
}

function isNoindexShellPath(pathname: string): boolean {
	return (
		pathname === "/ats-checker" ||
		accountShellPaths.has(pathname) ||
		noindexShellPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
	);
}

function isPublicResumePath(pathname: string): boolean {
	const segments = getPathSegments(pathname);
	const [firstSegment] = segments;

	return segments.length === 2 && firstSegment !== undefined && !reservedPublicResumeSegments.has(firstSegment);
}

const BASE_SECURITY_HEADERS = {
	"X-Frame-Options": "DENY",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	// `wasm-unsafe-eval` lets the PDF engine (Forme, WebAssembly) start in the browser.
	"Content-Security-Policy-Report-Only":
		"default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

const githubUrl = "https://github.com/0-sayed/master-cv";
// The English copy, for a build without prerendered pages; a prerendered page carries its own locale's title and
// description, and the social cards reuse them.
const ROOT_TITLE = `${productBrand.name} — Write and review your CV`;
const ROOT_DESCRIPTION =
	"Write and review your CV in a private account. Qualified PDF downloads follow account limits.";

type StructuredData = Record<string, unknown>;

function homepageStructuredData(origin: string, locale: Locale): StructuredData {
	return {
		"@context": "https://schema.org",
		"@type": "WebSite",
		name: getProductName(locale),
		url: `${origin}/`,
		codeRepository: githubUrl,
		license: `${githubUrl}/blob/main/LICENSE`,
	};
}

type PageSeoOptions = {
	canonicalUrl: string;
	locale: Locale;
	title: string;
	description: string;
	imageUrl: string;
	structuredData: StructuredData;
};

function createPageSeoMarkup(options: PageSeoOptions) {
	const pageUrl = localizedUrl(options.canonicalUrl, options.locale, productLocalePolicy);
	const alternates = getLocaleAlternates(options.canonicalUrl, productLocalePolicy)
		.map(({ hreflang, href }) => `<link rel="alternate" hreflang="${hreflang}" href="${escapeAttribute(href)}">`)
		.join("");

	return `
		<link rel="canonical" href="${escapeAttribute(pageUrl)}">
		${alternates}
		<meta property="og:type" content="website">
		<meta property="og:site_name" content="${getProductName(options.locale)}">
		<meta property="og:locale" content="${options.locale.replace("-", "_")}">
		<meta property="og:title" content="${options.title}">
		<meta property="og:description" content="${options.description}">
		<meta property="og:url" content="${escapeAttribute(pageUrl)}">
		<meta property="og:image" content="${options.imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${options.title}">
		<meta name="twitter:description" content="${options.description}">
		<meta name="twitter:image" content="${options.imageUrl}">
		<script type="application/ld+json">${JSON.stringify(options.structuredData)}</script>
	`.replace(/<(link|meta|script)\b/g, "<$1 data-public-seo");
}

/** The title and description a page was built with, still HTML-escaped. */
function readPageMeta(html: string, fallback: { title: string; description: string }) {
	return {
		title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? fallback.title,
		description: html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ?? fallback.description,
	};
}

// Resume names, headlines, and summaries are user-authored, so they must never reach the served
// HTML unescaped.
const escapeAttribute = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

async function createPublicResumeSeoMarkup(pathname: string, origin: string) {
	const [username, slug] = getPathSegments(pathname);
	if (!username || !slug) return null;

	// A card render must never take down the page: any lookup failure falls back to the plain shell.
	const meta = await import("@reactive-resume/api/features/resume/social-meta")
		.then((module) => module.getPublicResumeSocialMeta({ username, slug }))
		.catch(() => null);
	if (!meta) return null;

	const canonicalUrl = `${origin}/${username}/${slug}`;
	const imageUrl = `${origin}/opengraph/banner.jpg`;
	const pageTitle = escapeAttribute(`${meta.name} — Sirawise`);
	const title = escapeAttribute(meta.title);
	const description = escapeAttribute(meta.description);

	return {
		pageTitle,
		description,
		markup: `
		<link rel="canonical" href="${canonicalUrl}">
		<meta property="og:type" content="profile">
		<meta property="og:site_name" content="${productBrand.name}">
		<meta property="og:title" content="${title}">
		<meta property="og:description" content="${description}">
		<meta property="og:url" content="${canonicalUrl}">
		<meta property="og:image" content="${imageUrl}">
		<meta name="twitter:card" content="summary_large_image">
		<meta name="twitter:title" content="${title}">
		<meta name="twitter:description" content="${description}">
		<meta name="twitter:image" content="${imageUrl}">
	`,
	};
}

export const serveWebDistStatic = env.CLOUDFLARE
	? undefined
	: serveStatic({
			root: staticRoot,
			onFound: (_path, context) => {
				// Vite fingerprints everything under /assets, so a file there never changes.
				if (context.req.path.startsWith("/assets/") || /^\/videos\/.*-v\d+\.(?:mp4|webp)$/.test(context.req.path)) {
					context.header("Cache-Control", "public, max-age=31536000, immutable");
				}
			},
		});

function getFallbackResponseHeaders(pathname: string) {
	if (pathname === "/" && env.ROOT_RESUME_ID) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			"Cache-Control": "private, no-store",
			...BASE_SECURITY_HEADERS,
		};
	}
	if (pathname === "/" || indexableAppPaths.has(pathname)) {
		return { "Content-Type": "text/html; charset=UTF-8", ...BASE_SECURITY_HEADERS };
	}
	if (isNoindexShellPath(pathname) || isPublicResumePath(pathname)) {
		return {
			"Content-Type": "text/html; charset=UTF-8",
			"X-Robots-Tag": "noindex, follow",
			...BASE_SECURITY_HEADERS,
		};
	}

	return null;
}

/**
 * A prerendered page's language: a `?locale=` address first (its hreflang alternates), then the visitor's saved
 * choice, in the order the app reads them (apps/web/src/libs/locale.ts).
 */
async function getPageLocale(request: Request) {
	const requested = new URL(request.url).searchParams.get("locale");
	if (isUiLocale(requested)) return { locale: requested, requested: true, personalized: false };

	const cookie = request.headers.get("cookie");
	const saved = cookie?.match(/(?:^|;\s*)locale=([^;]*)/)?.[1] ?? "";
	if (cookie) {
		const { auth } = await import("@reactive-resume/auth/config");
		// Only a browser session supplies an account preference, never API-key or bearer authentication.
		const headers = new Headers({ cookie });
		const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
		if (isUiLocale(session?.user.uiLocale)) {
			return { locale: session.user.uiLocale, requested: false, personalized: true };
		}
	}
	return { locale: isUiLocale(saved) ? saved : defaultUiLocale, requested: false, personalized: false };
}

function notFoundResponse(options: { head?: boolean; noindex?: boolean } = {}) {
	const headers = new Headers({ "Content-Type": "text/plain; charset=UTF-8" });
	if (options.noindex) headers.set("X-Robots-Tag", "noindex, nofollow");

	return new Response(options.head ? null : "Not Found", {
		status: 404,
		headers,
	});
}

/** The indexable pages the web build prerenders, by path. */
const prerenderedPages: Record<
	string,
	{
		name: string;
		meta: { title: string; description: string };
		image: string;
		structuredData: (origin: string, locale: Locale) => StructuredData;
	}
> = {
	"/": {
		name: "home",
		meta: { title: ROOT_TITLE, description: ROOT_DESCRIPTION },
		image: "/opengraph/banner.jpg",
		structuredData: homepageStructuredData,
	},
	"/privacy-and-terms": {
		name: "legal-privacy",
		meta: { title: "Sirawise", description: "Review draft" },
		image: "/opengraph/banner.jpg",
		structuredData: homepageStructuredData,
	},
	"/help": {
		name: "help",
		meta: { title: "Sirawise", description: "Help and contact" },
		image: "/opengraph/banner.jpg",
		structuredData: homepageStructuredData,
	},
};

// ponytail: GET and HEAD share the same routing logic; method determines body presence
export type ReadWebFile = (path: string) => Promise<string>;

export async function handleWebApp(request: Request, readFile: ReadWebFile = (path) => fs.readFile(path, "utf-8")) {
	const isHead = request.method === "HEAD";
	const pathname = new URL(request.url).pathname;
	const respond = (body: BodyInit | null, init?: ResponseInit) => new Response(isHead ? null : body, init);
	if (pathname === "/dashboard/ats-guide") {
		const target = new URL(request.url);
		target.pathname = "/dashboard/review-guide";
		return respond(null, {
			status: 308,
			headers: { ...BASE_SECURITY_HEADERS, Location: `${target.pathname}${target.search}${target.hash}` },
		});
	}

	if (!isNoindexShellPath(pathname) && isAssetPath(pathname)) {
		return new Response(isHead ? null : "Not Found", { status: 404 });
	}

	const headers = getFallbackResponseHeaders(pathname);
	if (!headers) return notFoundResponse({ head: isHead, noindex: true });

	if (isHead && (!prerenderedPages[pathname] || (pathname === "/" && env.ROOT_RESUME_ID)))
		return respond(null, { status: 200, headers });

	const html = await readFile(indexHtmlPath);

	if (pathname === "/" && env.ROOT_RESUME_ID) {
		const canonicalUrl = new URL("/", env.APP_URL).toString();
		// Root configuration never discloses a target in the HTML shell. The public API
		// gates data and browser metadata; shell requests must not count extra views.
		const shell = html
			.replace(/<title>[^<]*<\/title>/, "<title>Sirawise</title>")
			.replace(/<meta\s+name="description"[^>]*>/, '<meta name="description" content="">');
		const markup = `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" data-root-resume-shell><meta name="robots" content="noindex, follow" data-root-resume-shell>`;
		return respond(
			shell.replace("</head>", () => `${markup}</head>`),
			{ headers },
		);
	}

	if (pathname === "/help" && request.headers.get("cookie")) {
		const { auth } = await import("@reactive-resume/auth/config");
		const session = await auth.api.getSession({
			headers: new Headers({ cookie: request.headers.get("cookie") ?? "" }),
			query: { disableCookieCache: true },
		});
		if (session)
			return respond(html.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/g, ""), {
				headers: { ...headers, "Cache-Control": "private, no-store", Vary: "Cookie" },
			});
	}
	const prerendered = prerenderedPages[pathname];
	if (prerendered) {
		const { locale, personalized } = await getPageLocale(request);
		const origin = new URL(env.APP_URL).origin;
		// Legal tabs select an existing localized build artifact before client rendering.
		const name =
			pathname === "/privacy-and-terms" && new URL(request.url).searchParams.get("tab") === "terms"
				? "legal-terms"
				: prerendered.name;
		const page = await readFile(`${prerenderRoot}/${name}/${locale}.html`).catch(() => null);
		if (page === null)
			return respond("Public page is temporarily unavailable.", {
				status: 503,
				headers: { ...headers, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, follow" },
			});
		const markup = createPageSeoMarkup({
			canonicalUrl: new URL(pathname, env.APP_URL).toString(),
			locale,
			...readPageMeta(page, prerendered.meta),
			imageUrl: `${origin}${prerendered.image}`,
			structuredData: prerendered.structuredData(origin, locale),
		});

		// The saved locale changes what this address shows, so caches have to key on the cookie.
		return respond(
			page
				.replace(/<meta\b[^>]*(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/g, "")
				.replace(
					"</head>",
					() =>
						`${isNoindexShellPath(pathname) ? '<meta name="robots" content="noindex, follow">' : ""}${markup}</head>`,
				),
			{ headers: { ...headers, Vary: "Cookie", ...(personalized ? { "Cache-Control": "private, no-store" } : {}) } },
		);
	}

	if (isPublicResumePath(pathname)) {
		const resumeSeo = await createPublicResumeSeoMarkup(pathname, new URL(env.APP_URL).origin);
		if (resumeSeo) {
			// The shell's generic title/description are replaced so shares and previews show the resume,
			// not the marketing copy baked into index.html. Function replacers keep `$&`, `$'` etc. in user text literal.
			const withTitle = html
				.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/g, "")
				.replace(/<title>[^<]*<\/title>/, () => `<title>${resumeSeo.pageTitle}</title>`)
				.replace(
					/<meta\s+name="description"[^>]*>/,
					() => `<meta name="description" content="${resumeSeo.description}">`,
				);

			return new Response(
				withTitle.replace("</head>", () => `${resumeSeo.markup}</head>`),
				{ headers },
			);
		}
	}

	return new Response(
		isNoindexShellPath(pathname) ? html.replace(/<meta\s+(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/g, "") : html,
		{ headers },
	);
}
