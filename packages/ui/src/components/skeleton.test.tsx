import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Skeleton, SkeletonBoundary, loadSkeletonModule } from "./skeleton";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
const placeholder = <Skeleton data-testid="block" />;

it("skips the visual placeholder for a query that completes before 200ms", () => {
	vi.useFakeTimers();
	const view = render(
		<SkeletonBoundary loading label="Loading content" fallback={placeholder}>
			Ready
		</SkeletonBoundary>,
	);
	expect(screen.getByTestId("block").closest("[data-visible]")).toHaveAttribute("data-visible", "false");
	act(() => vi.advanceTimersByTime(199));
	view.rerender(
		<SkeletonBoundary loading={false} label="Loading content" fallback={placeholder}>
			Ready
		</SkeletonBoundary>,
	);
	expect(screen.getByText("Ready")).toBeVisible();
	expect(screen.queryByTestId("block")).toBeNull();
});

it("holds a shown skeleton for 200ms, then acknowledges completion without trapping a refetch", () => {
	vi.useFakeTimers();
	const view = render(
		<SkeletonBoundary loading label="Loading content" fallback={placeholder}>
			Ready
		</SkeletonBoundary>,
	);
	act(() => vi.advanceTimersByTime(200));
	expect(screen.getByTestId("block").closest("[data-visible]")).toHaveAttribute("data-visible", "true");
	view.rerender(
		<SkeletonBoundary loading={false} label="Loading content" fallback={placeholder}>
			Ready
		</SkeletonBoundary>,
	);
	act(() => vi.advanceTimersByTime(199));
	expect(screen.queryByText("Ready")).toBeNull();
	act(() => vi.advanceTimersByTime(1));
	expect(screen.getByText("Ready")).toBeVisible();
	view.rerender(
		<SkeletonBoundary loading label="Loading content" fallback={placeholder}>
			Updated
		</SkeletonBoundary>,
	);
	act(() => vi.advanceTimersByTime(200));
	expect(screen.getByTestId("block")).toBeInTheDocument();
	view.rerender(
		<SkeletonBoundary loading={false} label="Loading content" fallback={placeholder}>
			Updated
		</SkeletonBoundary>,
	);
	act(() => vi.advanceTimersByTime(200));
	expect(screen.getByText("Updated")).toBeVisible();
});

it("announces one localized status, hides decoration and cancels timers on unmount", () => {
	vi.useFakeTimers();
	const view = render(
		<SkeletonBoundary
			loading
			label="جارٍ تحميل المستندات…"
			fallback={
				<>
					<Skeleton />
					<Skeleton />
				</>
			}
		>
			Done
		</SkeletonBoundary>,
	);
	expect(screen.getAllByRole("status")).toHaveLength(1);
	expect(screen.getByRole("status")).toHaveTextContent("جارٍ تحميل المستندات…");
	expect(view.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
	for (const block of view.container.querySelectorAll('[data-slot="skeleton"]'))
		expect(block).toHaveAttribute("aria-hidden", "true");
	view.unmount();
	expect(vi.getTimerCount()).toBe(0);
});

it("supports valid inline query counts inside descriptions and tab labels", () => {
	const view = render(
		<p>
			<SkeletonBoundary inline loading label="Loading the total" fallback={<Skeleton as="span" />}>
				6
			</SkeletonBoundary>
		</p>,
	);
	expect(view.container.querySelector('p > [data-slot="skeleton-region"]')?.tagName).toBe("SPAN");
	expect(view.container.querySelector("p div")).toBeNull();
});

it("gives known lazy modules the same fast-skip and minimum-visible timing", async () => {
	vi.useFakeTimers();
	const fast = loadSkeletonModule(() => new Promise<string>((resolve) => setTimeout(() => resolve("fast"), 100)));
	await vi.advanceTimersByTimeAsync(100);
	await expect(fast).resolves.toBe("fast");
	let finished = false;
	const slow = loadSkeletonModule(() => new Promise<string>((resolve) => setTimeout(() => resolve("slow"), 250))).then(
		(value) => {
			finished = true;
			return value;
		},
	);
	await vi.advanceTimersByTimeAsync(399);
	expect(finished).toBe(false);
	await vi.advanceTimersByTimeAsync(1);
	await expect(slow).resolves.toBe("slow");
});
