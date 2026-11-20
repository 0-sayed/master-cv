import z from "zod";

export type PersonalTool = "coverLetters" | "applications";
export type PersonalToolPolicy = { disposition: "enabled" | "withheld"; releaseApproved: boolean };
export type PersonalToolsPolicy = Record<PersonalTool, PersonalToolPolicy>;
export const personalToolsAvailabilitySchema = z.object({ coverLetters: z.boolean(), applications: z.boolean() });
export type PersonalToolsAvailability = z.infer<typeof personalToolsAvailabilitySchema>;

/** A13: retained upstream source does not authorize product exposure. */
export const deferredFeatures = {
	byok: false,
	assistant: false,
	interviews: false,
	jobSearch: false,
	integrations: false,
	publicSharing: false,
	userApi: false,
	careerAutomation: false,
} as const;
export type DeferredFeature = keyof typeof deferredFeatures;
export const isFeatureAvailable = (feature: DeferredFeature): boolean => deferredFeatures[feature];

/** Evaluate before child loaders, including retained route aliases. */
export function deferredRoute(pathname: string): DeferredFeature | undefined {
	const path = decodeURI(pathname).replace(/\/+$/, "").toLowerCase();
	if (/^\/dashboard\/settings\/(ai|api-keys)(?:\/|$)/u.test(path)) return "byok";
	if (/^\/dashboard\/settings\/integrations(?:\/|$)/u.test(path)) return "integrations";
	if (path === "/dashboard/settings/job-search") return "jobSearch";
	if (/^\/agent(?:\/|$)/u.test(path)) return "assistant";
	if (path === "/auth/resume-password") return "publicSharing";
	if (path === "/auth/native-callback") return "userApi";
	if (/^\/dashboard\/applications\/[^/]+\/[^/]+/u.test(path)) return "interviews";
	if (/^\/dashboard\/career(?:\/|$)/u.test(path) && path !== "/dashboard/career/information") return "careerAutomation";
	if (/^\/auth\/(consent|oauth)(?:\/|$)/u.test(path)) return "userApi";
	return undefined;
}

/** Declared metadata covers RPC, REST aliases and internal procedure calls. */
export function deferredProcedure(route: {
	path?: string;
	tags?: readonly string[];
	operationId?: string;
}): DeferredFeature | undefined {
	const path = route.path ?? "";
	const tags = route.tags ?? [];
	if (/^\/auth\/api-keys(?:\/|$)/u.test(path)) return "userApi";
	if (path.startsWith("/ai-providers") || tags.includes("AI Providers")) return "byok";
	if (path.startsWith("/agent") || tags.includes("Agent")) return "assistant";
	if (path.startsWith("/integrations") || tags.includes("Integrations")) return "integrations";
	if (path.startsWith("/career/") && !/^\/career\/(master|personal-workspace|job-targets)(?:\/|$)/u.test(path))
		return "careerAutomation";
	if (
		tags.includes("Resume Sharing") ||
		/^(getResumeBySlug|recordResumeDownload|verifyResumePassword|checkResumeSlug)/u.test(route.operationId ?? "")
	)
		return "publicSharing";
	if (/^\/applications(?:\/.*)?\/ai(?:\/|$)/u.test(path)) return "jobSearch";
	if (path === "/ai/improve") return "byok";
	return undefined;
}

/** HTTP adapters outside oRPC use the same policy. */
export function deferredHttpRoute(path: string, method?: string): DeferredFeature | undefined {
	if (
		(path === "/api/auth/sign-in/social" && method === "POST") ||
		(path === "/api/auth/callback/google" && (method === "GET" || method === "POST"))
	)
		return undefined;
	if (
		/^\/(?:mcp|openapi.json|schema.json)(?:\/|$)/u.test(path) ||
		/^\/.well-known\/(?:integrations|api-catalog|agent-skills|mcp|oauth|openid|openai)/u.test(path)
	)
		return "userApi";
	if (
		/^\/api\/auth\/(?:api-key|oauth2|oauth|callback|sign-in\/social|link-social|get-access-token|refresh-token)(?:\/|$)/u.test(
			path,
		)
	)
		return "userApi";
	if (/^\/api\/resumes\/[^/]+\/[^/]+\/pdf$/u.test(path)) return "publicSharing";
	if (path.startsWith("/api/career")) return "careerAutomation";
	return undefined;
}
