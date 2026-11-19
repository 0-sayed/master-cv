import { msg } from "@lingui/core/macro";

export const trashNavigation = {
	key: "trash",
	to: "/dashboard/trash",
	icon: "trash",
	label: msg`Trash`,
	mobileLabel: msg`Trash`,
} as const;

export const dashboardNavigation = [
	{
		key: "career",
		to: "/dashboard/career/information",
		icon: "user",
		label: msg({ message: "Career information", context: "editor.navigation.career" }),
		mobileLabel: msg({ message: "Career", context: "editor.mobileNav.career" }),
	},
	{
		key: "documents",
		to: "/dashboard",
		icon: "files",
		label: msg({ message: "My documents", context: "editor.navigation.documentsTitle" }),
		mobileLabel: msg({ message: "Documents", context: "editor.mobileNav.documents" }),
	},
	{
		key: "applications",
		to: "/dashboard/applications",
		icon: "briefcase",
		label: msg({ message: "Applications", context: "editor.navigation.applications" }),
		mobileLabel: msg({ message: "Applications", context: "editor.navigation.applications" }),
	},
	trashNavigation,
] as const;
