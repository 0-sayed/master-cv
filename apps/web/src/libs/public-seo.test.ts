// @vitest-environment happy-dom
import { expect, it } from "vite-plus/test";
import { syncPublicSeo } from "./public-seo";
it("preserves the checker image and application metadata after client navigation", () => {
	const dispose = syncPublicSeo({
		page: "ats-checker",
		pageUrl: "https://resume.example/ats-checker",
		locale: "en-US",
		title: "ATS Checker",
		description: "Check PDF readability",
	});
	expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute(
		"content",
		"https://resume.example/opengraph/ats-checker.png",
	);
	const data = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}");
	expect(data).toMatchObject({ "@type": "WebApplication", url: "https://resume.example/ats-checker?locale=en-US" });
	dispose();
});
it("updates owned public metadata once and removes it on exit", () => {
	document.head.innerHTML =
		'<meta name="unrelated" content="keep"><link rel="canonical" href="https://resume.example/" data-public-seo>';
	const first = syncPublicSeo({
		pageUrl: "https://resume.example/?utm_source=ad",
		locale: "ar-SA",
		title: "العربية",
		description: "وصف",
	});
	expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
	first();
	const dispose = syncPublicSeo({
		pageUrl: "https://resume.example/privacy-and-terms?tab=terms",
		locale: "en-US",
		title: "Master CV",
		description: "Write and review your CV.",
	});
	expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
		"https://resume.example/privacy-and-terms?locale=en-US",
	);
	expect(document.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
	expect(document.querySelector('meta[property="og:locale"]')?.getAttribute("content")).toBe("en_US");
	expect(document.querySelectorAll('link[rel="alternate"]')).toHaveLength(3);
	dispose();
	expect(document.querySelectorAll("[data-public-seo]")).toHaveLength(0);
	expect(document.querySelector('[name="unrelated"]')).not.toBeNull();
});
