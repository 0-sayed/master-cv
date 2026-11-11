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
	expect(preview.changes).toContainEqual({ before: "Before", after: "After" });
	const apply = vi.fn();
	expect(acceptFix(preview, { ...identity, editGeneration: 2 }, data, apply)).toBe(false);
	expect(apply).not.toHaveBeenCalled();
	expect(acceptFix(preview, { ...identity, ownerId: "bob" }, data, apply)).toBe(false);
	expect(acceptFix(preview, identity, data, apply)).toBe(true);
	expect(apply).toHaveBeenCalledTimes(1);
});
