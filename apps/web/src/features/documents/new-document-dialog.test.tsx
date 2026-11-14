// @vitest-environment happy-dom

import type { Application } from "@/features/applications/types";
import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { expect, it, vi, afterEach } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { NewDocumentDialog } from "./new-document-dialog";
import { applicationsListQueryKey } from "@/features/applications/queries";
import { orpc } from "@/libs/orpc/client";
const mutations = vi.hoisted(() => ({ copy: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({
	...(await original<typeof import("@tanstack/react-query")>()),
	useMutation: () => ({ mutateAsync: mutations.copy, isPending: false }),
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mutations.navigate,
	useRouteContext: () => ({ session: { user: { id: "owner" } } }),
}));

it("explains a missing source resume and offers import or creation when copying directly from an application", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const queryClient = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY, retry: false } },
	});
	queryClient.setQueryData(orpc.documents.list.queryKey({ input: { trashed: false } }), []);
	queryClient.setQueryData(orpc.aiProviders.list.queryKey(), []);
	queryClient.setQueryData(applicationsListQueryKey(), [
		{ id: "application-1", company: "ABOUT YOU", status: "saved" } as Application,
	]);

	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<Dialog open>
					<NewDocumentDialog data={{ step: "copy", applicationId: "application-1" }} />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);

	expect(screen.getByText(/You don't have a resume to copy yet/)).toBeVisible();
	expect(screen.getByRole("button", { name: "Create and open" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Import or create a resume" }));
	expect(screen.getByRole("heading", { name: "How would you like to start?" })).toBeVisible();
	expect(screen.getByRole("button", { name: /^Upload an existing CV/ })).toBeEnabled();
	expect(screen.getByRole("button", { name: /^Write from scratch/ })).toBeEnabled();
});

it("keeps the selected job and copy name inline after a quota denial", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
	queryClient.setQueryData(orpc.documents.list.queryKey({ input: { trashed: false } }), [
		{
			id: "source",
			name: "Synthetic CV",
			type: "resume",
			tags: [],
			isLocked: false,
			isPublic: false,
			slug: null,
			trashedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			application: null,
		},
	]);
	queryClient.setQueryData(orpc.aiProviders.list.queryKey(), []);
	queryClient.setQueryData(applicationsListQueryKey(), [
		{ id: "job", company: "Synthetic Company", status: "saved" } as Application,
	]);
	mutations.copy.mockRejectedValue({ code: "PRECONDITION_FAILED", data: { reason: "JOB_COPY_LIMIT" } });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<Dialog open>
					<NewDocumentDialog data={{ step: "copy", sourceResumeId: "source", applicationId: "job" }} />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.change(screen.getByLabelText("Name", { exact: true }), {
		target: { value: "Keep this unsaved copy name" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Create and open" }));
	await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("job copy"));
	expect(screen.getByLabelText("Name", { exact: true })).toHaveValue("Keep this unsaved copy name");
	expect(screen.getByRole("button", { name: "Synthetic Company" })).toHaveAttribute("aria-pressed", "true");
});

it("continues to the exact-job workflow without creating a copy or opening an assistant", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
	queryClient.setQueryData(orpc.documents.list.queryKey({ input: { trashed: false } }), [
		{
			id: "source",
			name: "Synthetic CV",
			type: "resume",
			tags: [],
			isLocked: false,
			isPublic: false,
			slug: null,
			trashedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			application: null,
		},
	]);
	queryClient.setQueryData(orpc.aiProviders.list.queryKey(), []);
	queryClient.setQueryData(applicationsListQueryKey(), [
		{ id: "job", company: "Synthetic Company", status: "saved" } as Application,
	]);
	mutations.copy.mockRejectedValue({ code: "PRECONDITION_FAILED", data: { reason: "JOB_COPY_LIMIT" } });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<Dialog open>
					<NewDocumentDialog data={{ step: "copy", sourceResumeId: "source" }} />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Continue" }));
	expect(mutations.navigate).toHaveBeenCalledWith({
		to: "/dashboard/resumes/$resumeId/job",
		params: { resumeId: "source" },
	});
	expect(mutations.copy).not.toHaveBeenCalled();
});
