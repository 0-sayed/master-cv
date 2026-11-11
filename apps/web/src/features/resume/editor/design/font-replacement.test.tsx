// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { FontReplacementNotice } from "./font-replacement";

vi.mock("@/features/resume/preview/preview", () => ({
	ResumePreview: ({ data, onRender }: { data: typeof defaultResumeData; onRender: () => void }) => (
		<button onClick={onRender}>{data.metadata.typography.body.fontFamily} PDF ready</button>
	),
}));

it("keeps the existing font through preview/cancel and applies only an explicitly accepted rendered preview", () => {
	i18n.load("en-US", {});
	i18n.activate("en-US");
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "ar-SA";
	const before = structuredClone(data);
	const accept = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<FontReplacementNotice data={data} onAccept={accept} />
		</I18nProvider>,
	);
	expect(screen.getByText(/This font can't display/)).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
	expect((screen.getByRole("button", { name: "Use this font" }) as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(accept).not.toHaveBeenCalled();
	expect(data).toEqual(before);
	fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
	fireEvent.click(screen.getByRole("button", { name: "IBM Plex Sans Arabic PDF ready" }));
	fireEvent.click(screen.getByRole("button", { name: "Use this font" }));
	expect(accept).toHaveBeenCalledOnce();
	expect(accept.mock.calls[0]?.[0]).toBe(data);
	expect(accept.mock.calls[0]?.[1].metadata.typography.body.fontFamily).toBe("IBM Plex Sans Arabic");
	expect(data).toEqual(before);
});

it("rejects a preview when the document changes before acceptance", () => {
	i18n.load("en-US", {});
	i18n.activate("en-US");
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "ar-SA";
	const accept = vi.fn();
	const ui = (value: typeof data) => (
		<I18nProvider i18n={i18n}>
			<FontReplacementNotice data={value} onAccept={accept} />
		</I18nProvider>
	);
	const view = render(ui(data));
	fireEvent.click(screen.getByRole("button", { name: "Preview replacement" }));
	fireEvent.click(screen.getByRole("button", { name: "IBM Plex Sans Arabic PDF ready" }));
	view.rerender(ui({ ...data, basics: { ...data.basics, name: "Changed" } }));
	expect((screen.getByRole("button", { name: "Use this font" }) as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByText("The document changed. Close this preview and try again.")).toBeTruthy();
	expect(accept).not.toHaveBeenCalled();
});
