// @vitest-environment happy-dom
import type { DocumentSummary } from "./filter";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { copyCoverLetterStyle } from "@reactive-resume/resume/cover-letter";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { LetterCardDetails, LetterThumbnail } from "./letter-card-content";
import { getUiLocaleMessages } from "@/libs/locale";

const mocks = vi.hoisted(() => ({ letter: vi.fn(), jobs: vi.fn(), version: vi.fn(), history: vi.fn(), page: vi.fn() }));
vi.mock("motion/react", () => ({ useInView: () => true }));
vi.mock("@/features/personal-tools/availability", () => ({ usePersonalToolAvailable: () => true }));
vi.mock("@/features/letters/compose", () => ({
	letterWordsQueryOptions: (locale: string) => ({ queryKey: ["words", locale], queryFn: () => ({}) }),
	letterPageData: (...args: unknown[]) => mocks.page(...args),
}));
vi.mock("./resume-thumbnail", () => ({
	DocumentThumbnail: ({ data, empty, failed }: { data?: { content: string }; empty: boolean; failed: boolean }) => (
		<div data-testid="page" data-empty={empty} data-failed={failed}>
			{data?.content}
		</div>
	),
}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: { list: { queryOptions: () => ({ queryKey: ["jobs"], queryFn: mocks.jobs }) } },
		coverLetters: {
			getById: { queryOptions: () => ({ queryKey: ["letter"], queryFn: mocks.letter }) },
			listVersions: { queryOptions: () => ({ queryKey: ["history"], queryFn: mocks.history }) },
			getVersion: { queryOptions: () => ({ queryKey: ["version"], queryFn: mocks.version }) },
		},
	},
}));
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
};
const letter = {
	...document,
	content: "<p>Dear team, my experience.</p>",
	style: copyCoverLetterStyle(defaultResumeData),
};
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
	<I18nProvider i18n={i18n}>
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	</I18nProvider>
);
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	mocks.letter.mockResolvedValue(letter);
	mocks.jobs.mockResolvedValue([]);
	mocks.history.mockResolvedValue([]);
	mocks.page.mockImplementation((value) => value);
});
afterEach(() => {
	client.clear();
	vi.clearAllMocks();
});

it("labels an unlinked draft with a human language name and caches its content", async () => {
	render(
		<>
			<LetterCardDetails document={document} />
			<LetterThumbnail document={document} />
		</>,
		{ wrapper },
	);
	await screen.findByText("Draft");
	expect(screen.getByText("Not linked")).toBeVisible();
	expect(screen.getByText("English")).toBeVisible();
	await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("Dear team"));
	expect(mocks.letter).toHaveBeenCalledOnce();
});

it("preserves the linked role and company and names its stage", async () => {
	const application = { id: "job", role: "Engineer", company: "Company 12345678-1234-1234-1234-123456789abc" };
	mocks.jobs.mockResolvedValue([{ ...application, status: "interview" }]);
	render(<LetterCardDetails document={{ ...document, application }} />, { wrapper });
	expect(await screen.findByText("Interview")).toBeVisible();
	expect(screen.getByText(`Engineer · ${application.company}`)).toBeVisible();
	expect(screen.getByText("Interview").querySelector('[data-slot="stage-dot"]')).not.toBeNull();
});

it.each(["ar-SA", "en-US"] as const)("%s: names document languages in their own language", async (locale) => {
	i18n.loadAndActivate(await getUiLocaleMessages(locale));
	const style = copyCoverLetterStyle(defaultResumeData);
	style.metadata.page.locale = "ar-SA";
	mocks.letter.mockResolvedValue({ ...letter, style });
	const { unmount } = render(<LetterCardDetails document={document} />, { wrapper });
	expect(await screen.findByText("العربية")).toBeVisible();
	expect(screen.getByText("العربية")).toHaveAttribute("aria-label", locale === "ar-SA" ? "العربية" : "Arabic");
	unmount();
	style.metadata.page.locale = "en-US";
	mocks.letter.mockResolvedValue({ ...letter, style });
	client.clear();
	render(<LetterCardDetails document={document} />, { wrapper });
	expect(await screen.findByText("English")).toBeVisible();
});

it("renders the frozen sent snapshot instead of the current sender or body", async () => {
	mocks.jobs.mockResolvedValue([{ id: "job", coverLetterId: "letter", sentCoverLetterVersionId: "sent" }]);
	mocks.history.mockResolvedValue([{ id: "sent", kind: "sent" }]);
	mocks.version.mockResolvedValue({ data: { ...letter, content: "Frozen sent body" } });
	render(
		<>
			<LetterCardDetails document={document} />
			<LetterThumbnail document={document} />
		</>,
		{ wrapper },
	);
	expect(await screen.findByText("Sent")).toBeVisible();
	await waitFor(() => expect(screen.getByTestId("page")).toHaveTextContent("Frozen sent body"));
	expect(mocks.page.mock.calls.every(([value]) => value.content === "Frozen sent body")).toBe(true);
});

it("keeps a blank letter distinct from a failed preview", async () => {
	mocks.letter.mockResolvedValue({ ...letter, content: "<p>&nbsp;</p>" });
	render(<LetterThumbnail document={document} />, { wrapper });
	await waitFor(() => expect(screen.getByTestId("page")).toHaveAttribute("data-empty", "true"));
	expect(screen.getByTestId("page")).toHaveAttribute("data-failed", "false");
});
