// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SavedField } from "./saved-field";

beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
afterEach(cleanup);

it("clears superseded errors and announces saving, success and failure", async () => {
	let finish!: (message: string | null) => void;
	const save = vi.fn(
		() =>
			new Promise<string | null>((resolve) => {
				finish = resolve;
			}),
	);
	render(
		<I18nProvider i18n={i18n}>
			<SavedField
				label="Name"
				value="Before"
				validate={(value) => (value.length < 3 ? "Too short" : null)}
				save={save}
			/>
		</I18nProvider>,
	);
	const input = screen.getByRole("textbox", { name: "Name" });
	fireEvent.change(input, { target: { value: "x" } });
	fireEvent.blur(input);
	expect(screen.getByRole("alert").textContent).toBe("Too short");
	fireEvent.change(input, { target: { value: "After" } });
	expect(screen.queryByRole("alert")).toBeNull();
	fireEvent.blur(input);
	expect(screen.getByRole("status").textContent).toBe("Saving…");
	expect(input).toHaveProperty("disabled", true);
	finish(null);
	await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Saved"));
	fireEvent.change(input, { target: { value: "Another" } });
	fireEvent.blur(input);
	finish("Couldn't save. Try again.");
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't save. Try again."));
});

it("keeps the host and identifier in one LTR group under RTL", () => {
	render(
		<I18nProvider i18n={i18n}>
			<div dir="rtl">
				<SavedField
					label="Username"
					value="example"
					prefix="localhost/"
					validate={() => null}
					save={async () => null}
				/>
			</div>
		</I18nProvider>,
	);
	expect(screen.getByRole("textbox").closest('[data-slot="input-group"]')?.getAttribute("dir")).toBe("ltr");
});
