// @vitest-environment happy-dom
import type { Application } from "../../types";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ resume: vi.fn(), letter: vi.fn(), docs: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { getVersion: api.resume }, coverLetters: { getVersion: api.letter } },
	orpc: { documents: { list: { queryOptions: () => ({ queryKey: ["docs"], queryFn: api.docs }) } } },
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		params,
		search,
		children,
		className,
	}: {
		to: string;
		params: Record<string, string>;
		search: { version?: string };
		children: ReactNode;
		className?: string;
	}) => (
		<a
			className={className}
			href={`${to.replace(/\$\w+/, () => {
				const id = Object.values(params)[0];
				if (!id) throw new Error("MISSING_LINK_PARAMETER");
				return id;
			})}${search?.version ? `?version=${search.version}` : ""}`}
		>
			{children}
		</a>
	),
}));
vi.mock("./document-manager", () => ({
	DocumentManager: ({ open }: { open: boolean }) => (open ? <div role="dialog">Manager</div> : null),
}));
const { SentDocuments } = await import("./sent-documents");
const application = {
	id: "a",
	status: "applied",
	resumeId: "r",
	coverLetterId: "l",
	sentResumeVersionId: "sent-r",
	sentCoverLetterVersionId: "sent-l",
	sentResumeRecordedAt: null,
	appliedAt: new Date("2030-01-01"),
} as unknown as Application;
function show(value = application) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	api.docs.mockResolvedValue([
		{ id: "r", type: "resume", name: "Current changed CV" },
		{ id: "l", type: "letter", name: "Current changed letter" },
	]);
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
				<SentDocuments application={value} disabled={false} />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
it("opens exact sent snapshots and uses creation dates after reopening", async () => {
	api.resume.mockResolvedValue({
		id: "sent-r",
		name: "Full original CV version name",
		createdAt: new Date("2026-11-01"),
		data: {},
	});
	api.letter.mockResolvedValue({
		id: "sent-l",
		name: "Sent letter version",
		createdAt: new Date("2026-11-02"),
		data: { name: "Full original letter name" },
	});
	show();
	await screen.findByText("Full original CV version name");
	expect(screen.getByText("Full original letter name")).toBeTruthy();
	expect(screen.getAllByRole("link", { name: "Open sent version" }).map((link) => link.getAttribute("href"))).toEqual([
		"/builder/r?version=sent-r",
		"/builder/letter/l?version=sent-l",
	]);
	expect(screen.queryByText("sent-r")).toBeNull();
	expect(screen.queryByText("sent-l")).toBeNull();
	expect(screen.getAllByText("Sent")).toHaveLength(2);
	for (const link of screen.getAllByRole("link", { name: "Open sent version" })) {
		expect(link).toHaveClass("border-line-2", "bg-surface");
		expect(link.closest("article")?.querySelector(".document-icon-tile")).toBeTruthy();
	}
	for (const status of screen.getAllByText("Sent")) expect(status).toHaveClass("bg-accent-soft", "text-accent-text");
	expect(screen.getByText("Nov 1, 2026")).toBeTruthy();
	expect(screen.queryByText(/2030/)).toBeNull();
	expect(api.resume).toHaveBeenCalledWith({ resumeId: "r", versionId: "sent-r" });
	fireEvent.click(screen.getByRole("button", { name: "Manage documents" }));
	expect(screen.getByRole("dialog")).toBeTruthy();
});
it("distinguishes current links and attachments from sent snapshots", async () => {
	show({
		...application,
		sentResumeVersionId: null,
		sentCoverLetterVersionId: null,
		resumeFileUrl: "/private.pdf",
		resumeFileName: "Uploaded.pdf",
	});
	await screen.findByText("Current changed CV");
	expect(screen.getAllByText("Linked, not recorded as sent")).toHaveLength(3);
	expect(screen.queryByRole("link", { name: "Open sent version" })).toBeNull();
	expect(screen.getByRole("link", { name: "Uploaded.pdf" })).toHaveAttribute("href", "/private.pdf");
});
it("keeps missing snapshot recovery distinct without a latest-version link", async () => {
	api.resume.mockRejectedValue(new Error("NOT_FOUND"));
	api.letter.mockResolvedValue({ id: "sent-l", name: "Sent letter", createdAt: new Date("2026-11-02"), data: {} });
	show();
	await screen.findByRole("alert");
	expect(screen.queryByRole("link", { name: "Open current CV" })).toBeNull();
	api.resume.mockResolvedValue({ id: "sent-r", name: "Recovered CV", createdAt: new Date("2026-11-01"), data: {} });
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(screen.getByText("Recovered CV")).toBeTruthy());
});

it("announces metadata loading and does not invent a missing sent date", async () => {
	let accept!: (value: object) => void;
	api.resume.mockReturnValue(
		new Promise((resolve) => {
			accept = resolve;
		}),
	);
	api.letter.mockResolvedValue({ name: "Letter", data: {}, createdAt: null });
	show();
	expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
	accept({ name: "CV without date", createdAt: null });
	await screen.findByText("CV without date");
	expect(screen.getAllByText("Sent date not recorded")).toHaveLength(2);
});
