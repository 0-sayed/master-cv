import { expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { prepareFix, acceptFix } from "./fix-preview";
const identity = { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 1 };
it("previews without mutation and refuses acceptance after another edit or owner switch", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "Before";
	const preview = prepareFix(identity, data, (draft) => {
		draft.basics.name = "After";
	});
	expect(data.basics.name).toBe("Before");
	expect(preview.changes).toContainEqual({ path: ["basics", "name"], before: "Before", after: "After" });
	const apply = vi.fn();
	expect(acceptFix(preview, { ...identity, editGeneration: 2 }, data, apply)).toBe(false);
	expect(apply).not.toHaveBeenCalled();
	expect(acceptFix(preview, { ...identity, ownerId: "bob" }, data, apply)).toBe(false);
	expect(acceptFix(preview, identity, data, apply)).toBe(true);
	expect(apply).toHaveBeenCalledTimes(1);
});

it("preserves field paths and typed photo visibility for human diff labels", () => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = false;
	const preview = prepareFix(identity, data, (draft) => {
		draft.picture.hidden = true;
	});
	expect(preview.changes).toEqual([{ path: ["picture", "hidden"], before: false, after: true }]);
});
