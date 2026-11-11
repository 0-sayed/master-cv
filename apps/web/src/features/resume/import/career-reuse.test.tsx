import type { ResumeData } from "@reactive-resume/schema/resume/data";
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { CareerReuseNotice } from "./career-reuse";
import { getUiLocaleMessages } from "@/libs/locale";
const mocks = vi.hoisted(() => ({
	read: vi.fn(),
	link: vi.fn(),
	save: vi.fn(),
	state: {} as { ownerId: string; resumeId: string; resume: { id: string; data: ResumeData }; editGeneration: number },
	update: vi.fn(),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { career: { master: { read: mocks.read, linkResumeFacts: mocks.link } } },
}));
vi.mock("@/features/resume/builder/draft", () => ({
	useResumeStore: { getState: () => mocks.state },
	useUpdateResumeData: () => mocks.update,
	savePendingChanges: mocks.save,
}));
const fact = {
	id: "fact",
	text: "",
	status: "",
	confirmation: "confirmed",
	revision: 2,
	draftRevision: 1,
	source: { kind: "manual", id: "source", quote: "" },
	structured: {
		section: "skills",
		entityId: "skill",
		field: "name",
		value: "TypeScript",
		source: { kind: "manual", id: "source", quote: "" },
	},
};
beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.state = {
		ownerId: "owner",
		resumeId: "cv",
		resume: { id: "cv", data: structuredClone(defaultResumeData) },
		editGeneration: 0,
	};
	mocks.update.mockImplementation((mutate) => mutate(mocks.state.resume.data));
	mocks.save.mockResolvedValue(true);
	mocks.link.mockResolvedValue(undefined);
});
it("reads and applies confirmed facts only after a click, then saves and links accepted revisions", async () => {
	mocks.read.mockResolvedValue({ facts: [fact, { ...fact, id: "pending", confirmation: "pending" }] });
	render(
		<I18nProvider i18n={i18n}>
			<CareerReuseNotice available />
		</I18nProvider>,
	);
	expect(mocks.read).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	await waitFor(() =>
		expect(mocks.link).toHaveBeenCalledWith(
			{ resumeId: "cv", links: [{ factId: "fact", acceptedRevision: 2 }] },
			expect.anything(),
		),
	);
	expect(mocks.state.resume.data.sections.skills.items).toMatchObject([{ id: "skill", name: "TypeScript" }]);
	expect(mocks.save).toHaveBeenCalledWith("cv");
	expect(fact.structured.value).toBe("TypeScript");
});
it("does not overwrite a CV edited while career facts are loading", async () => {
	let complete!: (value: unknown) => void;
	mocks.read.mockReturnValue(
		new Promise((resolve) => {
			complete = resolve;
		}),
	);
	render(
		<I18nProvider i18n={i18n}>
			<CareerReuseNotice available />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	mocks.state = { ...mocks.state, editGeneration: mocks.state.editGeneration + 1 };
	complete({ facts: [fact] });
	await screen.findByRole("alert");
	expect(mocks.update).not.toHaveBeenCalled();
	expect(mocks.link).not.toHaveBeenCalled();
});
it("retries saving and linking without copying career facts twice", async () => {
	mocks.read.mockResolvedValue({ facts: [fact] });
	mocks.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
	render(
		<I18nProvider i18n={i18n}>
			<CareerReuseNotice available />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	await screen.findByRole("alert");
	expect(mocks.link).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(mocks.link).toHaveBeenCalledOnce());
	expect(mocks.update).toHaveBeenCalledOnce();
});

it("does not start a fresh reuse retry after the CV becomes unavailable", async () => {
	mocks.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ facts: [fact] });
	const notice = (available: boolean) => (
		<I18nProvider i18n={i18n}>
			<CareerReuseNotice available={available} />
		</I18nProvider>
	);
	const view = render(notice(true));
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	await screen.findByText("offline");
	view.rerender(notice(false));
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	expect(mocks.read).toHaveBeenCalledOnce();
	expect(mocks.update).not.toHaveBeenCalled();
});

it("finishes an already-applied reuse retry when the CV is no longer empty", async () => {
	mocks.read.mockResolvedValue({ facts: [fact] });
	mocks.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
	const notice = (available: boolean) => (
		<I18nProvider i18n={i18n}>
			<CareerReuseNotice available={available} />
		</I18nProvider>
	);
	const view = render(notice(true));
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	await screen.findByRole("button", { name: "Retry" });
	view.rerender(notice(false));
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(mocks.link).toHaveBeenCalledOnce());
	expect(mocks.update).toHaveBeenCalledOnce();
	expect(mocks.read).toHaveBeenCalledOnce();
});

it.each(["en-US", "ar-SA"] as const)(
	"gives reuse errors a translated title and working recovery (%s)",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		mocks.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ facts: [fact] });
		render(
			<I18nProvider i18n={i18n}>
				<CareerReuseNotice available />
			</I18nProvider>,
		);
		fireEvent.click(screen.getByRole("button"));
		const alert = await screen.findByRole("alert");
		expect(alert.querySelector('[data-slot="alert-title"]')).toHaveTextContent(
			locale === "ar-SA" ? "حدث خطأ ما" : "Something went wrong",
		);
		expect(within(alert).getByText("offline")).toBeVisible();
		const recovery = within(alert).getByRole("button");
		expect(recovery).toBeEnabled();
		fireEvent.click(recovery);
		await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
		expect(mocks.state.resume.data.sections.skills.items).toMatchObject([{ id: "skill", name: "TypeScript" }]);
	},
);
