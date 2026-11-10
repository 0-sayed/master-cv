import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RouteSkeleton } from "@/components/query-skeleton";
import { authAccountsQueryOptions } from "@/features/settings/account/auth-hooks";
import { AccountSettings } from "@/features/settings/account/page";

export const Route = createFileRoute("/dashboard/settings/account")({
	validateSearch: z.object({ deleteAccount: z.boolean().optional().catch(false) }),
	// Credential-dependent rows must exist on their first paint, rather than appearing after hydration.
	loader: ({ context }) => context.queryClient.ensureQueryData(authAccountsQueryOptions()),
	component: AccountSettings,
	pendingComponent: () => <RouteSkeleton shape="settings-page" />,
});
