import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Kbd } from "./kbd";

afterEach(() => vi.unstubAllGlobals());

it.each([
	["MacIntel", "Mod+K", "⌘K"],
	["Win32", "Mod+K", "Ctrl K"],
	["Linux x86_64", "Mod+Shift+S", "Ctrl Shift S"],
	["MacIntel", "Mod+Shift+S", "⌘⇧S"],
	["MacIntel", "Alt+ArrowUp/ArrowDown", "⌥ + ↑/↓"],
	["Win32", "Alt+ArrowUp/ArrowDown", "Alt + ↑/↓"],
])("formats %s %s as an isolated shortcut", (platform, keys, label) => {
	vi.stubGlobal("navigator", { platform, userAgent: platform });
	render(<Kbd keys={keys} aria-label="Shortcut" />);
	const shortcut = screen.getByLabelText("Shortcut");
	expect(shortcut).toHaveTextContent(label);
	expect(shortcut).toHaveAttribute("dir", "ltr");
});
