import { expect, it } from "vite-plus/test";
import {
	deferredFeatures,
	deferredHttpRoute,
	deferredProcedure,
	deferredRoute,
	isFeatureAvailable,
} from "./personal-tools";

it.each(Object.keys(deferredFeatures) as (keyof typeof deferredFeatures)[])(
	"withholds retained %s features in every environment",
	(feature) => {
		expect(isFeatureAvailable(feature)).toBe(false);
	},
);

it.each([
	"/dashboard/settings/ai",
	"/Dashboard/Settings/AI",
	"/dashboard/settings/api-keys/",
	"/dashboard/settings/integrations",
	"/dashboard/settings/job-search",
	"/dashboard/career",
	"/dashboard/career/coach/new",
	"/dashboard/career/knowledge/facts",
	"/dashboard/career/offers",
	"/agent/new",
	"/auth/consent",
	"/auth/native-callback",
	"/auth/resume-password",
	"/dashboard/applications/synthetic/prepare",
	"/dashboard/applications/synthetic/practice",
	"/dashboard/applications/synthetic/debrief",
	"/dashboard/applications/synthetic/messages",
])("classifies deferred direct URL %s", (path) => {
	const feature = deferredRoute(path);
	expect(feature).toBeDefined();
	if (feature) expect(isFeatureAvailable(feature)).toBe(false);
});

it.each([
	"/dashboard",
	"/dashboard/applications",
	"/dashboard/applications/synthetic",
	"/dashboard/career/information",
	"/dashboard/settings/privacy",
])("keeps approved URL %s", (path) => {
	expect(deferredRoute(path)).toBeUndefined();
});

it.each([
	"/career/master",
	"/career/master/links",
	"/career/job-targets/revisions",
	"/career/personal-workspace",
	"/ai/operations",
	"/cover-letters/review/prepare",
	"/applications/{id}/interviews",
])("preserves reviewed procedure %s", (path) => {
	expect(deferredProcedure({ path })).toBeUndefined();
});

it.each([
	["/mcp", "POST"],
	["/mcp/tools", "POST"],
	["/openapi.json", "POST"],
	["/.well-known/mcp/server-card.json", "POST"],
	["/.well-known/oauth-authorization-server", "POST"],
	["/api/auth/api-key/create", "POST"],
	["/api/auth/oauth2/register", "POST"],
	["/api/auth/callback/github", "POST"],
	["/api/auth/link-social", "POST"],
	["/api/auth/get-access-token", "POST"],
	["/api/auth/refresh-token", "POST"],
	["/api/auth/sign-in/social", "GET"],
	["/api/auth/callback/google", "DELETE"],
	["/api/resumes/owner/cv/pdf", "POST"],
	["/api/career/run", "POST"],
] as const)("withholds external adapter %s %s", (path, method) => {
	expect(deferredHttpRoute(path, method)).toBeDefined();
});

it.each([
	["/api/auth/sign-in/social", "POST"],
	["/api/auth/callback/google", "GET"],
	["/api/auth/callback/google", "POST"],
] as const)("allows approved Google auth route %s %s", (path, method) => {
	expect(deferredHttpRoute(path, method)).toBeUndefined();
});

it.each([
	["/api/auth/sign-in/social", "GET"],
	["/api/auth/callback/google", "DELETE"],
] as const)("keeps unsupported Google auth method gated: %s %s", (path, method) => {
	expect(deferredHttpRoute(path, method)).toBeDefined();
});
