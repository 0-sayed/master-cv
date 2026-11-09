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
import { createRootRouteWithContext, HeadContent, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { domMax, LazyMotion, MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "@reactive-resume/ui/components/toast";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { isUiLocale } from "@reactive-resume/utils/locale";
import { BreakpointIndicator } from "@/components/layout/breakpoint-indicator";
import { DonationToast } from "@/components/ui/donation-toast";
import { DialogManager } from "@/dialogs/manager";
import { CommandPalette } from "@/features/command-palette";
import { useDocumentWebMcpTools } from "@/features/documents/webmcp";
import { LocaleProvider } from "@/features/locale/provider";
import { ThemeProvider } from "@/features/theme/provider";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
import { loadRootContext } from "@/libs/root-context";
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
	head: () => {
		const { title, description } = getHomepageMeta();
		return { meta: [{ title }, { name: "description", content: description }] };
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
			queryClient.clear();
			queryClient.setQueryData(["auth", "session"], null);
			void router.navigate({ to: "/auth/login", search: { reason: "sessionExpired", callbackURL }, replace: true });
		};
		window.addEventListener("master-cv:session-expired", recover);
		return () => window.removeEventListener("master-cv:session-expired", recover);
	}, [router, queryClient]);

	// WebMCP: browser agents can list and open the signed-in user's documents from any page.
	useDocumentWebMcpTools(session !== null);

	// Suppress the app-wide donation toast inside the builder so it doesn't cover the right-sidebar controls.
	const isBuilder = useRouterState({ select: (s) => s.location.pathname.startsWith("/builder") });

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
											<TooltipProvider>
												<ConfirmDialogProvider>
													<Outlet />

													{!isBuilder && <DonationToast />}
													<DialogManager />
													<CommandPalette />
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
