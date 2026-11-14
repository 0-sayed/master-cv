// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { JobTargetForm } from "./job-target-page";
afterEach(cleanup);
it("requires a role and exact ad, submits unchanged whitespace, and cancels without saving", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const compare = vi.fn();
	const cancel = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<JobTargetForm sourceName="Synthetic CV" initial={null} pending={false} onCompare={compare} onCancel={cancel} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Compare" }).hasAttribute("disabled")).toBe(true);
	fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Engineer" } });
	fireEvent.change(screen.getByLabelText("Job ad"), { target: { value: "  React\nArabic عربي  " } });
	fireEvent.click(screen.getByRole("button", { name: "Compare" }));
	expect(compare).toHaveBeenCalledWith({ role: "Engineer", employer: "", text: "  React\nArabic عربي  " });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancel).toHaveBeenCalledOnce();
});
