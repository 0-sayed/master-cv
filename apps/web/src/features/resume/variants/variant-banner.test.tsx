import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { VariantBanner } from "./variant-banner";
const state = vi.hoisted(() => ({ kind: "language", locale: "ar-SA" }));
vi.mock("@tanstack/react-query", () => ({
	useQuery: () => ({
		data: [{ resumeId: "copy", variantKind: state.kind, documentLocale: state.locale, sourceResumeId: "base" }],
	}),
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { resume: { variants: { list: { queryOptions: () => ({}) } } } } }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/source">{children}</a>,
}));
afterEach(cleanup);
function show() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<VariantBanner resumeId="copy" />
		</I18nProvider>,
	);
}
it("labels the stored language and provides deliberate source and review navigation", () => {
	state.kind = "language";
	show();
	expect(screen.getByText("ar-SA")).toBeDefined();
	expect(screen.getByRole("link", { name: "Review language copy" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Open source CV" })).toBeDefined();
});
it("keeps originals free of a copy banner", () => {
	state.kind = "base";
	const { container } = show();
	expect(container.textContent).toBe("");
});
