// @vitest-environment happy-dom

import type { Application } from "../../types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const update = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/utils/file", () => ({ downloadWithAnchor: download }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { applications: { update: { mutationOptions: () => ({ mutationFn: update }) } } },
}));
vi.mock("../../use-application-actions", () => ({ useInvalidateApplications: () => vi.fn() }));

const { NextStepCard } = await import("./next-step-card");
afterEach(cleanup);

it("reopens a closed application without showing active follow-up actions", () => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	const reopen = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<NextStepCard
					application={
						{ id: "closed", status: "closed", activity: [], followUpAt: new Date() } as unknown as Application
					}
					onReopen={reopen}
					onScheduleInterview={vi.fn()}
				/>
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Reopen" }));
	expect(reopen).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole("button", { name: "Set follow-up" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Add to calendar" })).toBeNull();
});

it("shows an actionable compact empty row with an H2 and no calendar", () => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	const application = {
		id: "a",
		status: "saved",
		activity: [],
		appliedAt: new Date(),
		followUpAt: null,
	} as unknown as Application;
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<NextStepCard application={application} onReopen={vi.fn()} onScheduleInterview={vi.fn()} />
			</QueryClientProvider>
		</I18nProvider>,
	);
	expect(screen.getByRole("heading", { level: 2, name: "Next step" })).toBeTruthy();
	expect(screen.getByText("Choose your next step")).toBeTruthy();
	expect(screen.getByText("Choose your next step").parentElement).toHaveClass("basis-full", "sm:basis-0");
	expect(screen.getByRole("button", { name: "Set follow-up" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Schedule interview" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Add to calendar" })).toBeNull();
});

it("opens the follow-up with its saved date and note, then saves the edited note", async () => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	const application = {
		id: "application-1",
		role: "Engineer",
		company: "Orbital",
		status: "applied",
		activity: [],
		updatedAt: new Date("2026-11-16T08:00:00.000Z"),
		followUpAt: new Date(2026, 9, 15, 9),
		followUpNote: "Ask the recruiter",
	} as unknown as Application;
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<NextStepCard application={application} onReopen={vi.fn()} onScheduleInterview={vi.fn()} />
			</QueryClientProvider>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Edit" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Change the follow-up…" }));
	expect((screen.getByLabelText(/Date/) as HTMLInputElement).value).toBe("10/15/2026");
	expect((screen.getByLabelText("What to do") as HTMLInputElement).value).toBe("Ask the recruiter");
	fireEvent.change(screen.getByLabelText("What to do"), { target: { value: "Email the recruiter" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() =>
		expect(update).toHaveBeenCalledWith(
			{
				id: application.id,
				expectedUpdatedAt: application.updatedAt.toISOString(),
				followUpAt: application.followUpAt,
				followUpNote: "Email the recruiter",
			},
			expect.anything(),
		),
	);
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	fireEvent.click(screen.getByRole("button", { name: "Edit" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Change the follow-up…" }));
	fireEvent.click(screen.getByRole("button", { name: "Clear" }));
	await waitFor(() =>
		expect(update).toHaveBeenCalledWith(
			expect.objectContaining({ id: application.id, followUpAt: null, followUpNote: null }),
			expect.anything(),
		),
	);
});
it("uses the saved interview zone and downloads its real calendar event", async () => {
	i18n.loadAndActivate({ locale: "en", messages: {} });
	const entry = {
		id: "interview-1",
		type: "interview",
		at: new Date("2099-11-18T09:00:00Z"),
		timezone: "Asia/Riyadh",
		kind: "technical",
		durationMinutes: 45,
		location: "Office",
		notes: "Saved notes",
		participants: [],
	};
	const schedule = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<NextStepCard
					application={
						{
							id: "a",
							role: "Engineer",
							company: "Synthetic",
							status: "interview",
							activity: [entry],
							followUpAt: null,
						} as unknown as Application
					}
					onReopen={vi.fn()}
					onScheduleInterview={schedule}
				/>
			</QueryClientProvider>
		</I18nProvider>,
	);
	expect(screen.getByText(/Asia\/Riyadh/)).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Interview details" }));
	expect(schedule).toHaveBeenCalledWith(entry);
	fireEvent.click(screen.getByRole("button", { name: "Add to calendar" }));
	expect(download).toHaveBeenCalledTimes(1);
	const blob = download.mock.calls.at(0)?.[0];
	assert(blob instanceof Blob);
	const ics = await blob.text();
	expect(ics).toContain("DTSTART:20991118T090000Z");
	expect(ics).toContain("DTEND:20991118T094500Z");
	expect(ics).toContain("Saved notes");
});
