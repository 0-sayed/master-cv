// @vitest-environment happy-dom
import type { ReviewDraft } from "./review-draft";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createReviewState } from "./review-draft";
import { getUiLocaleMessages } from "@/libs/locale";
import { Route } from "@/routes/dashboard/import/$flowId";

const mocks = vi.hoisted(() => ({
	draft: null as ReviewDraft | null,
	flowId: "550e8400-e29b-41d4-a716-446655440000",
	read: vi.fn(),
	save: vi.fn(),
	remove: vi.fn(),
	navigate: vi.fn(),
	invalidate: vi.fn(),
	markNew: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: object) => ({
		options,
		useLoaderData: () => mocks.draft,
		useRouteContext: () => ({
			session: { user: { id: "owner" } },
			queryClient: { invalidateQueries: mocks.invalidate },
		}),
		useParams: () => ({ flowId: mocks.flowId }),
		useNavigate: () => mocks.navigate,
	}),
}));
vi.mock("./review-draft", async (original) => ({
	...(await original<typeof import("./review-draft")>()),
	readReviewDraft: mocks.read,
	saveReviewDraft: mocks.save,
	removeReviewDraft: mocks.remove,
}));
vi.mock("./review", () => ({
	ImportReview: ({
		initial,
		onSaved,
		onBack,
		onCheckpoint,
	}: {
		initial: typeof defaultResumeData;
		onSaved: (id: string) => void;
		onBack: () => void;
		onCheckpoint: (state: ReturnType<typeof createReviewState>) => Promise<void>;
	}) => (
		<>
			<p>{initial.basics.name}</p>
			<button onClick={() => onSaved("created-cv")}>Finish review</button>
			<button onClick={onBack}>Cancel review</button>
			<button onClick={() => void onCheckpoint(createReviewState(initial, mocks.flowId))}>Checkpoint</button>
		</>
	),
}));
vi.mock("@/components/layout/page-header", () => ({
	DashboardPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/documents/new-documents", () => ({
	useNewDocumentsStore: { getState: () => ({ markNew: mocks.markNew }) },
}));
vi.mock("@/libs/orpc/client", () => ({ orpc: { documents: { key: () => ["documents"] } } }));

beforeEach(() => {
	vi.resetAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.flowId = "550e8400-e29b-41d4-a716-446655440000";
	const data = structuredClone(defaultResumeData);
	data.basics.name = "First import";
	mocks.draft = {
		version: 1,
		ownerId: "owner",
		flowId: mocks.flowId,
		expiresAt: Date.now() + 60_000,
		file: new File(["pdf"], "synthetic.pdf"),
		initial: data,
		pages: [],
		issues: [],
		partial: false,
		state: createReviewState(data, mocks.flowId),
	};
	mocks.save.mockResolvedValue(undefined);
	mocks.remove.mockResolvedValue(undefined);
});
const page = () => {
	const Component = Route.options.component;
	if (!Component) throw new Error("Missing review route component");
	return (
		<I18nProvider i18n={i18n}>
			<Component />
		</I18nProvider>
	);
};
it("uses the shell's existing canvas instead of nesting a second dashboard body", () => {
	render(page());
	expect(screen.queryByRole("main")).not.toBeInTheDocument();
});
it("does not display cached loader data belonging to another owner", () => {
	if (!mocks.draft) throw new Error("Missing initial draft");
	mocks.draft = { ...mocks.draft, ownerId: "another-owner" };
	render(page());
	expect(screen.queryByText("First import")).not.toBeInTheDocument();
	expect(
		screen.getByText("This import review has expired or is unavailable on this device. Choose your file again."),
	).toBeVisible();
	expect(mocks.save).not.toHaveBeenCalled();
});
it("cancel waits for local checkpoints and removes only this owner's flow without marking a CV created", async () => {
	let complete!: () => void;
	mocks.save.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				complete = resolve;
			}),
	);
	render(page());
	fireEvent.click(screen.getByRole("button", { name: "Checkpoint" }));
	await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
	fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
	expect(mocks.remove).not.toHaveBeenCalled();
	complete();
	await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }));
	expect(mocks.remove).toHaveBeenCalledWith({ ownerId: "owner", flowId: mocks.flowId });
	expect(mocks.markNew).not.toHaveBeenCalled();
});
it("a cleanup retry after successful confirmation still opens the created CV", async () => {
	mocks.remove.mockRejectedValueOnce(new Error("Local storage unavailable")).mockResolvedValueOnce(undefined);
	render(page());
	fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
	await screen.findByRole("button", { name: "Retry" });
	expect(mocks.navigate).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() =>
		expect(mocks.navigate).toHaveBeenCalledWith({
			to: "/builder/$resumeId",
			params: { resumeId: "created-cv" },
			search: { mode: "write" },
			replace: true,
		}),
	);
	expect(mocks.markNew).toHaveBeenCalledWith("created-cv");
});
it("switching flow resets the checkpoint session instead of overwriting the previous draft", async () => {
	const view = render(page());
	fireEvent.click(screen.getByRole("button", { name: "Checkpoint" }));
	await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
	mocks.flowId = "550e8400-e29b-41d4-a716-446655440001";
	if (!mocks.draft) throw new Error("Missing initial draft");
	mocks.draft = { ...mocks.draft, flowId: mocks.flowId, initial: structuredClone(defaultResumeData) };
	mocks.draft.initial.basics.name = "Second import";
	view.rerender(page());
	fireEvent.click(screen.getByRole("button", { name: "Checkpoint" }));
	await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
	expect(mocks.save.mock.calls[1]?.[0]).toMatchObject({
		flowId: mocks.flowId,
		initial: { basics: { name: "Second import" } },
	});
});

it.each(["en-US", "ar-SA"] as const)(
	"gives unavailable reviews a translated title and working recovery (%s)",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		mocks.draft = null;
		render(page());
		const recovery = screen.getByRole("button");
		const alert = recovery.closest('[data-slot="alert"]');
		expect(alert?.querySelector('[data-slot="alert-title"]')).toHaveTextContent(
			locale === "ar-SA" ? "راجع المعلومات المستوردة" : "Review imported information",
		);
		expect(alert).toHaveTextContent(
			locale === "ar-SA"
				? "انتهت صلاحية مراجعة الاستيراد أو أنها غير متاحة على هذا الجهاز. اختر ملفك مجددًا."
				: "This import review has expired or is unavailable on this device. Choose your file again.",
		);
		expect(recovery).toBeEnabled();
		fireEvent.click(recovery);
		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard", replace: true }));
	},
);

it.each(["en-US", "ar-SA"] as const)(
	"gives cleanup errors a translated title and working recovery (%s)",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		mocks.remove.mockRejectedValueOnce(new Error("Local storage unavailable")).mockResolvedValueOnce(undefined);
		render(page());
		fireEvent.click(screen.getByRole("button", { name: "Finish review" }));
		const alert = await screen.findByRole("alert");
		expect(alert.querySelector('[data-slot="alert-title"]')).toHaveTextContent(
			locale === "ar-SA" ? "حدث خطأ ما" : "Something went wrong",
		);
		expect(alert).toHaveTextContent(
			locale === "ar-SA" ? "تعذر إغلاق هذه المراجعة. حاول مجددًا." : "Could not close this review. Try again.",
		);
		const recovery = within(alert).getByRole("button");
		expect(recovery).toBeEnabled();
		fireEvent.click(recovery);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: "/builder/$resumeId",
				params: { resumeId: "created-cv" },
				search: { mode: "write" },
				replace: true,
			}),
		);
	},
);
