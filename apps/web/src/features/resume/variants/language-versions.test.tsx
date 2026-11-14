// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LanguageVersions } from "./language-versions";
const state = vi.hoisted(() => ({ accepted: false, stale: false, failed: false }));
vi.mock("@/libs/orpc/client", () => {
	const options = (kind: string) => ({ queryOptions: ({ input }: { input: unknown }) => ({ kind, input }) });
	return {
		client: {},
		orpc: { resume: { variants: { list: options("list"), freshness: options("freshness") }, getById: options("cv") } },
	};
});
vi.mock("@tanstack/react-query", () => ({
	useMutation: () => ({ isPending: false }),
	useQuery: ({ kind }: { kind: string }) => {
		if (kind === "list")
			return {
				data: [
					{ resumeId: "base", name: "Original document", variantKind: "base", documentLocale: "ar-SA" },
					{
						resumeId: "copy",
						name: "Language document",
						variantKind: "language",
						sourceResumeId: "base",
						documentLocale: state.accepted ? "en-US" : "ar-SA",
						targetLocale: "en-US",
						operationId: null,
					},
				],
				error: state.failed ? new Error("offline") : null,
				refetch: vi.fn(),
			};
		if (kind === "freshness")
			return {
				data: { reviewState: state.accepted ? "accepted" : "pending", state: state.stale ? "stale" : "current" },
				refetch: vi.fn(),
			};
		return {
			data: {
				data: { basics: { headline: "Saved source headline" }, summary: { content: "<p>Saved source text</p>" } },
			},
			refetch: vi.fn(),
		};
	},
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/source">{children}</a>,
}));
vi.mock("../editor/proposals/review-operation", () => ({
	ReviewLaunch: () => null,
	ReviewOperationPanel: () => null,
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));
vi.mock("./translation-review", () => ({ TranslationReview: () => null }));
vi.mock("@/components/layout/page-header", () => ({
	PageHeader: ({ title, description }: { title: string; description: string }) => (
		<header>
			{title}
			<p>{description}</p>
		</header>
	),
}));
afterEach(() => {
	cleanup();
	state.accepted = false;
	state.stale = false;
	state.failed = false;
});
function show(locale = "en-US") {
	i18n.loadAndActivate({ locale, messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<LanguageVersions resumeId="base" />
		</I18nProvider>,
	);
}
it.each(["en-US", "ar-SA"])("preserves actual pending source language and saved content in %s interface", (locale) => {
	show(locale);
	expect(screen.getByText("Awaiting your confirmation")).toBeDefined();
	expect(screen.queryByText("Reviewed translation saved")).toBeNull();
	expect(screen.getAllByText(/ar-SA/)).toHaveLength(2);
	expect(screen.getAllByText("Saved source text")).toHaveLength(2);
});
it("shows acknowledged translation and independent source-change recovery", () => {
	state.accepted = true;
	state.stale = true;
	show();
	expect(screen.getByText("Reviewed translation saved")).toBeDefined();
	expect(screen.getByText(/en-US/)).toBeDefined();
	expect(screen.getByRole("alert").textContent).toContain("source changed or is unavailable");
});
it("keeps a failed family request distinct from a successful empty result", () => {
	state.failed = true;
	show();
	expect(screen.getByRole("alert").textContent).toContain("Could not load language versions");
	expect(screen.queryByRole("button", { name: "Create language copy" })).toBeNull();
});
