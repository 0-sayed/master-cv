import type { Application } from "../../types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// @vitest-environment happy-dom
import { messages as arabicMessages } from "../../../../../locales/ar-SA.po";
import { messages as englishMessages } from "../../../../../locales/en-US.po";
import { getStageColor } from "../../stages";
const update = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { applications: { update: { mutationOptions: () => ({ mutationFn: update }) } } },
}));
vi.mock("../../use-application-actions", () => ({ useInvalidateApplications: () => vi.fn() }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "desktop" }));
const { ApplicationProperties } = await import("./properties");
afterEach(() => {
	cleanup();
	update.mockReset().mockResolvedValue({});
});
const application = {
	id: "a",
	status: "applied",
	salary: "27000–33000 SAR / شهر",
	source: "مصدر Source",
	tags: ["عربي English"],
	contacts: [{ name: "اسم Name" }],
	appliedAt: new Date(),
	updatedAt: new Date("2026-11-18T00:00:00Z"),
} as unknown as Application;
function show(value = application, locale = "ar-SA", messages = {}) {
	i18n.loadAndActivate({ locale, messages });
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
				<ApplicationProperties application={value} />
			</QueryClientProvider>
		</I18nProvider>,
	);
}
it("isolates the original lower-to-upper SAR range in Arabic", () => {
	show();
	expect(screen.getByText("27000–33000").closest("[dir]")?.getAttribute("dir")).toBe("ltr");
	expect(screen.getByRole("img").getAttribute("aria-label")).toBeTruthy();
	expect(screen.getByText("Monthly").textContent).toBe("Monthly");
	for (const text of ["مصدر Source", "عربي English", "اسم Name"])
		expect(screen.getByText(text).closest("[dir]")?.getAttribute("dir")).toBe("auto");
});

it("presents typed properties in aligned rows with visible edit controls", () => {
	const { container } = show();
	expect(container.querySelectorAll('[data-slot="property-row"]')).toHaveLength(6);
	const stage = screen.getByText("Applied", { selector: '[data-slot="badge"]' });
	expect(stage.style.getPropertyValue("--stage-color")).toBe(getStageColor("applied"));
	expect(screen.getByText("مصدر Source").closest('[data-slot="badge"]')).toBeTruthy();
	expect(
		screen.getByText("اسم Name").closest("button")?.querySelector('[data-slot="avatar-fallback"]')?.textContent,
	).toBe("ا N");
	expect(screen.getByRole("button", { name: "Edit tags" })).toHaveAttribute("data-variant", "secondary");
});
it("retains an edited salary after failure and sends its revision", async () => {
	update.mockRejectedValueOnce(new Error("Conflict"));
	show();
	fireEvent.click(screen.getByRole("button", { name: /Salary/ }));
	fireEvent.change(screen.getByRole("textbox", { name: "Salary" }), { target: { value: "Negotiable + bonus" } });
	fireEvent.keyDown(screen.getByRole("textbox", { name: "Salary" }), { key: "Enter" });
	await screen.findByRole("alert");
	expect((screen.getByRole("textbox", { name: "Salary" }) as HTMLInputElement).value).toBe("Negotiable + bonus");
	expect(update.mock.calls.at(0)?.[0]).toEqual({
		id: "a",
		salary: "Negotiable + bonus",
		expectedUpdatedAt: application.updatedAt.toISOString(),
	});
});
it("edits tags in one dialog and prevents duplicate tags", async () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
	fireEvent.change(screen.getByRole("textbox", { name: "Add a tag" }), { target: { value: "عربي English" } });
	fireEvent.click(screen.getByRole("button", { name: "Add" }));
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(update.mock.calls.at(0)?.[0].tags).toEqual(["عربي English"]));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
	fireEvent.click(screen.getByRole("button", { name: "Remove عربي English" }));
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(update.mock.calls.at(-1)?.[0].tags).toEqual([]));
});

it("offers missing values and preserves contact add and remove", async () => {
	show({ ...application, salary: null, source: null, contacts: [] });
	expect(screen.getByText("Add salary")).toBeTruthy();
	expect(screen.getByText("Add source")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Contacts" }));
	fireEvent.click(await screen.findByRole("button", { name: "Add contact" }));
	fireEvent.change(screen.getByRole("textbox", { name: /Name/ }), { target: { value: "اسم Name" } });
	fireEvent.click(screen.getByRole("button", { name: "Add" }));
	await waitFor(() => expect(update.mock.calls.at(0)?.[0].contacts[0].name).toBe("اسم Name"));
});
it("removes a contact through the guarded property update", async () => {
	show();
	fireEvent.click(screen.getByRole("button", { name: "Contacts" }));
	fireEvent.click(await screen.findByRole("button", { name: /Remove/ }));
	await waitFor(() => expect(update.mock.calls.at(0)?.[0].contacts).toEqual([]));
});

it.each([
	["ar-SA", "month", "شهريًا"],
	["ar-SA", "year", "سنويًا"],
	["en-US", "شهر", "Monthly"],
	["en-US", "سنة", "Annually"],
])("localizes the %s salary period %s without changing its range", (locale, period, label) => {
	const messages = locale === "ar-SA" ? arabicMessages : englishMessages;
	show({ ...application, salary: `22000–28000 SAR / ${period}` }, locale, messages);
	const range = screen.getByText("22000–28000");
	expect(range.tagName).toBe("BDI");
	expect(range.getAttribute("dir")).toBe("ltr");
	const row = range.parentElement?.parentElement;
	expect(row?.textContent).toContain(`22000–28000${label}`);
	expect(screen.getByText(label)).toBeTruthy();
	expect(update).not.toHaveBeenCalled();
});
