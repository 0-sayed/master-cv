// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ExportStatus } from "./export-status";
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
for (const [status, label] of Object.entries({
	queued: "Your data copy is queued.",
	preparing: "Preparing your data copy",
	ready: "Your data copy is ready",
	failed: "Could not prepare your copy",
	expired: "Your data copy expired",
	cancelled: "Your data copy was cancelled",
})) {
	it(`distinguishes ${status} without a bearer download`, () => {
		i18n.loadAndActivate({ locale: "en-US", messages: {} });
		render(
			<I18nProvider i18n={i18n}>
				<ExportStatus
					request={{
						id: "owned-request",
						status: status as "queued",
						requestedAt: new Date().toISOString(),
						expiresAt: null,
						failureCode: null,
					}}
					onRequest={vi.fn()}
				/>
			</I18nProvider>,
		);
		expect(screen.getByText(label, { exact: true })).toBeDefined();
		const link = screen.queryByRole("link", { name: "Download copy" });
		expect(!!link).toBe(status === "ready");
		if (link) expect(link.getAttribute("href")).toBe("/api/privacy/exports/owned-request");
	});
}

it("has one request action before an export and a working retry after failure", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const onRequest = vi.fn();
	const { rerender } = render(
		<I18nProvider i18n={i18n}>
			<ExportStatus request={null} onRequest={onRequest} />
		</I18nProvider>,
	);
	expect(screen.getByRole("status")).toHaveTextContent("No data copy requested yet");
	fireEvent.click(screen.getByRole("button", { name: "Request a copy of my data" }));
	expect(onRequest).toHaveBeenCalledOnce();
	rerender(
		<I18nProvider i18n={i18n}>
			<ExportStatus
				request={{
					id: "failed-request",
					status: "failed",
					requestedAt: new Date().toISOString(),
					expiresAt: null,
					failureCode: "archive_failed",
				}}
				onRequest={onRequest}
			/>
		</I18nProvider>,
	);
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Request another copy" }));
	expect(onRequest).toHaveBeenCalledTimes(2);
});

it("removes the signed-in download when its actual expiry passes without a refetch", () => {
	vi.useFakeTimers();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const now = new Date("2026-11-14T10:00:00Z");
	vi.setSystemTime(now);
	render(
		<I18nProvider i18n={i18n}>
			<ExportStatus
				request={{
					id: "expiring-request",
					status: "ready",
					requestedAt: now.toISOString(),
					expiresAt: new Date(now.getTime() + 1000).toISOString(),
					failureCode: null,
				}}
				onRequest={vi.fn()}
			/>
		</I18nProvider>,
	);
	expect(screen.getByRole("link", { name: "Download copy" })).toBeVisible();
	expect(screen.getByRole("status")).toHaveTextContent("Available until");
	act(() => {
		vi.advanceTimersByTime(1001);
	});
	expect(screen.queryByRole("link")).not.toBeInTheDocument();
	expect(screen.getByRole("status")).toHaveTextContent("Your data copy expired");
	expect(screen.getByRole("button", { name: "Request another copy" })).toBeEnabled();
});
