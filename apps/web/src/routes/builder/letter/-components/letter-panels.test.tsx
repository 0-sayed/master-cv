// @vitest-environment happy-dom
import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, render, screen } from "@testing-library/react";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { copyCoverLetterStyle } from "@reactive-resume/resume/cover-letter";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { LetterDesignPanel } from "./design-panel";
import { LetterWritePanel } from "./write-panel";

const mocks = vi.hoisted(() => ({ letter: null as CoverLetter | null, resume: undefined as ResumeData | undefined }));
vi.mock("@/features/letters/store", () => ({
	useLetterEditorStore: (select: (state: object) => unknown) =>
		select({ letter: mocks.letter, draft: { phase: "idle" }, edit: vi.fn() }),
	discardLetterDraft: vi.fn(),
	startLetterDraft: vi.fn(),
}));
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeData: () => mocks.resume,
	useUpdateResumeData: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/features/applications/queries", () => ({ applicationsListQueryOptions: () => ({}) }));
vi.mock("@/features/letters/compose", async (importOriginal) => ({
	...(await importOriginal<object>()),
	useLetterWords: () => ({
		greeting: (name: string) => `Dear ${name},`,
		teamGreeting: "Dear hiring team,",
		hiringTeam: "Hiring team",
		signOff: "Kind regards,",
		formatDate: (date: string) => date,
	}),
}));
vi.mock("@/features/letters/use-letter-mode", () => ({ useLetterMode: () => ["write", vi.fn()] }));
vi.mock("@/features/resume/editor/write/rich-text-editor", () => ({ RichTextEditor: () => null }));
vi.mock("@/libs/orpc/client", () => ({ client: {}, orpc: { resume: { list: { queryOptions: () => ({}) } } } }));

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.resume = undefined;
	mocks.letter = {
		id: "letter",
		name: "Letter",
		content: "<p>My application.</p>",
		recipient: "",
		greeting: null,
		signOff: null,
		style: copyCoverLetterStyle(defaultResumeData),
		layout: "structured",
		recipientName: "",
		recipientCompany: "",
		letterDate: null,
		sourceResumeId: null,
		sourceApplicationId: null,
		senderLinked: false,
		designLinked: false,
		isLocked: false,
		revision: 1,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
});

it("offers font pairings for an unlinked letter without a loaded resume", async () => {
	await act(async () => {
		render(
			<I18nProvider i18n={i18n}>
				<LetterDesignPanel />
			</I18nProvider>,
		);
	});
	expect(screen.getByRole("radio", { name: /Professional/ })).toBeInTheDocument();
});

it("chooses letter fonts from its composed content instead of an unrelated loaded resume", async () => {
	mocks.resume = structuredClone(defaultResumeData);
	mocks.resume.basics.name = "Unrelated Latin resume";
	assert(mocks.letter);
	mocks.letter.recipientName = "أحمد";
	await act(async () => {
		render(
			<I18nProvider i18n={i18n}>
				<LetterDesignPanel />
			</I18nProvider>,
		);
	});
	expect(screen.getByRole("radio", { name: /Cairo/ })).toBeInTheDocument();
	expect(screen.queryByRole("radio", { name: /Professional/ })).toBeNull();
});

it("includes an Arabic font pairing in the letter design summary", async () => {
	assert(mocks.letter);
	mocks.letter.style.metadata.typography.heading.fontFamily = "Cairo";
	mocks.letter.style.metadata.typography.body.fontFamily = "Cairo";
	await act(async () => {
		render(
			<I18nProvider i18n={i18n}>
				<LetterWritePanel />
			</I18nProvider>,
		);
	});
	expect(screen.getByText(/Its own design/)).toHaveTextContent("Cairo type");
});
