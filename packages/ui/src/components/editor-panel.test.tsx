import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { useEffect } from "react";
import { clampEditorPanelWidth, EditorPanel, EditorPanelLayout } from "./editor-panel";

const key = (owner: string) => `sirawise:editor-panel-width:${owner}`;

it("owns the named width container without hiding or reordering panel content", () => {
	render(
		<EditorPanel>
			<label>
				Name
				<input />
			</label>
			<button type="button">Save</button>
		</EditorPanel>,
	);
	const panel = screen.getByRole("button", { name: "Save" }).closest("[data-slot=editor-panel]");
	expect(panel).toHaveClass("editor-panel-container");
	expect(Array.from(panel?.querySelectorAll("input, button") ?? [])).toEqual([
		screen.getByRole("textbox"),
		screen.getByRole("button"),
	]);
});
const layout = (ownerId = "alice", enabled = true, direction: "ltr" | "rtl" = "ltr") => (
	<DirectionProvider direction={direction}>
		<EditorPanelLayout ownerId={ownerId} enabled={enabled} label="CV editor">
			<div>Panel and preview</div>
		</EditorPanelLayout>
	</DirectionProvider>
);

beforeEach(() => {
	localStorage.clear();
	vi.stubGlobal("innerWidth", 1440);
	const computed = window.getComputedStyle.bind(window);
	vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
		const style = computed(element);
		if (element.getAttribute("role") === "separator") {
			return new Proxy(style, {
				get(target, property) {
					if (property === "insetInlineStart") return "520px";
					const value = Reflect.get(target, property, target);
					return typeof value === "function" ? value.bind(target) : value;
				},
			});
		}
		return style;
	});
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it("clamps to 360px and the 60% of the viewport while preserving a 480px preview", () => {
	expect(clampEditorPanelWidth(200, 1440)).toBe(360);
	expect(clampEditorPanelWidth(900, 1440)).toBe(864);
	expect(clampEditorPanelWidth(900, 1024)).toBe(544);
	expect(clampEditorPanelWidth(Number.NaN, 1440)).toBe(360);
});

it("restores only the current owner's preference and resets to the responsive default", () => {
	localStorage.setItem(key("alice"), "600");
	const { rerender } = render(layout());
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "600");
	rerender(layout("bob"));
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "520");
	fireEvent.keyDown(screen.getByRole("separator"), { key: "End" });
	expect(localStorage.getItem(key("bob"))).toBe("864");
	expect(localStorage.getItem(key("alice"))).toBe("600");
	fireEvent.doubleClick(screen.getByRole("separator"));
	expect(localStorage.getItem(key("bob"))).toBeNull();
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "520");
});

it.each(["ltr", "rtl"] as const)("supports physical arrow keys and Home/End in %s", (direction) => {
	render(layout("alice", true, direction));
	const handle = screen.getByRole("separator", { name: "CV editor" });
	expect(handle).toHaveAttribute("aria-orientation", "vertical");
	fireEvent.keyDown(handle, { key: direction === "rtl" ? "ArrowLeft" : "ArrowRight" });
	expect(handle).toHaveAttribute("aria-valuenow", "536");
	fireEvent.keyDown(handle, { key: direction === "rtl" ? "ArrowRight" : "ArrowLeft" });
	expect(handle).toHaveAttribute("aria-valuenow", "520");
	fireEvent.keyDown(handle, { key: "Home" });
	expect(handle).toHaveAttribute("aria-valuenow", "360");
	fireEvent.keyDown(handle, { key: "End" });
	expect(handle).toHaveAttribute("aria-valuenow", "864");
});

it("reclamps on viewport resize without losing the saved wide-screen preference", () => {
	localStorage.setItem(key("alice"), "864");
	render(layout());
	vi.stubGlobal("innerWidth", 1024);
	fireEvent.resize(window);
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuemax", "544");
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "544");
	expect(localStorage.getItem(key("alice"))).toBe("864");
	vi.stubGlobal("innerWidth", 1440);
	fireEvent.resize(window);
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "864");
});

