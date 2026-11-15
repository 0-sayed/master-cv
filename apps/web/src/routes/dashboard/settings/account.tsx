import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RouteSkeleton } from "@/components/query-skeleton";
import { accountSecurityQueryOptions } from "@/features/settings/account/auth-hooks";
import { AccountSettings } from "@/features/settings/account/page";

export const Route = createFileRoute("/dashboard/settings/account")({
	validateSearch: z.object({ deleteAccount: z.boolean().optional().catch(false) }),
	// Preserve a failed result for the page's explicit recovery state instead of failing the route.
	loader: ({ context }) => context.queryClient.prefetchQuery(accountSecurityQueryOptions()),
	component: AccountSettings,
	pendingComponent: () => <RouteSkeleton shape="settings-page" />,
});
