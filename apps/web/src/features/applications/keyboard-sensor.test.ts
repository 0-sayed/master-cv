import type { KeyboardSensorProps } from "@dnd-kit/core";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { KeyboardSensor } from "@dnd-kit/core";

afterEach(() => vi.useRealTimers());

it.each(["Escape", "Space", "Enter"])("handles %s immediately after keyboard pickup without a timer", (code) => {
	vi.useFakeTimers();
	const node = document.createElement("button");
	document.body.append(node);
	const event = new KeyboardEvent("keydown", { code: "Space", bubbles: true });
	const onCancel = vi.fn();
	const onEnd = vi.fn();
	const props = {
		event,
		activeNode: { node: { current: node } },
		options: {},
		onStart: vi.fn(),
		onCancel,
		onEnd,
	} as unknown as KeyboardSensorProps;
	new KeyboardSensor(props);
	try {
		node.dispatchEvent(event);
		expect(onEnd).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
		node.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true }));
		expect(code === "Escape" ? onCancel : onEnd).toHaveBeenCalledOnce();
		node.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
		expect(code === "Escape" ? onCancel : onEnd).toHaveBeenCalledOnce();
	} finally {
		// Release the unpatched listener too when this regression fails.
		vi.runAllTimers();
		node.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
		node.remove();
	}
});
