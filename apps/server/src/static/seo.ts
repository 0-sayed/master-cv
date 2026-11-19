import { env } from "@reactive-resume/env/server";
import { getLocaleAlternates, productLocalePolicy } from "@reactive-resume/utils/locale";

type StaticSeoOptions = {
	head?: boolean;
};

function appUrl() {
	return env.APP_URL.replace(/\/+$/, "");
}

function textResponse(body: string, options: StaticSeoOptions = {}) {
	return new Response(options.head ? null : body, {
		headers: { "Content-Type": "text/plain; charset=UTF-8" },
	});
}

export function handleRobots(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	const body = [
		"User-agent: *",
		"Allow: /",
		"Disallow: /ats-checker",
		"Disallow: /api/rpc",
		"Disallow: /api/auth",
		"Disallow: /mcp",
		"Disallow: /.well-known",
		// Discovery documents meant for agents and API directories.
		"Allow: /.well-known/integrations.json",
		"Allow: /.well-known/api-catalog",
		"Allow: /.well-known/mcp/server-card.json",
		"Allow: /.well-known/agent-skills/",
		"",
		`Sitemap: ${baseUrl}/sitemap.xml`,
		"",
	].join("\n");

	return textResponse(body, options);
}

// The indexable pages; everything else is the signed-in app or a public resume, both served noindex.
const sitemapPaths = ["/"];

export function handleSitemap(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	// Each page lists its languages, so every `?locale=` address is discoverable without a sitemap entry of its own.
	const urls = sitemapPaths.map((path) => {
		const pageUrl = `${baseUrl}${path}`;
		const alternates = getLocaleAlternates(pageUrl, productLocalePolicy).map(
			({ hreflang, href }) =>
				`    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${href.replaceAll("&", "&amp;")}"/>`,
		);
		return ["  <url>", `    <loc>${pageUrl}</loc>`, ...alternates, "  </url>"].join("\n");
	});
	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		"</urlset>",
		"",
	].join("\n");

	return new Response(options?.head ? null : body, {
		headers: { "Content-Type": "application/xml; charset=UTF-8" },
	});
}

export function handleLlms(options?: StaticSeoOptions) {
	const baseUrl = appUrl();
	return textResponse(
		[
			"# Sirawise",
			"",
			"Write and review your CV in a private account.",
			"Qualified PDF downloads are free within account limits. Word downloads are unavailable. Public sharing remains subject to release approval.",
			"Arabic and English versions are independent. Interface language does not translate saved content.",
			"Proposed changes require your review and approval. PDF checking requires an account.",
			"",
			`- [Homepage](${baseUrl}/)`,
			`- [Account entry](${baseUrl}/auth/register)`,
			"- [Source code](https://github.com/0-sayed/master-cv)",
			"",
		].join("\n"),
		options,
	);
}
