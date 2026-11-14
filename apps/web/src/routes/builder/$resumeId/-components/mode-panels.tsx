import type { EditorMode } from "@/features/resume/editor/store";
import { DesignPanel } from "./design-panel";
import { useResumeStore } from "@/features/resume/builder/draft";
import { CheckPanel } from "@/features/resume/editor/check/check-panel";
import { RecoveryPrompt } from "@/features/resume/editor/recovery-prompt";
import { SaveConflict } from "@/features/resume/editor/save-conflict";
import { OfflineBanner } from "@/features/resume/editor/save-status";
import { useEditorStore } from "@/features/resume/editor/store";
import { selectionFromPanelElement } from "@/features/resume/editor/write/reveal";
import { WritePanel } from "@/features/resume/editor/write/write-panel";
import { VariantBanner } from "@/features/resume/variants/variant-banner";

function WriteMode() {
	const select = useEditorStore((state) => state.select);

	return (
		// Focus events bubble here from every field; the handler only reads where focus landed.
		// oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- not an interactive element, see above.
		<div
			onFocus={(event) => {
				// Fields only: buttons (an entry's title, the chevrons) change the selection themselves.
				if (!event.target.matches("input, textarea, select, [contenteditable='true']")) return;
				const selection = selectionFromPanelElement(event.target);
				if (selection) select(selection);
			}}
		>
			<WritePanel />
		</div>
	);
}

export function ModePanel({ mode }: { mode: EditorMode }) {
	const resumeId = useResumeStore((state) => state.resume?.id);
	const conflict = useResumeStore((state) => state.saveStatus === "conflict");
	const recovery = useResumeStore((state) => !!state.recoveryDraft);
	if (conflict) return <SaveConflict />;
	if (recovery) return <RecoveryPrompt />;
	return (
		<>
			<OfflineBanner className="mx-4 mt-4 w-auto" />
			{resumeId && <VariantBanner resumeId={resumeId} />}
			{mode === "design" ? <DesignPanel /> : mode === "check" ? <CheckPanel /> : <WriteMode />}
		</>
	);
}
