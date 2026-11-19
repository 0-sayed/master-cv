import type { DocumentSummary } from "./filter";
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { DocumentCard, DocumentRow } from "./document-card";
import { getUiLocaleMessages } from "@/libs/locale";
const actions = vi.hoisted(() => ({ restore: vi.fn(), purge: vi.fn() }));
const rendering = vi.hoisted(() => ({
	pdf: vi.fn(() => {
		throw new Error("Library PDF rendering forbidden");
	}),
	raster: vi.fn(() => {
		throw new Error("Library rasterization forbidden");
	}),
}));
vi.mock("@/features/resume/export/pdf-document", () => ({ createResumePdfBlob: rendering.pdf }));
vi.mock("@/features/resume/preview/pdf-thumbnail", () => ({ createPdfFirstPageImageUrl: rendering.raster }));
vi.mock("./document-actions", () => ({ useDocumentActions: () => actions, DocumentMenuContent: () => null }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({
		children,
		to,
		params: _params,
		...props
	}: import("react").ComponentProps<"a"> & { to: string; params: unknown }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
const item: DocumentSummary = {
	id: "cv",
	type: "resume",
	name: "Synthetic CV",
	tags: [],
	trashedAt: new Date(),
	application: null,
	isLocked: false,
	isPublic: false,
	slug: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	metadata: { template: "onyx", locale: "en-US", accent: defaultResumeData.metadata.design.colors.primary },
	letterStatus: null,
};
function show(days = 30, trashed = true) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<table>
				<tbody>
					<DocumentRow
						document={{ ...item, trashedAt: trashed ? new Date(Date.now() - (30 - days) * 86400000) : null }}
						onTags={vi.fn()}
						onLink={vi.fn()}
					/>
				</tbody>
			</table>
		</I18nProvider>,
	);
}
it("makes both trash actions discoverable without hover or a menu", async () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "Restore" }));
	expect(actions.restore).toHaveBeenCalledWith(expect.objectContaining({ id: "cv" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "Delete forever" })).toBeEnabled());
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
	});
	expect(actions.purge).toHaveBeenCalledWith(expect.objectContaining({ id: "cv" }));
	expect(screen.queryByText("—")).not.toBeInTheDocument();
});
it("labels remaining retention once without numeric overlap", () => {
	show(2);
	expect(screen.getByText("Deletes in 2 days")).toBeVisible();
});
it("keeps active documents linked to the editor with their ordinary options menu", () => {
	show(30, false);
	expect(screen.getByRole("link", { name: "Synthetic CV" })).toHaveAttribute("href", "/builder/$resumeId");
	expect(screen.getByRole("button", { name: "More actions" })).toBeVisible();
	expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "Delete forever" })).not.toBeInTheDocument();
});

// These literal expectations cover Arabic dual, few and many rather than interpolating a bare noun.
it.each([
	[1, "يوم واحد حتى الحذف"],
	[2, "يومان حتى الحذف"],
	[3, "3 أيام حتى الحذف"],
	[10, "10 أيام حتى الحذف"],
	[11, "11 يومًا حتى الحذف"],
	[30, "30 يومًا حتى الحذف"],
])("inflects Arabic retention at %s days", async (days, label) => {
	show(Number(days));
	await act(async () => i18n.loadAndActivate(await getUiLocaleMessages("ar-SA")));
	expect(screen.getByText(String(label), { exact: true })).toBeVisible();
});

it("identifies an active CV with the shared accessible type marker", () => {
	show(30, false);
	expect(screen.getAllByLabelText("CV", { selector: '[data-slot="document-type"]' })).toHaveLength(1);
});

it.each(["ar-SA", "en-US"] as const)(
	"%s: uses compact saved identity without rendering or translating document content",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const name = "سيرة عربية · English product operations title that remains complete and accessible";
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<DocumentCard library document={{ ...item, name, trashedAt: null }} onTags={vi.fn()} onLink={vi.fn()} />
			</I18nProvider>,
		);
		const link = screen.getByRole("link", { name });
		expect(link).toHaveAttribute("href", "/builder/$resumeId");
		expect(link).toHaveAttribute("dir", "auto");
		expect(screen.queryByText("Onyx")).not.toBeInTheDocument();
		expect(container.querySelector('[data-slot="document-template"]')).toBeNull();
		expect(container.querySelector('[aria-hidden="true"] [data-slot="icon"]')).toBeInTheDocument();
		expect(screen.getByText("English")).toBeVisible();
		expect(container.querySelectorAll("img, canvas")).toHaveLength(0);
		expect(container.querySelectorAll('[data-slot="document-type"]')).toHaveLength(0);
		expect(screen.queryByText(/Open document|pages/)).not.toBeInTheDocument();
		const menu = screen.getByRole("button", { name: "More actions" });
		expect(menu).toHaveAttribute("data-size", "icon-sm");
		expect(link.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		fireEvent.focus(link);
		expect(await screen.findByRole("tooltip")).toHaveTextContent(name);
		expect(rendering.pdf).not.toHaveBeenCalled();
		expect(rendering.raster).not.toHaveBeenCalled();
	},
);

it("selects through the stretched link without navigating or swallowing the checkbox", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const select = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<DocumentCard
				library
				selecting
				document={{ ...item, trashedAt: null }}
				onSelectedChange={select}
				onTags={vi.fn()}
				onLink={vi.fn()}
			/>
		</I18nProvider>,
	);
	expect(fireEvent.click(screen.getByRole("link", { name: item.name }))).toBe(false);
	expect(select).toHaveBeenCalledWith(true);
	select.mockClear();
	fireEvent.click(screen.getByRole("checkbox"));
	expect(select).toHaveBeenCalledOnce();
});

it("keeps unavailable identity neutral and shows both saved company and role", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<DocumentCard
				library
				document={{
					...item,
					trashedAt: null,
					metadata: null,
					application: { id: "job", company: "شركة", role: "Engineer", status: "saved" },
				}}
				onTags={vi.fn()}
				onLink={vi.fn()}
			/>
		</I18nProvider>,
	);
	expect(screen.queryByText("Onyx")).not.toBeInTheDocument();
	expect(screen.queryByText("English")).not.toBeInTheDocument();
	expect(screen.getByText("Engineer · شركة")).toHaveAttribute("dir", "auto");
});

it.each([true, false])("shows the Type cell only when requested (%s) and preserves mobile details", (showType) => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<table>
				<tbody>
					<DocumentRow
						showType={showType}
						document={{
							...item,
							trashedAt: null,
							type: "letter",
							letterStatus: "sent",
							application: { id: "job", role: "Engineer", company: "شركة", status: "interview" },
						}}
						onTags={vi.fn()}
						onLink={vi.fn()}
					/>
				</tbody>
			</table>
		</I18nProvider>,
	);
	expect(container.querySelectorAll('[data-slot="document-type"]')).toHaveLength(showType ? 1 : 0);
	expect(screen.getByText("English")).toBeInTheDocument();
	expect(screen.getByText("Sent")).toBeInTheDocument();
	expect(screen.getAllByText("Engineer · شركة").length).toBeGreaterThan(0);
	expect(screen.getAllByText("Interview").length).toBeGreaterThan(0);
});
