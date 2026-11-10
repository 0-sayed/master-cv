// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { confirmAction } from "./shared";
const captured = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn() }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: captured }));
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	vi.clearAllMocks();
	captured.add.mockReturnValue("action-toast");
});
it("does not commit a business action just because its toast closes or the page is hidden", () => {
	const commit = vi.fn().mockResolvedValue(undefined);
	const action = confirmAction({ description: "Deleted", commit });
	const options = captured.add.mock.calls[0]?.[0];
	if (!options) throw new Error("Missing action toast");
	document.dispatchEvent(new Event("visibilitychange"));
	options.onClose?.();
	expect(commit).not.toHaveBeenCalled();
	expect(action.snapshot().status).toBe("cancelled");
	expect(options.description).not.toBe("Deleted");
});
it("shows completion only after an explicit commit is acknowledged, and commits once", async () => {
	let resolve!: () => void;
	const commit = vi.fn(
		() =>
			new Promise<void>((accept) => {
				resolve = accept;
			}),
	);
	const onCommitted = vi.fn();
	const action = confirmAction({ description: "Deleted", commit, onCommitted });
	const pending = action.confirm();
	void action.confirm();
	await Promise.resolve();
	expect(action.snapshot().status).toBe("committing");
	expect(onCommitted).not.toHaveBeenCalled();
	resolve();
	await pending;
	expect(commit).toHaveBeenCalledOnce();
	expect(action.snapshot().status).toBe("acknowledged");
	expect(onCommitted).toHaveBeenCalledOnce();
});
it("retains a failed action for explicit retry without publishing success", async () => {
	const commit = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
	const done = vi.fn();
	const action = confirmAction({ description: "Deleted", commit, onCommitted: done });
	await action.confirm();
	expect(action.snapshot().status).toBe("failed");
	expect(done).not.toHaveBeenCalled();
	await action.confirm();
	expect(action.snapshot().status).toBe("acknowledged");
	expect(done).toHaveBeenCalledOnce();
});
