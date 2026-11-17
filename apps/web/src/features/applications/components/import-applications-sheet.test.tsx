// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getUiLocaleMessages } from "@/libs/locale";

const { messages: arabic } = await getUiLocaleMessages("ar-SA");

const mocks = vi.hoisted(() => ({ import: vi.fn(), invalidate: vi.fn() }));
vi.mock("../use-application-actions", () => ({ useInvalidateApplications: () => mocks.invalidate }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { applications: { import: { mutationOptions: () => ({ mutationFn: mocks.import }) } } },
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));

const { ImportApplicationsSheet } = await import("./import-applications-sheet");

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	mocks.import.mockResolvedValue({ imported: 1 });
});
afterEach(cleanup);

function renderSheet() {
	render(
		<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
			<I18nProvider i18n={i18n}>
				<ImportApplicationsSheet open onOpenChange={vi.fn()} />
			</I18nProvider>
		</QueryClientProvider>,
	);
}

async function paste(csv: string) {
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "Paste data instead" })));
	fireEvent.change(screen.getByLabelText("CSV data"), { target: { value: csv } });
}

async function next() {
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "Next" })));
}

it("starts with a keyboard-operable file choice, then maps and reviews before writing", async () => {
	renderSheet();
	expect(screen.getByRole("button", { name: "Drop a CSV file here or choose a file" })).toBeTruthy();
	expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
	expect(screen.queryByRole("textbox")).toBeNull();
	await next();
	expect(screen.getByRole("alert")).toHaveTextContent("Choose a CSV file");
	expect(screen.getByRole("button", { name: "Drop a CSV file here or choose a file" })).toHaveFocus();
	expect(mocks.import).not.toHaveBeenCalled();
	await paste("Employer,Position,Stage\nExample,Engineer,applied");
	expect(screen.getByLabelText("CSV data").getAttribute("rows")).toBe("8");
	await next();
	expect((screen.getByLabelText("Column Employer goes to") as HTMLSelectElement).value).toBe("company");
	expect(screen.getByRole("table", { name: "Match columns" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Import 1 application" })).toBeNull();
	await next();
	expect(screen.getByRole("table", { name: "Application preview" })).toBeTruthy();
	expect(mocks.import).not.toHaveBeenCalled();
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "Import 1 application" })));
	await waitFor(() =>
		expect(mocks.import).toHaveBeenCalledWith(
			{
				items: [{ company: "Example", role: "Engineer", status: "applied" }],
			},
			expect.anything(),
		),
	);
});

it("marks row errors and preserves the invalid-value block until mapping is corrected", async () => {
	renderSheet();
	await paste("Company,Role,Stage\nExample,Engineer,invalid-stage\nReady,Designer,applied\n,Missing company,applied");
	await next();
	await next();
	const preview = screen.getByRole("table", { name: "Application preview" });
	expect(within(preview).getByText(/Stage:.*is invalid/).textContent).toContain("is invalid.");
	expect(within(preview).getByText("Company and role are required.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Import 1 application" }).hasAttribute("disabled")).toBe(false);
	await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Match columns/ })));
	fireEvent.change(screen.getByLabelText("Column Stage goes to"), { target: { value: "" } });
	await next();
	expect(screen.getByRole("button", { name: "Import 2 applications" }).hasAttribute("disabled")).toBe(false);
});

it("rejects non-CSV drops and keeps the empty flow blocked", async () => {
	renderSheet();
	const dropZone = screen.getByRole("button", { name: "Drop a CSV file here or choose a file" });
	await act(async () =>
		fireEvent.drop(dropZone, {
			dataTransfer: { files: [new File(["not csv"], "notes.txt", { type: "text/plain" })] },
		}),
	);
	expect(screen.getByRole("alert").textContent).toContain("Choose a .csv file.");
	expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
});

it("loads a CSV file and requires unmatched required columns to be assigned", async () => {
	renderSheet();
	const file = new File(["Business,Job\nExample,Engineer"], "applications.csv", { type: "text/csv" });
	const input = screen.getByLabelText("Choose a CSV file");
	await act(async () => fireEvent.change(input, { target: { files: [file] } }));
	expect(await screen.findByText("Selected file: applications.csv")).toBeTruthy();
	await next();
	expect(screen.getByRole("button", { name: "Next" }).hasAttribute("disabled")).toBe(false);
	fireEvent.change(screen.getByLabelText("Column Business goes to"), { target: { value: "company" } });
	fireEvent.change(screen.getByLabelText("Column Job goes to"), { target: { value: "role" } });
	await next();
	expect(screen.getByRole("button", { name: "Import 1 application" }).hasAttribute("disabled")).toBe(false);
});

it("blocks invalid values beyond the first five preview rows", async () => {
	renderSheet();
	await paste(
		"Company,Role,Stage\n" +
			Array.from({ length: 5 }, () => "Example,Engineer,applied").join("\n") +
			"\nOther,Designer,invalid-stage",
	);
	await next();
	await next();
	expect(screen.getByRole("button", { name: "Import 5 applications" }).hasAttribute("disabled")).toBe(false);
	expect(screen.getByText(/Row 7, Stage:/).textContent).toContain("invalid-stage");
	expect(mocks.import).not.toHaveBeenCalled();
});

it("keeps the zero-count primary an action and explains why import is blocked separately", async () => {
	renderSheet();
	await paste("Company,Role\n,Engineer");
	await next();
	await next();
	const primary = screen.getByRole("button", { name: "Import 0 applications" });
	expect(primary.hasAttribute("disabled")).toBe(false);
	await act(async () => fireEvent.click(primary));
	expect(document.getElementById(primary.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
		"Each application needs a company and role.",
	);
	expect(screen.queryByText("No applications to import")).toBeNull();
});

it("renders the CSV flow in Arabic through review without saving", async () => {
	i18n.loadAndActivate({ locale: "ar-SA", locales: "ar-SA-u-nu-latn", messages: arabic });
	renderSheet();
	expect(screen.getByRole("button", { name: "أفلت ملف CSV هنا أو اختر ملفًا" })).toBeDefined();
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "لصق البيانات بدلًا من ذلك" })));
	expect(screen.getByPlaceholderText("الشركة,الوظيفة,المرحلة,…")).toBeDefined();
	fireEvent.change(screen.getByLabelText("بيانات CSV"), {
		target: { value: "Company,Role\nExample,Engineer" },
	});
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "التالي" })));
	expect(screen.getByRole("table", { name: "مطابقة الأعمدة" })).toBeDefined();
	await act(async () => fireEvent.click(screen.getByRole("button", { name: "التالي" })));
	expect(screen.getByRole("table", { name: "معاينة الطلبات" })).toBeDefined();
	expect(screen.getByRole("button", { name: "استيراد طلب واحد" })).toBeDefined();
	expect(screen.getByText("معاينة أول 5 صفوف. تُفحص جميع الصفوف قبل الاستيراد.")).toBeDefined();
	expect(mocks.import).not.toHaveBeenCalled();
});
