import type { ReviewState } from "./review-draft";
// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, act, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Dialog, DialogContent } from "@reactive-resume/ui/components/dialog";
import { ImportReview } from "./review";
import { createReviewState } from "./review-draft";
import { ConfirmDialogProvider } from "@/hooks/use-confirm";
vi.mock("./ai-assistance-panel", () => ({
	ImportAssistance: () => <button type="button">Synthetic assistance action</button>,
}));
const mocks = vi.hoisted(() => ({ read: vi.fn(), confirm: vi.fn() }));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => ({ hasUsableProvider: false }),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { career: { master: { read: mocks.read } }, resume: { confirmImport: mocks.confirm } },
}));
beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
vi.mock("./source-preview", () => ({ SourcePreview: () => <div>PDF fixture</div> }));
const flowId = "550e8400-e29b-41d4-a716-446655440000";
const saveButton = () => screen.getByRole("button", { name: "Create CV and open editor" });

function importedReview(
	onBack = vi.fn(),
	options: {
		state?: ReviewState;
		partial?: boolean;
		onCheckpoint?: (state: ReviewState) => Promise<void>;
		file?: File;
		pages?: { page: number; text: string }[];
	} = {},
) {
	const initial = parseResumeText(
		"Sara Example\nEXPERIENCE\nExample Labs | Engineer | 2024-07 – Present\nSKILLS\nTypeScript",
	);
	return render(
		<I18nProvider i18n={i18n}>
			<div dir={i18n.locale === "ar-SA" ? "rtl" : "ltr"}>
				<QueryClientProvider client={new QueryClient()}>
					<ConfirmDialogProvider>
						<ImportReview
							{...options}
							initial={initial}
							flowId={flowId}
							issues={[{ field: "position", source: "Engineer" }]}
							onBack={onBack}
							onSaved={() => {}}
						/>
					</ConfirmDialogProvider>
				</QueryClientProvider>
			</div>
		</I18nProvider>,
	);
}
it("reviews sections without per-field buttons or moving entries", () => {
	importedReview();
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("0 of 3 sections reviewed");
	expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Confirm all remaining" }));
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("2 of 3 sections reviewed");
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	const entry = screen.getByRole("article", { name: /Engineer/ });
	expect(within(entry).getByText("Position").closest("div")).toHaveAttribute("data-uncertain", "true");
	expect(within(entry).getByText("Company").closest("div")).not.toHaveAttribute("data-uncertain", "true");
	fireEvent.click(within(entry).getByRole("button", { name: "Confirm entry" }));
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("3 of 3 sections reviewed");
	expect(screen.getByRole("article", { name: /Engineer/ })).toBeVisible();
});
it("invalidates review after editing and removes entries from the submitted CV", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockResolvedValue({ resumeId: "created" });
	importedReview();
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Confirm section" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit" }));
	fireEvent.change(screen.getByLabelText("Position"), { target: { value: "Senior Engineer" } });
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("0 of 3 sections reviewed");
	fireEvent.click(screen.getByRole("button", { name: "Remove" }));
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("0 of 2 sections reviewed");
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
	expect(mocks.confirm.mock.calls[0]?.[0].data.sections.experience.items).toEqual([]);
	expect(mocks.confirm.mock.calls[0]?.[0].acceptedFacts).toEqual([]);
});
it("cancel performs no server write", () => {
	const cancel = vi.fn();
	importedReview(cancel);
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancel).toHaveBeenCalledOnce();
	expect(mocks.confirm).not.toHaveBeenCalled();
});
it("disables assistance while the final import confirmation is pending", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockImplementation(() => new Promise(() => {}));
	importedReview(vi.fn(), { pages: [{ page: 1, text: "Synthetic source" }] });
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
	expect(screen.getByRole("button", { name: "Synthetic assistance action" })).toBeDisabled();
});
it("requires individual section review for a partially read file instead of offering a no-op bulk action", () => {
	importedReview(vi.fn(), { partial: true });
	expect(screen.getByRole("button", { name: "Confirm all remaining" })).toBeDisabled();
	expect(
		screen.getByText(
			"Only part of this file could be read. Review every section and add missing information before saving.",
		),
	).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: "Confirm section" }));
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("1 of 3 sections reviewed");
});
it("keeps an identical confirmation payload after an unknown outcome", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ resumeId: "created" });
	importedReview();
	fireEvent.click(screen.getByRole("button", { name: "Confirm all remaining" }));
	fireEvent.click(saveButton());
	await screen.findByRole("alert");
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(2));
	expect(mocks.confirm.mock.calls[1]?.[0]).toEqual(mocks.confirm.mock.calls[0]?.[0]);
});
it("restores edits, section progress and the exact retry payload after a page refresh", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce({ resumeId: "created" });
	let checkpoint: ReviewState | undefined;
	const onCheckpoint = async (state: ReviewState) => {
		checkpoint = structuredClone(state);
	};
	const first = importedReview(vi.fn(), { onCheckpoint });
	fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Reviewed English name" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm all remaining" }));
	fireEvent.click(saveButton());
	await screen.findByRole("alert");
	expect(checkpoint?.submission).toEqual(mocks.confirm.mock.calls[0]?.[0]);
	if (!checkpoint) throw new Error("Missing persisted review checkpoint");
	first.unmount();
	importedReview(vi.fn(), { state: checkpoint, onCheckpoint });
	expect(screen.getByLabelText("Full name")).toHaveValue("Reviewed English name");
	expect(screen.getByRole("status", { name: "Review progress" })).toHaveTextContent("2 of 3 sections reviewed");
	expect(screen.getByLabelText("Full name")).toBeDisabled();
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(2));
	expect(mocks.read).toHaveBeenCalledTimes(1);
	expect(mocks.confirm.mock.calls[1]?.[0]).toEqual(mocks.confirm.mock.calls[0]?.[0]);
});
it("does not send confirmation until its exact retry payload is durably checkpointed", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	const onCheckpoint = vi.fn(async (state: ReviewState) => {
		if (state.submission) throw new Error("Storage unavailable");
	});
	importedReview(vi.fn(), { onCheckpoint });
	fireEvent.click(saveButton());
	await screen.findByRole("alert");
	expect(mocks.confirm).not.toHaveBeenCalled();
	expect(onCheckpoint.mock.calls.some(([state]) => !!state.submission)).toBe(true);
});
it.each(["ar-SA", "en-US"])("isolates imported English values in %s", (locale) => {
	i18n.loadAndActivate({ locale, messages: {} });
	importedReview();
	expect(screen.getByLabelText("Full name")).toHaveAttribute("dir", "auto");
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	expect(screen.getByText("Engineer", { selector: "dd" })).toHaveAttribute("dir", "auto");
});

