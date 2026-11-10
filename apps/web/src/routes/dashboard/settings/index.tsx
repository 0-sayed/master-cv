import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { useUiLocale } from "@/features/locale/provider";
import { SettingsRoot } from "@/features/settings/root";

// Phones (below 640px) get the three-row root; wider screens open Account, with the pages beside it.
export const Route = createFileRoute("/dashboard/settings/")({
	component: RouteComponent,
});

function RouteComponent() {
	const { locale } = useUiLocale();
	return useBreakpoint() === "mobile" ? (
		<SettingsRoot />
	) : (
		<Navigate to="/dashboard/settings/account" search={{ locale }} replace />
	);
}
