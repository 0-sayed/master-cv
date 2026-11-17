import { t } from "@lingui/core/macro";
import { ORPCError } from "@orpc/client";
import { toast } from "@reactive-resume/ui/components/toast";
import { useLetterEditorStore } from "./store";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client } from "@/libs/orpc/client";

function showRecoveryFailure(error: unknown, title: string, retry: () => void) {
	return toast.add({
		type: "error",
		title,
		description: getOrpcErrorMessage(error, { fallback: t`Couldn't save that change. Try again.` }),
		actionProps: { children: t`Try again`, onClick: retry },
	});
}

export const showLetterChangeFailure = (
	error: unknown,
	retry?: () => void,
	letterId = useLetterEditorStore.getState().letter?.id,
) => {
	const data: unknown = error instanceof ORPCError ? error.data : undefined;
	const immutable =
		typeof data === "object" && data !== null && "reason" in data && data.reason === "SUBMITTED_DOCUMENT_IMMUTABLE";
	const conflict = error instanceof ORPCError && error.code === "CONFLICT";
	const createCopy = () => {
		if (!letterId) return;
		void client.coverLetters
			.duplicate({
				id: letterId,
				name: t`${useLetterEditorStore.getState().letter?.name ?? t`Untitled letter`} (copy)`.slice(0, 100),
			})
			.then((copy) => window.location.assign(`/builder/letter/${encodeURIComponent(copy.id)}`))
			.catch((cause: unknown) => showRecoveryFailure(cause, t`Could not create a cover-letter copy`, createCopy));
	};
	const reload = () => {
		if (!letterId) return;
		void client.coverLetters
			.getById({ id: letterId })
			.then((letter) => {
				if (useLetterEditorStore.getState().letter?.id === letterId) useLetterEditorStore.getState().load(letter, true);
			})
			.catch((cause: unknown) => showRecoveryFailure(cause, t`Could not reload the cover letter`, reload));
	};
	return toast.add({
		type: "error",
		title: t`Could not save the cover-letter change`,
		description: immutable
			? t`The submitted letter stays unchanged. Create a copy to open an unlinked, editable draft. You can link the draft to any application.`
			: conflict
				? t`This letter changed elsewhere. Reload the saved version before trying again.`
				: getOrpcErrorMessage(error, { fallback: t`Couldn't save that change. Try again.` }),
		actionProps: immutable
			? { children: t`Create a copy`, onClick: createCopy }
			: conflict
				? { children: t`Reload`, onClick: reload }
				: retry
					? { children: t`Try again`, onClick: retry }
					: undefined,
	});
};