it.each(["en-US", "ar-SA"])("keeps phone grouping and LTR display in %s review", (locale) => {
	i18n.loadAndActivate({ locale, messages: {} });
	const initial = structuredClone(defaultResumeData);
	initial.basics.phone = "+20 101 234 5678";
	render(
		<I18nProvider i18n={i18n}>
			<div dir={locale === "ar-SA" ? "rtl" : "ltr"}>
				<Dialog open>
					<DialogContent>
						<ImportReview initial={initial} flowId={flowId} onBack={() => {}} onSaved={() => {}} />
					</DialogContent>
				</Dialog>
			</div>
		</I18nProvider>,
	);
	const phone = screen.getByLabelText("Phone");
	expect(phone).toHaveValue("+20 101 234 5678");
	expect(phone).toHaveAttribute("type", "tel");
	expect(phone).toHaveAttribute("dir", "ltr");
});

it("shows uncertain source fields and ongoing dates in the review", () => {
	const initial = parseResumeText("EXPERIENCE\nExample Labs | Engineer | 2024-07 – Present");
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<DialogContent>
					<ImportReview
						initial={initial}
						flowId={flowId}
						issues={[{ field: "position", source: "Ambiguous source field" }]}
						onBack={() => {}}
						onSaved={() => {}}
					/>
				</DialogContent>
			</Dialog>
		</I18nProvider>,
	);
	expect(screen.getByText("Ambiguous source field")).toBeVisible();
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	expect(screen.getAllByText("Jul 2024 – Present")[0]).toBeInTheDocument();
});
function review(onSaved = vi.fn()) {
	return render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<DialogContent>
					<ImportReview
						initial={structuredClone(defaultResumeData)}
						flowId={flowId}
						onBack={() => {}}
						onSaved={onSaved}
					/>
				</DialogContent>
			</Dialog>
		</I18nProvider>,
	);
}
it("does not navigate when a dismissed confirmation completes", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	let complete!: (result: { resumeId: string }) => void;
	mocks.confirm.mockReturnValue(
		new Promise((resolve) => {
			complete = resolve;
		}),
	);
	const saved = vi.fn();
	const first = review(saved);
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
	first.unmount();
	review();
	fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New flow" } });
	await act(async () => {
		complete({ resumeId: "obsolete" });
	});
	expect(saved).not.toHaveBeenCalled();
	expect(screen.getByLabelText("Full name")).toHaveValue("New flow");
});
it("reconciles a rejected master revision without replacing local corrections or accepting changed facts", async () => {
	const structured = {
		section: "skills",
		entityId: "skill-1",
		field: "name",
		value: "Original skill",
		source: { kind: "manual", id: "source", quote: "" },
	};
	const fact = {
		id: "fact-1",
		text: "",
		source: structured.source,
		status: "",
		structured,
		confirmation: "confirmed",
		revision: 1,
		draftRevision: 0,
	};
	mocks.read.mockResolvedValueOnce({ profileRevision: 1, facts: [fact] }).mockResolvedValueOnce({
		profileRevision: 2,
		facts: [{ ...fact, structured: { ...structured, value: "Changed elsewhere" }, revision: 2 }],
	});
	mocks.confirm
		.mockRejectedValueOnce(new ORPCError("IMPORT_REVIEW_CONFLICT", { status: 409 }))
		.mockResolvedValueOnce({ resumeId: "saved" });
	review();
	fireEvent.click(screen.getByRole("button", { name: "Use confirmed career information" }));
	await screen.findByRole("button", { name: /^Skills/ });
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Skills/ }),
	);
	expect(screen.getByText("Original skill", { selector: "dd" })).toBeVisible();
	fireEvent.click(screen.getByRole("button", { name: /^Basic information/ }));
	fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Local correction" } });
	fireEvent.click(saveButton());
	await screen.findByRole("alert");
	fireEvent.click(screen.getByRole("button", { name: "Refresh career information for review" }));
	await waitFor(() => expect(saveButton()).toBeEnabled());
	expect(screen.getByLabelText("Full name")).toHaveValue("Local correction");
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Skills/ }),
	);
	expect(screen.getByText("Original skill", { selector: "dd" })).toBeVisible();
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(2));
	expect(mocks.confirm.mock.calls[1]?.[0]).toMatchObject({
		expectedProfileRevision: 2,
		acceptedFacts: [],
		data: { basics: { name: "Local correction" } },
	});
	expect(mocks.confirm.mock.calls[1]?.[0].flowId).not.toBe(flowId);
});

