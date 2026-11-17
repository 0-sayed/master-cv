import { expect, it, vi } from "vite-plus/test";
const store = vi.hoisted(() => ({ getState: vi.fn() }));
vi.mock("@/features/resume/editor/store", () => ({ useEditorStore: store }));
import { openAssistantFrom } from "./open";
it("consumes disabled assistant links without opening the assistant", () => {
	expect(openAssistantFrom({ assistant: "prepare" })).toBe(true);
	expect(openAssistantFrom({ ask: "Question" })).toBe(true);
	expect(openAssistantFrom({})).toBe(false);
	expect(store.getState).not.toHaveBeenCalled();
});
