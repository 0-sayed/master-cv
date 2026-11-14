// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TermDialog } from "./term-dialog";
vi.mock("../editor/proposals/review-operation", () => ({
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
afterEach(cleanup);
it("keeps source visible, rejects empty/markup terms and does not save on Cancel", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const save = vi.fn();
	const cancel = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<TermDialog
				term={{
					id: "term-school",
					sourceRevision: "v1",
					target: { sectionId: "education", itemId: "school", field: "school" },
					source: "جامعة عربية",
					value: "جامعة عربية",
					status: "pending",
					author: "source",
				}}
				pending={false}
				error={false}
				onCancel={cancel}
				onConfirm={save}
			/>
		</I18nProvider>,
	);
	expect(screen.getByText("جامعة عربية")).toBeDefined();
	const input = screen.getByLabelText("Reviewed term");
	fireEvent.change(input, { target: { value: "" } });
	expect(screen.getByRole("button", { name: "Confirm term" }).hasAttribute("disabled")).toBe(true);
	fireEvent.change(input, { target: { value: "<b>Name</b>" } });
	expect(screen.getByRole("button", { name: "Confirm term" }).hasAttribute("disabled")).toBe(true);
	fireEvent.change(input, { target: { value: "Official University" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm term" }));
	expect(save).toHaveBeenCalledWith("Official University");
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancel).toHaveBeenCalledOnce();
});
