import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { useDialogStore } from "@/dialogs/store";
import { useCurrentBuilderResumeSelector, useCurrentResume, usePatchResume } from "@/features/resume/builder/draft";
import { DocumentMenuTrigger } from "@/features/resume/editor/chrome";
import { SaveStatus } from "@/features/resume/editor/save-status";
import { getResumeErrorMessage } from "@/libs/error-message";
import { orpc } from "@/libs/orpc/client";

/** Document ownership actions shared with the document workspace. */
export function DocumentMenu() {
	const name = useCurrentBuilderResumeSelector((resume) => resume.name);
	const isLocked = useCurrentBuilderResumeSelector((resume) => resume.isLocked);
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger render={<DocumentMenuTrigger name={name} isLocked={isLocked} />} />
				<DocumentMenuItems />
			</DropdownMenu>
			<SaveStatus />
		</>
	);
}

function DocumentMenuItems() {
	const navigate = useNavigate();
	const { openDialog } = useDialogStore();
	const resume = useCurrentResume();
	const patchResume = usePatchResume();
	const { id, name, slug, tags, isLocked } = resume;

	const { mutate: trashResume } = useMutation(orpc.documents.trash.mutationOptions());
	const { mutate: restoreResume } = useMutation(orpc.documents.restore.mutationOptions());
	const { mutate: setLockedResume } = useMutation(orpc.resume.setLocked.mutationOptions());

	// Locking is reversible, so it doesn't ask for confirmation.
	const handleToggleLock = () => {
		setLockedResume(
			{ id, isLocked: !isLocked },
			{
				onSuccess: () => {
					patchResume((draft) => {
						draft.isLocked = !isLocked;
					});
				},
				onError: (error) => {
					toast.add({ type: "error", description: getResumeErrorMessage(error) });
				},
			},
		);
	};

	// Undoable, so it doesn't ask first: the resume waits in Trash for 30 days.
	const handleTrash = () => {
		trashResume(
			{ type: "resume", id },
			{
				onSuccess: () => {
					void navigate({ to: "/dashboard" });
					toast.add({
						description: t`“${name}” moved to Trash`,
						actionProps: {
							children: t`Undo`,
							onClick: () =>
								restoreResume(
									{ type: "resume", id },
									{ onError: (error) => toast.add({ type: "error", description: getResumeErrorMessage(error) }) },
								),
						},
					});
				},
				onError: (error) => {
					toast.add({ type: "error", description: getResumeErrorMessage(error) });
				},
			},
		);
	};

	return (
		<DropdownMenuContent align="start" className="w-60">
			<DropdownMenuItem disabled={isLocked} onClick={() => openDialog("resume.update", { id, name, slug, tags })}>
				<Icon name="pencil-simple" />
				<Trans>Rename…</Trans>
			</DropdownMenuItem>
			<DropdownMenuItem onClick={() => openDialog("resume.duplicate", { id, name, slug, tags })}>
				<Icon name="copy" />
				<Trans>Duplicate</Trans>
			</DropdownMenuItem>
			<DropdownMenuItem onClick={handleToggleLock}>
				<Icon name={isLocked ? "lock-open" : "lock"} />
				{isLocked ? <Trans>Unlock editing</Trans> : <Trans>Lock editing</Trans>}
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem variant="destructive" disabled={isLocked} onClick={handleTrash}>
				<Icon name="trash" />
				<Trans>Move to Trash</Trans>
			</DropdownMenuItem>
		</DropdownMenuContent>
	);
}
