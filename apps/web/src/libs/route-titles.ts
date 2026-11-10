import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// Reuse the visible surface's Lingui identity, including its copy-deck context.
const pageNames: Record<string, MessageDescriptor> = {
	"/auth/login": msg({ message: "Sign in", context: "common.navigation.signIn" }),
	"/auth/register": msg({ message: "Create an account", context: "auth.signUp.title" }),
	"/auth/forgot-password": msg({ message: "Reset password", context: "auth.reset.title" }),
	"/auth/reset-password": msg({ message: "New password", context: "auth.password.newLabel" }),
	"/auth/verify-email": msg({ message: "Verify your email address", context: "auth.verifyEmail.title" }),
	"/auth/verify-2fa": msg`Two-Factor Authentication`,
	"/auth/verify-2fa-backup": msg`Verify with a Backup Code`,
	"/auth/error": msg`Sign-in didn't complete`,
	"/auth/consent": msg`Connect an application`,
	"/auth/native-callback": msg`Open the Master CV app`,
	"/auth/resume-password": msg`This resume is password protected`,
	"/dashboard": msg({ message: "My documents", context: "editor.navigation.documentsTitle" }),
	"/dashboard/welcome": msg({ message: "Welcome {name}, let us start your CV", context: "auth.welcome.title" }),
	"/dashboard/career/information": msg({ message: "Career information", context: "editor.navigation.career" }),
	"/dashboard/applications": msg({ message: "Applications", context: "editor.navigation.applications" }),
	"/dashboard/settings": msg({ message: "Settings", context: "account.navigation.settings" }),
	"/dashboard/settings/account": msg({ message: "Account", context: "account.settings.accountTab" }),
	"/dashboard/settings/preferences": msg({ message: "Preferences", context: "account.preferences.title" }),
	"/dashboard/settings/ai": msg({ message: "Settings", context: "account.navigation.settings" }),
	"/dashboard/trash": msg`Trash`,
	"/dashboard/career": msg`Career`,
	"/dashboard/career/coach": msg`Coach`,
	"/dashboard/career/knowledge": msg`Knowledge`,
	"/dashboard/career/knowledge/facts": msg`Facts`,
	"/dashboard/career/knowledge/stories": msg`Stories`,
	"/dashboard/career/knowledge/preferences": msg({
		message: "Preferences",
		context: "Career preferences: the roles, places, pay and ways of working you want",
	}),
	"/dashboard/career/offers": msg`Offers`,
	"/$username/$slug": msg`This resume isn't shared right now.`,
};

export const formatPageTitle = (pageName: string) => `${pageName} — Master CV`;

/** Static destinations share one title policy; document routes supply their real name from their loader. */
export function getRouteTitle(routeId: string, values: { name?: string } = {}) {
	const path = routeId.replace(/\/+$/, "") || "/";
	if (path === "/_home" || path === "/_home/ats-checker") return undefined;
	const section = path.startsWith("/dashboard/applications/")
		? "/dashboard/applications"
		: path.startsWith("/dashboard/career/coach/")
			? "/dashboard/career/coach"
			: path.startsWith("/dashboard/career/knowledge/stories/")
				? "/dashboard/career/knowledge/stories"
				: path;
	const message = pageNames[section];
	if (message) return formatPageTitle(i18n._({ ...message, values }));
	if (path.startsWith("/templates/")) return formatPageTitle(i18n._(msg`Template`));
	return formatPageTitle(i18n._(msg`We couldn't find that page`));
}
