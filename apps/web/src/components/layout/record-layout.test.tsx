import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { useState } from "react";
const viewport = vi.hoisted(() => ({ value: "mobile" }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => viewport.value }));
const { RecordLayout } = await import("./record-layout");
afterEach(cleanup);

function Properties() {
	const [value, setValue] = useState("");
	return (
		<label>
			Properties
			<input value={value} onChange={(event) => setValue(event.target.value)} />
		</label>
	);
}

it("orders panels by breakpoint without losing a property draft", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const props = { main: <h2>Activity</h2>, properties: <Properties />, documents: <h2>Documents</h2> };
	const { container, rerender } = render(<RecordLayout {...props} />);
	expect(container.textContent).toBe("PropertiesDocumentsActivity");
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft العربية" } });
	viewport.value = "desktop";
	rerender(<RecordLayout {...props} />);
	expect(container.textContent).toBe("ActivityPropertiesDocuments");
	expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("draft العربية");
	expect(container.querySelectorAll("aside")).toHaveLength(1);
});
