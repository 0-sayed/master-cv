import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";
import { BrandIcon } from "./brand-icon";

afterEach(() => vi.unstubAllGlobals());
it("shows one accessible localized name and a hidden English subtitle only in the Arabic lockup", () => {
	const { container, rerender } = render(<BrandIcon locale="ar-SA" alt="Decorative mark" />);
	const name = container.querySelector('[data-slot="brand-name"]');
	expect(name).toHaveTextContent("سيراوايز");
	const secondary = container.querySelector('[data-slot="brand-secondary"]');
	expect(secondary).toHaveTextContent("SIRAWISE");
	expect(secondary).toHaveClass("text-accent-text", "type-wordmark", "uppercase");
	expect(secondary).toHaveAttribute("lang", "en");
	expect(secondary).toHaveAttribute("dir", "ltr");
	expect(secondary).toHaveAttribute("aria-hidden", "true");
	expect(container.querySelector('[data-slot="brand-wordmark"]')).toHaveAttribute("dir", "rtl");
	expect(container.querySelectorAll('img:not([alt=""])')).toHaveLength(0);
	rerender(<BrandIcon locale="en-US" />);
	expect(container.textContent).toBe("Sirawise");
	expect(container.querySelector('[data-slot="brand-name"]')).toHaveClass("type-section");
	expect(container.querySelector('[data-slot="brand-secondary"]')).toBeNull();
	rerender(<BrandIcon variant="icon" locale="ar-SA" />);
	expect(container.querySelector("img")?.alt).toBe("سيراوايز");
	expect(container.querySelector('[data-slot="brand-wordmark"]')).toBeNull();
	rerender(<BrandIcon variant="icon" locale="en-US" alt="" />);
	expect(container.querySelector("img")?.alt).toBe("");
});
it("uses exactly the approved filled contours under reveal masks", async () => {
	const { readFile } = await import("node:fs/promises");
	const { container } = render(<BrandIcon />);
	for (const theme of ["light", "dark"]) {
		const asset = await readFile(`../../apps/web/public/master-cv/${theme}.svg`, "utf8");
		for (const [id, selector] of [
			["C", ".brand-curve"],
			["Tick", ".brand-tick"],
		]) {
			const approved = asset.match(new RegExp(`id="${id}" d="([^"]+)"`))?.[1];
			expect(approved).toBeTruthy();
			expect(container.querySelector(selector ?? "")?.getAttribute("d")).toBe(approved);
		}
	}
});
it("plays on the whole logo link, locks retriggers, and restores the approved mark", () => {
	const { container } = render(
		<a href="/">
			<BrandIcon />
		</a>,
	);
	const link = container.querySelector("a");
	const mark = container.querySelector('[data-slot="brand-mark"]');
	assert(link && mark);
	fireEvent.pointerEnter(link);
	expect(mark).toHaveAttribute("data-playing", "true");
	const svg = mark.querySelector("svg");
	assert(svg);
	fireEvent.pointerEnter(link);
	expect(mark.querySelector("svg")).toBe(svg);
	fireEvent.animationEnd(svg, { animationName: "brand-approved" });
	expect(mark).toHaveAttribute("data-playing", "false");
	fireEvent.focus(link);
	expect(mark).toHaveAttribute("data-playing", "true");
});
it("keeps the final logo when reduced motion is requested", () => {
	vi.stubGlobal("matchMedia", () => ({ matches: true }));
	const { container } = render(
		<a href="/">
			<BrandIcon />
		</a>,
	);
	const link = container.querySelector("a");
	assert(link);
	fireEvent.pointerEnter(link);
	expect(container.querySelector('[data-slot="brand-mark"]')).toHaveAttribute("data-playing", "false");
});
it("plays the landing approval once on mount, not on later renders", () => {
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	const { container, rerender } = render(<BrandIcon approveOnMount />);
	expect(frames).toHaveLength(1);
	act(() => frames[0]?.(0));
	const mark = container.querySelector('[data-slot="brand-mark"]');
	expect(mark).toHaveAttribute("data-playing", "true");
	const svg = container.querySelector("svg");
	assert(svg);
	fireEvent.animationEnd(svg, { animationName: "brand-approved" });
	rerender(<BrandIcon approveOnMount />);
	expect(mark).toHaveAttribute("data-playing", "false");
	expect(frames).toHaveLength(1);
});

it("draws an entrance once without replaying on hover or focus", () => {
	const frames: FrameRequestCallback[] = [];
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		frames.push(callback);
		return frames.length;
	});
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	const { container, rerender } = render(<BrandIcon animateOnce />);
	act(() => frames[0]?.(0));
	const mark = container.querySelector('[data-slot="brand-mark"]');
	assert(mark);
	expect(mark).toHaveAttribute("data-playing", "true");
	const svg = mark.querySelector("svg");
	assert(svg);
	fireEvent.animationEnd(svg, { animationName: "brand-approved" });
	fireEvent.pointerEnter(mark);
	fireEvent.focus(mark);
	rerender(<BrandIcon animateOnce />);
	expect(mark).toHaveAttribute("data-playing", "false");
	expect(frames).toHaveLength(1);
});

it.each(["1800ms", "1.8s"])(
	"repeats after the shared rest interval (%s) and stops for reduced motion",
	async (rest) => {
		vi.useFakeTimers();
		const media = Object.assign(new EventTarget(), { matches: false });
		vi.stubGlobal("matchMedia", () => media);
		const { container, unmount } = render(<BrandIcon loop />);
		const mark = container.querySelector('[data-slot="brand-mark"]');
		assert(mark);
		(mark as HTMLElement).style.setProperty("--motion-brand-rest", rest);
		await act(async () => {
			await vi.advanceTimersToNextFrame();
		});
		expect(mark).toHaveAttribute("data-playing", "true");
		const svg = mark.querySelector("svg");
		assert(svg);
		fireEvent.animationEnd(svg, { animationName: "brand-approved" });
		expect(mark).toHaveAttribute("data-playing", "false");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1799);
		});
		expect(mark).toHaveAttribute("data-playing", "false");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(mark).toHaveAttribute("data-playing", "true");
		media.matches = true;
		act(() => {
			media.dispatchEvent(new Event("change"));
		});
		expect(mark).toHaveAttribute("data-playing", "false");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(3600);
		});
		expect(mark).toHaveAttribute("data-playing", "false");
		media.matches = false;
		act(() => {
			media.dispatchEvent(new Event("change"));
		});
		expect(mark).toHaveAttribute("data-playing", "true");
		unmount();
		expect(vi.getTimerCount()).toBe(0);
		vi.useRealTimers();
	},
);

it.each([
	["ar-SA", "سيراوايز"],
	["en-US", "Sirawise"],
])("names the %s brand link once", (locale, name) => {
	render(
		<a href="/">
			<BrandIcon locale={locale} />
		</a>,
	);
	expect(screen.getByRole("link", { name })).toHaveAccessibleName(name);
});
