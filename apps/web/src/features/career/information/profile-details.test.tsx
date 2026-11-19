// @vitest-environment happy-dom
import type { CareerMaster } from "@reactive-resume/schema/career-master";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CareerProfileDetails } from "./profile-details";

const saveDetails = vi.hoisted(() => vi.fn());
vi.mock("@/libs/orpc/client", () => ({
	client: { career: { master: { saveDetails } } },
	orpc: { career: { master: { read: { key: () => ["career"] } } } },
}));
afterEach(() => {
	cleanup();
	saveDetails.mockReset();
});
it("retains the draft revision after a refresh and locks the pending draft", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	let finish!: () => void;
	saveDetails.mockImplementation(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const master = {
		contact: { name: "Old", email: "", phone: "", location: "" },
		summary: "",
		profileRevision: 1,
	} as CareerMaster;
	const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const view = (value: CareerMaster) => (
		<QueryClientProvider client={cache}>
			<I18nProvider i18n={i18n}>
				<CareerProfileDetails master={value} />
			</I18nProvider>
		</QueryClientProvider>
	);
	const result = render(view(master));
	await userEvent.click(screen.getByRole("button", { name: "Edit" }));
	await userEvent.type(screen.getByLabelText("Name"), " draft");
	result.rerender(
		view({ ...master, profileRevision: 2, contact: { name: "Newer", email: "", phone: "", location: "" } }),
	);
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() =>
		expect(saveDetails).toHaveBeenCalledWith(
			expect.objectContaining({ expectedProfileRevision: 1, contact: expect.objectContaining({ name: "Old draft" }) }),
		),
	);
	expect(screen.getByLabelText("Name")).toBeDisabled();
	expect(screen.getByLabelText("Summary")).toBeDisabled();
	expect(screen.getByRole("button", { name: "Edit" })).toBeDisabled();
	const form = screen.getByLabelText("Name").closest("form");
	if (!form) throw new Error("Expected a profile form");
	fireEvent.submit(form);
	expect(saveDetails).toHaveBeenCalledTimes(1);
	await act(() => finish());
	await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).toBeNull());
});
