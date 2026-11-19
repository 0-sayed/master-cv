/**
 * Renders the public marketing pages, the landing page and the ATS checker, to HTML, one file per locale, at build time
 * (see `prerenderPages` in vite.config.ts). The server sends the file for the visitor's locale, so every heading and
 * paragraph is in the first response and the page paints before any JavaScript runs; React renders the live page in
 * its place once the route has loaded.
 */
import type { IconProps } from "@phosphor-icons/react";
import type { UiLocale } from "@reactive-resume/utils/locale";
import type { ReactNode } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { IconContext } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { isRTL, productUiLocales } from "@reactive-resume/utils/locale";
import { Homepage } from "./page";
import { PublicHelp } from "@/features/help/public-page";
import { LegalPage } from "@/features/legal/page";
import { LocaleProvider } from "@/features/locale/provider";
import { ThemeProvider } from "@/features/theme/provider";
import { sessionQueryKey } from "@/libs/auth/identity";
import { getUiLocaleMessages } from "@/libs/locale";
import { getHomepageMeta, getPublicPageMeta } from "@/libs/seo";

export const locales = productUiLocales;

// Matches the root route's icon defaults (routes/__root.tsx), which the marketing header's icons inherit.
const iconContextValue: IconProps = { size: 16, weight: "regular" };

const pages = {
	"legal-privacy": {
		path: "/privacy-and-terms?tab=privacy",
		meta: () => getPublicPageMeta("privacy-and-terms"),
		render: () => <LegalPage tab="privacy" />,
	},
	"legal-terms": {
		path: "/privacy-and-terms?tab=terms",
		meta: () => getPublicPageMeta("privacy-and-terms"),
		render: () => <LegalPage tab="terms" />,
	},
	help: {
		path: "/help",
		meta: () => getPublicPageMeta("help"),
		render: () => <PublicHelp />,
	},
	home: { path: "/", meta: getHomepageMeta, render: () => <Homepage /> },
} satisfies Record<
	string,
	{ path: string; meta: () => { title: string; description: string }; render: () => ReactNode }
>;

type PrerenderedPage = keyof typeof pages;
export const prerenderedPages = Object.keys(pages) as PrerenderedPage[];

export async function renderPage(name: PrerenderedPage, locale: UiLocale) {
	const page = pages[name];
	i18n.loadAndActivate(await getUiLocaleMessages(locale));

	// Links only need a router to build their hrefs; nothing is loaded or navigated.
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory({ initialEntries: [page.path] }),
	});
	const dir = isRTL(locale) ? "rtl" : "ltr";
	const queryClient = new QueryClient();
	// Build-time pages have a known synthetic guest identity and never perform a session request.
	queryClient.setQueryData(sessionQueryKey, null);

	const html = renderToString(
		<RouterContextProvider router={router}>
			<QueryClientProvider client={queryClient}>
				<I18nProvider i18n={i18n}>
					<IconContext.Provider value={iconContextValue}>
						<ThemeProvider theme="system">
							<LocaleProvider locale={locale} session={null}>
								{page.render()}
							</LocaleProvider>
						</ThemeProvider>
					</IconContext.Provider>
				</I18nProvider>
			</QueryClientProvider>
		</RouterContextProvider>,
	);

	return { html, dir, ...page.meta() };
}
