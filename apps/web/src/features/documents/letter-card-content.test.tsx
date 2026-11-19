// @vitest-environment happy-dom
import type { DocumentSummary } from "./filter";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { LetterCardDetails } from "./letter-card-content";
import { getUiLocaleMessages } from "@/libs/locale";
const reads = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("Per-card document/history/words request forbidden");
	}),
);
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		coverLetters: {
			getById: { queryOptions: reads },
			listVersions: { queryOptions: reads },
			getVersion: { queryOptions: reads },
		},
		applications: { list: { queryOptions: reads } },
	},
}));
vi.mock("@/features/letters/compose", () => ({ letterWordsQueryOptions: reads, letterPageData: reads }));
const document: DocumentSummary = {
	type: "letter",
	id: "letter",
	name: "My saved title",
	tags: [],
	isLocked: false,
	isPublic: false,
	slug: null,
	trashedAt: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	application: null,
	metadata: { template: "onyx", locale: "en-US", accent: defaultResumeData.metadata.design.colors.primary },
	letterStatus: "draft",
};
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
function show(item: DocumentSummary) {
	return render(
		<I18nProvider i18n={i18n}>
			<LetterCardDetails document={item} />
		</I18nProvider>,
	);
}
it("uses summary-only draft identity and an explicit unlinked state", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	show(document);
	expect(screen.getByText("Draft")).toBeVisible();
	expect(screen.getByText("English")).toBeVisible();
	expect(screen.getByText("Not linked")).toBeVisible();
	expect(reads).not.toHaveBeenCalled();
});
it("uses the saved sent identity and linked stage without loading draft/history bodies", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	show({
		...document,
		letterStatus: "sent",
		application: { id: "job", company: "شركة", role: "Engineer", status: "interview" },
	});
	expect(screen.getByText("Sent")).toBeVisible();
	expect(screen.getByText("Interview")).toBeVisible();
	expect(screen.getByText("Engineer · شركة")).toHaveAttribute("dir", "auto");
	expect(reads).not.toHaveBeenCalled();
});
it.each(["ar-SA", "en-US"] as const)(
	"%s: keeps saved language and names independent of interface locale",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		show({
			...document,
			metadata: { template: "onyx", accent: defaultResumeData.metadata.design.colors.primary, locale: "ar-SA" },
		});
		expect(screen.getByText("العربية")).toHaveAttribute("aria-label", locale === "ar-SA" ? "العربية" : "Arabic");
		expect(reads).not.toHaveBeenCalled();
	},
);
it("does not invent language or status when unavailable", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	show({ ...document, metadata: null, letterStatus: null });
	expect(screen.queryByText("English")).not.toBeInTheDocument();
	expect(screen.queryByText("Draft")).not.toBeInTheDocument();
	expect(screen.getByText("Not linked")).toBeVisible();
});
