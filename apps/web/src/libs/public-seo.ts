import type { PublicPageId } from "./seo";
import type { UiLocale } from "@reactive-resume/utils/locale";
import { useLingui } from "@lingui/react";
import { useEffect } from "react";
import { getLocaleAlternates, localizedUrl, productLocalePolicy } from "@reactive-resume/utils/locale";
import { getAtsCheckerMeta, getPublicPageMeta, serializeJsonLd } from "./seo";
import { useUiLocale } from "@/features/locale/provider";

export function syncPublicSeo({
	page = "home",
	pageUrl,
	locale,
	title,
	description,
}: {
	page?: PublicPageId | "ats-checker";
	pageUrl: string;
	locale: UiLocale;
	title: string;
	description: string;
}): () => void {
	const base = new URL(pageUrl);
	base.search = "";
	base.hash = "";
	const canonical = localizedUrl(base.href, locale, productLocalePolicy);
	const image = new URL(page === "ats-checker" ? "/opengraph/ats-checker.png" : "/opengraph/banner.jpg", base).href;
	const owned = new Set<Element>();
	const put = (tag: "link" | "meta" | "script", selector: string, attributes: Record<string, string>) => {
		const existing = [...document.head.querySelectorAll(`${selector}[data-public-seo]`)];
		const element = existing.shift() ?? document.createElement(tag);
		for (const duplicate of existing) duplicate.remove();
		element.setAttribute("data-public-seo", "");
		for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
		document.head.append(element);
		owned.add(element);
		return element;
	};
	put("link", 'link[rel="canonical"]', { rel: "canonical", href: canonical });
	for (const { hreflang, href } of getLocaleAlternates(base.href, productLocalePolicy))
		put("link", `link[rel="alternate"][hreflang="${hreflang}"]`, { rel: "alternate", hreflang, href });
	for (const [property, content] of Object.entries({
		"og:type": "website",
		"og:site_name": "Master CV",
		"og:locale": locale.replace("-", "_"),
		"og:title": title,
		"og:description": description,
		"og:url": canonical,
		"og:image": image,
	}))
		put("meta", `meta[property="${property}"]`, { property, content });
	for (const [name, content] of Object.entries({
		"twitter:card": "summary_large_image",
		"twitter:title": title,
		"twitter:description": description,
		"twitter:image": image,
	}))
		put("meta", `meta[name="${name}"]`, { name, content });
	const script = put("script", 'script[type="application/ld+json"]', { type: "application/ld+json" });
	script.textContent = serializeJsonLd({
		"@context": "https://schema.org",
		"@type": page === "ats-checker" ? "WebApplication" : "WebPage",
		name: title,
		description,
		url: canonical,
		inLanguage: locale,
		...(page === "ats-checker" ? { applicationCategory: "BusinessApplication", operatingSystem: "Web" } : {}),
	});
	return () => {
		for (const element of owned) element.remove();
	};
}
let servedOrigin: string | undefined;
export function usePublicSeo(page: PublicPageId | "ats-checker") {
	const { locale } = useUiLocale();
	useLingui();
	const { title, description } = page === "ats-checker" ? getAtsCheckerMeta() : getPublicPageMeta(page);
	useEffect(() => {
		servedOrigin ??= new URL(
			document.querySelector<HTMLLinkElement>('link[rel="canonical"][data-public-seo]')?.href ?? location.href,
		).origin;
		const path = page === "home" ? "/" : `/${page}`;
		return syncPublicSeo({ page, pageUrl: new URL(path, servedOrigin).href, locale, title, description });
	}, [page, locale, title, description]);
}
