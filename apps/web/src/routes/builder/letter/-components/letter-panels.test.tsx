// @vitest-environment happy-dom
import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { copyCoverLetterStyle } from "@reactive-resume/resume/cover-letter";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { LetterDesignPanel } from "./design-panel";
import { LetterWritePanel } from "./write-panel";
import { getUiLocaleMessages } from "@/libs/locale";

const mocks = vi.hoisted(() => ({
	letter: null as CoverLetter | null,
	resume: undefined as ResumeData | undefined,
	applications: [] as { id: string; company: string; role: string; status: string; contacts: []; updatedAt: Date }[],
	change: vi.fn().mockResolvedValue(undefined),
	setMode: vi.fn(),
}));
vi.mock("@/features/letters/review", () => ({ LetterReviewComposer: () => <div>Reviewed letter composer</div> }));
vi.mock("@/features/letters/store", () => ({
	useLetterEditorStore: Object.assign(
		(select: (state: object) => unknown) => select({ letter: mocks.letter, draft: { phase: "idle" }, edit: vi.fn() }),
		{ getState: () => ({ letter: mocks.letter, change: mocks.change }) },
	),
	discardLetterDraft: vi.fn(),
	startLetterDraft: vi.fn(),
}));
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeData: () => mocks.resume,
	useUpdateResumeData: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: mocks.applications }) }));
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
vi.mock("@/features/letters/use-letter-mode", () => ({ useLetterMode: () => ["write", mocks.setMode] }));
vi.mock("@/features/resume/editor/write/rich-text-editor", () => ({ RichTextEditor: () => null }));
vi.mock("@/libs/orpc/client", () => ({ client: {}, orpc: { resume: { list: { queryOptions: () => ({}) } } } }));

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.resume = undefined;
	mocks.applications = [];
	mocks.change.mockClear();
	mocks.setMode.mockClear();
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

it("names the application control in Arabic without a redundant For heading", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	render(
		<I18nProvider i18n={i18n}>
			<LetterWritePanel />
		</I18nProvider>,
	);
	expect(screen.getByRole("combobox", { name: "ربط طلب الوظيفة" })).toBeInTheDocument();
	expect(screen.queryByRole("heading", { name: "ل" })).toBeNull();
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

it.each([true, false])(
	"keeps design names in an isolated description and opens Design (linked: %s)",
	async (linked) => {
		assert(mocks.letter);
		mocks.letter.designLinked = linked;
		mocks.letter.style.metadata.typography.heading.fontFamily = "Cairo";
		mocks.letter.style.metadata.typography.body.fontFamily = "Cairo";
		mocks.letter.style.metadata.design.colors.primary = defaultResumeData.metadata.design.colors.primary;
		await act(async () => {
			render(
				<I18nProvider i18n={i18n}>
					<LetterWritePanel />
				</I18nProvider>,
			);
		});
		const row = screen.getByRole("region", { name: "Design" });
		const chip = within(row).getByText(linked ? "Matches the CV" : "Custom design");
		expect(chip).toHaveAccessibleDescription(/Font: Cairo/);
		const descriptionId = chip.getAttribute("aria-describedby");
		assert(descriptionId);
		const description = document.getElementById(descriptionId);
		assert(description);
		expect(description).toHaveClass("sr-only");
		expect(description.querySelectorAll("bdi")).toHaveLength(2);
		expect(description.querySelector("bdi:last-child")).toHaveTextContent("Cairo");
		expect(within(chip).getByText("Aa")).toHaveStyle({ fontFamily: "'Cairo Preview', sans-serif" });
		expect(chip.querySelector('[data-shape="dot"]')).toHaveStyle({
			backgroundColor: defaultResumeData.metadata.design.colors.primary,
		});
		expect(within(row).queryByText(/Its own design|Matches the resume|Change it in Design/)).toBeNull();
		await userEvent.setup().click(within(row).getByRole("button", { name: "Change" }));
		expect(mocks.setMode).toHaveBeenCalledWith("design");
		expect(mocks.change).not.toHaveBeenCalled();
	},
);

it.each([true, false])("shows the compact Arabic design status (linked: %s)", async (linked) => {
	assert(mocks.letter);
	mocks.letter.designLinked = linked;
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	render(
		<I18nProvider i18n={i18n}>
			<LetterWritePanel />
		</I18nProvider>,
	);
	const row = screen.getByRole("region", { name: "التصميم" });
	const chip = within(row).getByText(linked ? "مطابق للسيرة الذاتية" : "تصميم مخصص");
	expect(chip).toHaveAccessibleDescription(/القالب: .*الخط:/);
	await userEvent.setup().hover(chip);
	expect((await screen.findByRole("tooltip")).textContent).toMatch(/القالب: .*الخط:/);
	expect(screen.getByRole("tooltip").querySelectorAll("bdi")).toHaveLength(2);
	await userEvent.setup().click(within(row).getByRole("button", { name: "تغيير" }));
	expect(mocks.setMode).toHaveBeenCalledWith("design");
});

it("leaves the letter and its manual recipient untouched when its existing job is selected", async () => {
	assert(mocks.letter);
	mocks.letter.sourceApplicationId = "application";
	mocks.letter.recipientCompany = "Manual company";
	mocks.applications = [
		{ id: "application", company: "Lumen", role: "Engineer", status: "applied", contacts: [], updatedAt: new Date() },
	];
	render(
		<I18nProvider i18n={i18n}>
			<LetterWritePanel />
		</I18nProvider>,
	);
	const user = userEvent.setup();
	await user.click(screen.getByRole("combobox", { name: "Link job application" }));
	await user.click(screen.getByRole("option", { name: /Engineer/ }));
	expect(mocks.change).not.toHaveBeenCalled();
	expect(mocks.letter.recipientCompany).toBe("Manual company");
});
