import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";
import { BrandIcon } from "./brand-icon";

afterEach(() => vi.unstubAllGlobals());
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
