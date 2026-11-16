import { t } from "@lingui/core/macro";
import { getPublicCopy } from "@/features/public-copy";

/**
 * The server writes every page's canonical link, hreflang alternates, social cards and site-wide structured data into
 * the HTML it sends (apps/server/src/static/web.ts), so crawlers that never run JavaScript see them. Routes only set
 * what changes as the visitor navigates: the title, the description and, where needed, `noindex`.
 */

const appName = "Master CV";

export const createNoindexFollowMeta = () => ({ name: "robots", content: "noindex, follow" });

/** JSON for an inline `application/ld+json` script, escaped so no string in it can close the script early. */
export const serializeJsonLd = (data: Record<string, unknown>) =>
	JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (character) => {
		switch (character) {
			case "<":
				return "\\u003C";
			case ">":
				return "\\u003E";
			case "&":
				return "\\u0026";
			case "\u2028":
				return "\\u2028";
			case "\u2029":
				return "\\u2029";
			default:
				return character;
		}
	});

/** The homepage's title and description in the active locale. The prerendered page and the route share them. */
export type PublicPageId = "home" | "privacy-and-terms" | "help";
export const getPublicPageMeta = (page: PublicPageId) => ({
	title: `${appName} — ${getPublicCopy(page === "home" ? "landing.hero.title" : page === "help" ? "public.meta.help.title" : "legal.page.title")}`,
	description: getPublicCopy(
		page === "home"
			? "public.meta.home.description"
			: page === "help"
				? "public.meta.help.description"
				: "public.meta.legal.description",
	),
});
export const getHomepageMeta = () => getPublicPageMeta("home");

/** The ATS checker's title and description in the active locale. The prerendered page and the route share them. */
export const getAtsCheckerMeta = () => ({
	title: `${t`Free ATS resume checker`} — ${appName}`,
	// Keep under ~120 characters so Google's mobile SERP snippet is not truncated at 3 lines.
	description: t`Checking requires an account. Review PDF readability and writing notes separately in your private workspace.`,
});
