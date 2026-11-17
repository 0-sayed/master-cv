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
	"/mcp",
	"/mcp/tools",
	"/openapi.json",
	"/.well-known/mcp/server-card.json",
	"/.well-known/oauth-authorization-server",
	"/api/auth/api-key/create",
	"/api/auth/oauth2/register",
	"/api/auth/callback/google",
	"/api/auth/get-access-token",
	"/api/resumes/owner/cv/pdf",
	"/api/career/run",
])("withholds external adapter %s", (path) => {
	expect(deferredHttpRoute(path)).toBeDefined();
});
