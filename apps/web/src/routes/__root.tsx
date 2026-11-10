import type { orpc } from "@/libs/orpc/client";
import type { Theme } from "@/libs/theme";
import type { IconProps } from "@phosphor-icons/react";
import type { FeatureFlags } from "@reactive-resume/api/features/flags";
import type { AuthSession } from "@reactive-resume/auth/types";
import type { UiLocale } from "@reactive-resume/utils/locale";
import type { QueryClient } from "@tanstack/react-query";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { IconContext } from "@phosphor-icons/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, HeadContent, Outlet, useRouter } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { domMax, LazyMotion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "@reactive-resume/ui/components/toast";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { UiLabelsProvider } from "@reactive-resume/ui/components/ui-labels";
import { isUiLocale } from "@reactive-resume/utils/locale";
import { BreakpointIndicator } from "@/components/layout/breakpoint-indicator";
import { DialogManager } from "@/dialogs/manager";
import { IdentityBoundary } from "@/features/auth/identity-boundary";
import { CommandPalette } from "@/features/command-palette";
import { LocaleProvider } from "@/features/locale/provider";
import { ThemeProvider } from "@/features/theme/provider";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
import { authIdentity } from "@/libs/auth/identity";
import { clearPersonalStorage } from "@/libs/browser-storage";
import { loadRootContext } from "@/libs/root-context";
import { getRouteTitle } from "@/libs/route-titles";
import { getHomepageMeta } from "@/libs/seo";

type RouterContext = {
	theme: Theme;
	locale: UiLocale;
	orpc: typeof orpc;
	queryClient: QueryClient;
	session: AuthSession | null;
	flags: FeatureFlags;
};

const iconContextValue: IconProps = { size: 16, weight: "regular" };

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootComponent,
	validateSearch: (search: Record<string, unknown>): { locale?: UiLocale } =>
		isUiLocale(search.locale) ? { locale: search.locale } : {},
	// index.html carries the tags that never change (charset, viewport, icons, manifest); the server adds each page's
	// canonical link, social cards and structured data. The router only keeps the title and description current.
	head: ({ matches, match }) => {
		const { title, description } = getHomepageMeta();
		const user = match.context.session?.user;
		const pageTitle = getRouteTitle(matches.at(-1)?.routeId ?? "__root__", user ? { name: user.name } : {});
		return { meta: [{ title: pageTitle ?? title }, { name: "description", content: description }] };
	},
	beforeLoad: ({ context }) => loadRootContext(context.queryClient),
});

function RootComponent() {
	const { theme, locale, queryClient, session } = Route.useRouteContext();
	const router = useRouter();
	useEffect(() => {
		const recover = () => {
			const callbackURL = router.state.location.href;
			if (callbackURL.startsWith("/auth/")) return;
			clearPersonalStorage();
			authIdentity(queryClient).accept(null);
			queryClient.clear();
			queryClient.setQueryData(["auth", "session"], null);
			void router.navigate({ to: "/auth/login", search: { reason: "sessionExpired", callbackURL }, replace: true });
		};
		window.addEventListener("master-cv:session-expired", recover);
		return () => window.removeEventListener("master-cv:session-expired", recover);
	}, [router, queryClient]);

	return (
		<>
			<HeadContent />

			<QueryClientProvider client={queryClient}>
				<MotionConfig reducedMotion="user">
					<LazyMotion features={domMax}>
						<I18nProvider i18n={i18n}>
							<IconContext.Provider value={iconContextValue}>
								<ThemeProvider theme={theme}>
									<HotkeysProvider>
										<LocaleProvider locale={locale} session={session}>
											<UiLabelsProvider value={{ close: i18n._("Close") }}>
												<TooltipProvider>
													<ConfirmDialogProvider>
														<IdentityBoundary queryClient={queryClient} session={session}>
															<Outlet />
															<DialogManager />
															<CommandPalette />
														</IdentityBoundary>
														<Toaster />

														{import.meta.env.DEV && <BreakpointIndicator />}
														{import.meta.env.DEV && (
															<TanStackDevtools
																config={{ position: "bottom-left" }}
																plugins={[
																	{
																		name: "TanStack Query",
																		render: <ReactQueryDevtoolsPanel />,
																	},
																	{
																		name: "TanStack Router",
																		render: <TanStackRouterDevtoolsPanel />,
																	},
																]}
															/>
														)}
													</ConfirmDialogProvider>
												</TooltipProvider>
											</UiLabelsProvider>
										</LocaleProvider>
									</HotkeysProvider>
								</ThemeProvider>
							</IconContext.Provider>
						</I18nProvider>
					</LazyMotion>
				</MotionConfig>
			</QueryClientProvider>
		</>
	);
}
