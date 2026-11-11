import { useResumeStore } from "../builder/draft";

/** A toast may undo only the action that created it, even after an autosave acknowledgement. */
export function captureUndoAction() {
	const { ownerId, resumeId, editGeneration, canUndo } = useResumeStore.getState();
	return () => {
		const current = useResumeStore.getState();
		if (
			canUndo &&
			current.ownerId === ownerId &&
			current.resumeId === resumeId &&
			current.editGeneration === editGeneration
		)
			current.undo();
	};
}
