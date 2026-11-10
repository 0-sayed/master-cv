import { createRouter } from "@tanstack/react-router";
import { SKELETON_DELAY_MS, SKELETON_MINIMUM_MS } from "@reactive-resume/ui/components/skeleton";
import { ErrorScreen } from "./components/layout/error-screen";
import { LoadingScreen } from "./components/layout/loading-screen";
import { NotFoundScreen } from "./components/layout/not-found-screen";
import { orpc } from "./libs/orpc/client";
import { pageTransitionTypes } from "./libs/page-transition";
import { getQueryClient } from "./libs/query/client";
import { loadRootContext } from "./libs/root-context";
import { loadUiFonts } from "./libs/ui-fonts";
import { routeTree } from "./routeTree.gen";

// Only same-shell destinations fade in. Shell boundaries, filters and first paint swap immediately.
const supportsTransitionTypes = globalThis.CSS?.supports?.("selector(:active-view-transition-type(a))") === true;

export const getRouter = async () => {
	const queryClient = getQueryClient();

	const { theme, locale, session, flags } = await loadRootContext(queryClient);
	await loadUiFonts(locale);

	const router = createRouter({
		routeTree,
		scrollRestoration: true,
		defaultStructuralSharing: true,
		defaultViewTransition: supportsTransitionTypes && {
			types: ({ fromLocation, toLocation, pathChanged }) =>
				pathChanged &&
				pageTransitionTypes(
					fromLocation?.pathname,
					toLocation.pathname,
					globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
				),
		},
		// Hovering a link starts its loaders; TanStack Query decides freshness, not the router's preload cache.
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		// Unknown-shape boot/auth gates only; known content routes supply a skeleton pending component.
		defaultPendingMs: SKELETON_DELAY_MS,
		defaultPendingMinMs: SKELETON_MINIMUM_MS,
		defaultErrorComponent: ErrorScreen,
		defaultPendingComponent: LoadingScreen,
		defaultNotFoundComponent: NotFoundScreen,
		context: { orpc, queryClient, theme, locale, session, flags },
	});

	return router;
};