it("gives partial extraction a titled warning and a visible review recovery action", () => {
	importedReview(vi.fn(), { partial: true });
	const notice = screen.getByText(/Only part of this file/).closest('[data-slot="alert"]') as HTMLElement;
	expect(notice.querySelector('[data-slot="alert-title"]')).toHaveTextContent("Review imported information");
	expect(within(notice).getByRole("button", { name: "Review now" })).toBeEnabled();
});

it.each(["en-US", "ar-SA"])("places information before the source in DOM and tabs for %s", (locale) => {
	i18n.loadAndActivate({ locale, messages: {} });
	importedReview(vi.fn(), { file: new File(["pdf"], "fixture.pdf") });
	const panels = screen.getAllByRole("tabpanel");
	expect(panels.map((panel) => panel.id.endsWith("-information"))).toEqual([true, false]);
	expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Extracted information");
});
it("keeps muted source metadata actionable", () => {
	importedReview(vi.fn(), { file: new File(["pdf"], "fixture.pdf"), pages: [{ page: 1, text: "Sara Example" }] });
	const source = screen.getByRole("button", { name: "PDF page 1" });
	expect(source).toHaveClass("type-metadata", "text-ink-3");
	fireEvent.click(source);
	expect(screen.getByRole("tab", { name: "Original PDF" })).toHaveAttribute("aria-selected", "true");
});

