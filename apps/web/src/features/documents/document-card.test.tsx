import type { DocumentSummary } from "./filter";
// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { DocumentRow } from "./document-card";
import { getUiLocaleMessages } from "@/libs/locale";
const actions = vi.hoisted(() => ({ restore: vi.fn(), purge: vi.fn() }));
vi.mock("./document-actions", () => ({ useDocumentActions: () => actions, DocumentMenuContent: () => null }));
vi.mock("./resume-thumbnail", () => ({ ResumeThumbnail: () => null }));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({ children, to }: { children: import("react").ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
const item = {
	id: "cv",
	type: "resume",
	name: "Synthetic CV",
	tags: [],
	trashedAt: new Date(),
	application: null,
	isPublic: false,
	updatedAt: new Date(),
} as unknown as DocumentSummary;
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
	expect(screen.getByRole("button", { name: "Options for Synthetic CV" })).toBeVisible();
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
