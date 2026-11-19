import { msg } from "@lingui/core/macro";

export const reviewTabs = [
	{ id: "ats", icon: "file-text", label: msg`ATS check` },
	{ id: "data", icon: "database", label: msg`Data check` },
	{ id: "ai", icon: "sparkle", label: msg({ message: "AI", context: "reviewGuide.tabs.ai" }) },
] as const;
