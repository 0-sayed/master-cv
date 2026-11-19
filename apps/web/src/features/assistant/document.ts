import type { Passage, Proposal, ProposalState } from "@reactive-resume/resume/proposals";
import { t } from "@lingui/core/macro";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { applyTo, collectLetterPassages, getStateIn } from "@reactive-resume/resume/proposals";
import { toast } from "@reactive-resume/ui/components/toast";
import { applicationsListQueryOptions } from "@/features/applications/queries";
import { useLetterEditorStore } from "@/features/letters/store";

/** The document the assistant works on, as the panel needs it. Resumes and letters each provide one. */
export type AssistantDocument = {
	kind: "resume" | "letter";
	id: string;
	name: string;
	locked: boolean;
	/** The application it's for, whose posting is shared as context. */
	posting: { id: string; company: string; role: string } | null;
	/** A proposal's state against the document as it reads now. */
	stateOf: (proposal: Proposal) => ProposalState;
	/** Applies proposals as one undo step, with Undo in the toast. */
	accept: (proposals: readonly Proposal[]) => void;
	/** Where a proposal lands, in the app's language, when its passage is still there. */
	locationOf: (proposal: Pick<Proposal, "before" | "target">) => string | undefined;
};

const bullet = (n: number) => t`bullet ${n}`;
const paragraph = (n: number) => t`paragraph ${n}`;

/** Finds the passage a proposal replaces, or the one an addition follows. */
function locate(passages: readonly Passage[], { before, target }: Pick<Proposal, "before" | "target">) {
	const matches = passages.filter(
		(passage) =>
			passage.target.sectionId === target.sectionId &&
			passage.target.itemId === target.itemId &&
			passage.target.roleId === target.roleId &&
			passage.target.field === target.field &&
			passage.html &&
			(before === passage.html || before.startsWith(passage.html)),
	);
	return matches.length === 1 ? matches[0]?.location : undefined;
}

export function useLetterAssistantDocument(): AssistantDocument | null {
	const letter = useLetterEditorStore((state) => state.letter);
	const { applicationId } = useSearch({ strict: false });
	const { data: applications } = useQuery(applicationsListQueryOptions());
	const application = applications?.find((item) => item.id === (applicationId ?? letter?.sourceApplicationId));

	return useMemo(() => {
		if (!letter) return null;
		const passages = collectLetterPassages(letter.content, { body: t`Letter`, bullet, paragraph });

		return {
			kind: "letter",
			id: letter.id,
			name: letter.name,
			locked: letter.isLocked,
			posting: application ? { id: application.id, company: application.company, role: application.role } : null,
			stateOf: (proposal) => getStateIn(letter.content, proposal),
			accept: (proposals) => {
				const { letter: current, edit } = useLetterEditorStore.getState();
				if (!current) return;
				const before = current.content;
				const content = proposals.reduce((value, proposal) => applyTo(value, proposal) ?? value, before);
				edit({ content });
				toast.add({
					type: "celebration",
					description: proposals.length === 1 ? t`Edit applied` : t`${proposals.length} edits applied`,
					actionProps: { children: t`Undo`, onClick: () => edit({ content: before }) },
				});
			},
			locationOf: (proposal) => locate(passages, proposal),
		};
	}, [letter, application]);
}
