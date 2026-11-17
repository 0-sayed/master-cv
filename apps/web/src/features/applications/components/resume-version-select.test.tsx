// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const api = vi.hoisted(() => ({ versions: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: { resume: { listVersions: api.versions } } }));
import { ResumeVersionSelect } from "./resume-version-select";
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});
function setup() {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const onChange = vi.fn();
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ResumeVersionSelect resumeId="cv" value="version-a" onChange={onChange} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	return onChange;
}
it("retains an exact saved version and offers a separate current-CV choice", async () => {
	api.versions.mockResolvedValue([
		{ id: "version-a", name: "Original", createdAt: new Date() },
		{ id: "version-b", name: "Later", createdAt: new Date() },
	]);
	const change = setup();
	await screen.findByRole("option", { name: "Original" });
	expect(screen.getByLabelText("CV version")).toHaveValue("version-a");
	fireEvent.change(screen.getByLabelText("CV version"), { target: { value: "version-b" } });
	expect(change).toHaveBeenLastCalledWith("version-b");
	fireEvent.change(screen.getByLabelText("CV version"), { target: { value: "" } });
	expect(change).toHaveBeenLastCalledWith(null);
});
it("preserves the selection after a failed load and offers a real retry", async () => {
	api.versions
		.mockRejectedValueOnce(new Error("offline"))
		.mockResolvedValueOnce([{ id: "version-a", name: "Original", createdAt: new Date() }]);
	const change = setup();
	await screen.findByRole("alert");
	expect(change).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(screen.getByLabelText("CV version")).toBeEnabled());
	expect(screen.getByLabelText("CV version")).toHaveValue("version-a");
});
