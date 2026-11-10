export type DashboardWidth = "default" | "wide" | "form" | "narrow";

/** One route policy drives both the shell header and its page canvas before render. */
export function dashboardWidth(pathname: string): DashboardWidth {
	const path = pathname.replace(/\/$/u, "");
	if (path === "/dashboard/welcome") return "form";
	if (/^\/dashboard\/settings(?:\/|$)/u.test(path)) return "narrow";
	if (
		[
			"/dashboard",
			"/dashboard/resumes",
			"/dashboard/cover-letters",
			"/dashboard/applications",
			"/dashboard/career/information",
			"/dashboard/career/knowledge/facts",
			"/dashboard/trash",
		].includes(path)
	)
		return "wide";
	// Workspaces, comparisons and individual records retain their existing canvas/form limits.
	return "default";
}
