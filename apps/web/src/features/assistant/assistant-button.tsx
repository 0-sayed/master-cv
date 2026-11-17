import { t } from "@lingui/core/macro";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { cn } from "@reactive-resume/utils/style";
import { useEditorStore } from "@/features/resume/editor/store";

/** The ✦ in the editor bar: opens and closes the assistant (⌘J), accent-soft while it's open. */
export function AssistantButton() {
	const open = useEditorStore((state) => state.assistantOpen);
	const setOpen = useEditorStore((state) => state.setAssistantOpen);
	if (!isFeatureAvailable("assistant")) return null;

	return (
		<IconButton
			icon="sparkle"
			label={t`Assistant`}
			shortcut="Mod+J"
			aria-pressed={open}
			data-assistant-toggle=""
			className={cn("text-ink-2", open && "bg-accent-soft text-accent-text hover:bg-accent-soft")}
			onClick={() => setOpen(!open)}
		/>
	);
}