it("renders the structured date once instead of the legacy period label", () => {
	importedReview();
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	const entry = screen.getByRole("article", { name: /Engineer/ });
	expect(within(entry).queryByText("period")).not.toBeInTheDocument();
	expect(within(entry).getAllByText("Jul 2024 – Present")).toHaveLength(1);
});

it("does not attribute repeated source text to an arbitrary PDF page", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockResolvedValue({ resumeId: "created" });
	importedReview(vi.fn(), {
		file: new File(["pdf"], "fixture.pdf"),
		pages: [
			{ page: 1, text: "Sara Example TypeScript" },
			{ page: 2, text: "Sara Example TypeScript" },
		],
	});
	expect(screen.queryByRole("button", { name: "PDF page 1" })).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Confirm all remaining" }));
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
	const skill = mocks.confirm.mock.calls[0]?.[0].acceptedFacts.find(
		({ fact }: { fact: { value: unknown } }) => fact.value === "TypeScript",
	);
	expect(skill.fact.source.quote).toBe("TypeScript");
});

it("allows partial imports to save only after every current section is reviewed", () => {
	importedReview(vi.fn(), { partial: true });
	expect(saveButton()).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Confirm section" }));
	expect(saveButton()).toBeDisabled();
	const navigation = screen.getByRole("navigation", { name: "Review sections" });
	for (const section of [/^Experience/, /^Skills/]) {
		fireEvent.click(within(navigation).getByRole("button", { name: section }));
		fireEvent.click(screen.getByRole("button", { name: "Confirm section" }));
	}
	expect(saveButton()).toBeEnabled();
});

it("does not bypass partial review requirements through an error retry", async () => {
	const onCheckpoint = vi.fn(async () => {
		throw new Error("Storage unavailable");
	});
	importedReview(vi.fn(), { partial: true, onCheckpoint });
	fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
	await act(async () => {});
	expect(mocks.read).not.toHaveBeenCalled();
	expect(mocks.confirm).not.toHaveBeenCalled();
});

it("preserves decoded description text in the accepted source quote", async () => {
	mocks.read.mockResolvedValue({ profileRevision: 0, facts: [] });
	mocks.confirm.mockResolvedValue({ resumeId: "created" });
	const data = parseResumeText("Sara Example\nEXPERIENCE\nExample Labs | Engineer | 2020 - 2024\nSaved <5 hours>.");
	importedReview(vi.fn(), { state: createReviewState(data, flowId) });
	fireEvent.click(
		within(screen.getByRole("navigation", { name: "Review sections" })).getByRole("button", { name: /^Experience/ }),
	);
	fireEvent.click(screen.getByRole("button", { name: "Confirm section" }));
	fireEvent.click(saveButton());
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
	const description = mocks.confirm.mock.calls[0]?.[0].acceptedFacts.find(
		({ fact }: { fact: { field: string } }) => fact.field === "description",
	);
	expect(description.fact.value).toBe("Saved <5 hours>.");
	expect(description.fact.source.quote).toBe("Saved <5 hours>.");
});
