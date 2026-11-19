// @vitest-environment happy-dom
import type { Application } from "../../types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn(), open: vi.fn(), navigate: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		documents: {
			list: {
				queryOptions: () => ({
					queryKey: ["docs"],
					queryFn: async () => [
						{ id: "r", type: "resume", name: "My CV" },
						{ id: "l", type: "letter", name: "My letter" },
					],
				}),
			},
		},
		applications: { update: { mutationOptions: () => ({ mutationFn: api.update }) } },
		coverLetters: { create: { mutationOptions: () => ({ mutationFn: api.create }) } },
	},
}));
vi.mock("../../use-application-actions", () => ({ useInvalidateApplications: () => vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => api.navigate }));
vi.mock("@/dialogs/store", () => ({ useDialogStore: () => api.open }));
vi.mock("../resume-version-select", () => ({
	ResumeVersionSelect: ({
		value,
		disabled,
		onChange,
	}: {
		value: string | null;
		disabled: boolean;
		onChange: (value: string) => void;
	}) => (
		<select aria-label="CV version" disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
			<option value="">Current</option>
			<option value="old">Saved version</option>
		</select>
	),
}));
const { DocumentManager } = await import("./document-manager");
const application = {
	id: "a",
	resumeId: null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	updatedAt: new Date("2026-11-18"),
} as unknown as Application;
const close = vi.fn();
function show(value = application) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
				<DocumentManager application={value} disabled={false} open onOpenChange={close} />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
it("stages associations and keeps them after a failed guarded save", async () => {
	api.update.mockRejectedValueOnce(new Error("CONFLICT")).mockResolvedValue({});
	show();
	await screen.findByRole("option", { name: "My CV" });
	fireEvent.change(screen.getByRole("combobox", { name: "CV" }), { target: { value: "r" } });
	fireEvent.change(screen.getByRole("combobox", { name: "CV version" }), { target: { value: "old" } });
	expect(api.update).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await screen.findByRole("alert");
	expect(screen.getByRole("combobox", { name: "CV version" })).toHaveValue("old");
	expect(close).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(close).toHaveBeenCalledWith(false));
	expect(api.update.mock.calls.at(0)?.[0]).toMatchObject({
		id: "a",
		expectedUpdatedAt: application.updatedAt.toISOString(),
		resumeId: "r",
		selectedResumeVersionId: "old",
	});
});
it("locks sent associations and retains document creation and attachments", async () => {
	show({ ...application, resumeId: "r", sentResumeVersionId: "sent" });
	expect(screen.getByRole("combobox", { name: "CV" })).toBeDisabled();
	expect(screen.getByRole("combobox", { name: "CV version" })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Attach a resume file (PDF)" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Write a letter" })).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(api.update).not.toHaveBeenCalled();
});

it("uploads only on Save and prevents duplicate pending submissions", async () => {
	let accept!: (value: object) => void;
	api.update.mockReturnValue(
		new Promise((resolve) => {
			accept = resolve;
		}),
	);
	show();
	await screen.findByRole("option", { name: "My CV" });
	const file = new File(["synthetic"], "Private.pdf", { type: "application/pdf" });
	const input = document.querySelector('input[type="file"]');
	assert(input);
	fireEvent.change(input, { target: { files: [file] } });
	expect(api.update).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
	expect(api.update.mock.calls.at(0)?.[0].resumeFile).toBe(file);
	accept({});
	await waitFor(() => expect(close).toHaveBeenCalledWith(false));
});

it("creates letters with the explicit document language and opens the acknowledged result", async () => {
	api.create.mockResolvedValue({ id: "new-letter" });
	show();
	fireEvent.click(screen.getByRole("button", { name: "Write a letter" }));
	await waitFor(() =>
		expect(api.navigate).toHaveBeenCalledWith({
			to: "/builder/letter/$coverLetterId",
			params: { coverLetterId: "new-letter" },
		}),
	);
	expect(api.create.mock.calls.at(0)?.[0]).toMatchObject({ applicationId: "a", documentLocale: "ar-SA" });
});