it.each(["bad", "NaN", "Infinity", "-20", ""])("ignores malformed storage: %s", (value) => {
	localStorage.setItem(key("alice"), value);
	render(layout());
	expect(screen.getByRole("separator")).toHaveAttribute("aria-valuenow", "520");
});

it("continues resizing and resetting when storage access throws", () => {
	vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
		throw new Error("Blocked");
	});
	render(layout());
	const handle = screen.getByRole("separator");
	fireEvent.keyDown(handle, { key: "End" });
	expect(handle).toHaveAttribute("aria-valuenow", "864");
	fireEvent.doubleClick(handle);
	expect(handle).toHaveAttribute("aria-valuenow", "520");
});

it("leaves tablet/mobile sizing untouched and hides the resize handle", () => {
	localStorage.setItem(key("alice"), "864");
	const { container } = render(layout("alice", false));
	expect(screen.queryByRole("separator")).toBeNull();
	expect(
		container
			.querySelector<HTMLElement>("[data-slot=editor-panel-layout]")
			?.style.getPropertyValue("--editor-panel-choice"),
	).toBe("");
});

it.each(["ltr", "rtl"] as const)("coalesces pointer moves per frame without a first-drag jump in %s", (direction) => {
	let callback: FrameRequestCallback | undefined;
	const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((next) => {
		callback = next;
		return 1;
	});
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
	render(layout("alice", true, direction));
	const handle = screen.getByRole("separator");
	handle.setPointerCapture = vi.fn();
	handle.releasePointerCapture = vi.fn();
	fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 520 });
	fireEvent.pointerMove(handle, { pointerId: 1, clientX: direction === "rtl" ? 488 : 552 });
	fireEvent.pointerMove(handle, { pointerId: 1, clientX: direction === "rtl" ? 472 : 568 });
	expect(request).toHaveBeenCalledTimes(1);
	expect(handle).toHaveAttribute("aria-valuenow", "520");
	act(() => callback?.(0));
	expect(handle).toHaveAttribute("aria-valuenow", "568");
	fireEvent.pointerUp(handle, { pointerId: 1 });
	expect(localStorage.getItem(key("alice"))).toBe("568");
});

it("commits the final pending move on release and keeps the preview mounted", () => {
	const mounted = vi.fn();
	const unmounted = vi.fn();
	function Preview() {
		useEffect(() => {
			mounted();
			return unmounted;
		}, []);
		return <main>Preview</main>;
	}
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
	render(
		<EditorPanelLayout ownerId="alice" enabled label="CV editor">
			<Preview />
		</EditorPanelLayout>,
	);
	const handle = screen.getByRole("separator");
	handle.setPointerCapture = vi.fn();
	handle.releasePointerCapture = vi.fn();
	fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 520 });
	fireEvent.pointerMove(handle, { pointerId: 1, clientX: 588 });
	fireEvent.pointerUp(handle, { pointerId: 1 });
	expect(handle).toHaveAttribute("aria-valuenow", "588");
	expect(localStorage.getItem(key("alice"))).toBe("588");
	fireEvent.doubleClick(handle);
	expect(mounted).toHaveBeenCalledTimes(1);
	expect(unmounted).not.toHaveBeenCalled();
});

it("keeps an unfinished drag from writing to a different owner", () => {
	vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
	const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
	const { rerender } = render(layout());
	const handle = screen.getByRole("separator");
	handle.setPointerCapture = vi.fn();
	fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientX: 520 });
	fireEvent.pointerMove(handle, { pointerId: 1, clientX: 588 });
	rerender(layout("bob"));
	fireEvent.pointerUp(handle, { pointerId: 1 });
	expect(cancel).toHaveBeenCalledWith(1);
	expect(localStorage.getItem(key("bob"))).toBeNull();
	expect(localStorage.getItem(key("alice"))).toBeNull();
	expect(handle.parentElement).not.toHaveAttribute("data-resizing");
});
