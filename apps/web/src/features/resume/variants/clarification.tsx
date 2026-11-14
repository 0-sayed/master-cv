import type { SourceRevision } from "@reactive-resume/schema/ai-operation";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import {
	TaskOverlay,
	TaskOverlayContent,
	TaskOverlayTitle,
	TaskOverlayDescription,
	TaskOverlayFooter,
} from "@reactive-resume/ui/components/task-overlay";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { ReviewNotice } from "../editor/proposals/review-operation";
import { client } from "@/libs/orpc/client";
/** Reuses the existing T006 answer ledger: supplied information is never confirmed candidate evidence. */
export function Clarification({
	operationId,
	source,
	questions,
	resolved,
	stale,
	onSaved,
}: {
	operationId: string;
	source: SourceRevision;
	questions: Array<{ id: string; prompt: string; context?: string }>;
	resolved: string[];
	stale: boolean;
	onSaved: () => void;
}) {
	const [selected, setSelected] = useState<string | null>(null);
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const request = useRef<{ fingerprint: string; requestKey: string } | null>(null);
	const answer = useMutation({
		mutationFn: async (input: { questionId: string; text?: string }) => {
			const fingerprint = JSON.stringify(input);
			if (request.current?.fingerprint !== fingerprint)
				request.current = { fingerprint, requestKey: crypto.randomUUID() };
			if (input.text === undefined)
				await client.ai.review.dismissQuestion({
					operationId,
					questionId: input.questionId,
					requestKey: request.current.requestKey,
				});
			else
				await client.ai.review.answer({
					operationId,
					questionId: input.questionId,
					text: input.text,
					expectedSource: source,
					requestKey: request.current.requestKey,
				});
		},
		onSuccess: () => {
			setSelected(null);
			request.current = null;
			onSaved();
		},
	});
	const question = questions.find((item) => item.id === selected);
	return (
		<div className="grid gap-3">
			{questions.map((question) => (
				<div key={question.id} className="grid gap-2">
					{question.context && <blockquote dir="auto">{question.context}</blockquote>}
					<p dir="auto">{question.prompt}</p>
					{resolved.includes(question.id) ? (
						<p>
							<Trans>Recorded. Supplied information needs explicit confirmation before reanalysis.</Trans>
						</p>
					) : (
						<div className="flex flex-wrap gap-2">
							<Button disabled={stale || answer.isPending} onClick={() => setSelected(question.id)}>
								<Trans>Add information</Trans>
							</Button>
							<Button
								variant="secondary"
								disabled={answer.isPending}
								onClick={() => answer.mutate({ questionId: question.id })}
							>
								<Trans>Skip</Trans>
							</Button>
						</div>
					)}
				</div>
			))}
			{questions.length > 0 && (
				<Link to="/dashboard/career/information">
					<Trans>Review and confirm career information</Trans>
				</Link>
			)}
			<TaskOverlay
				open={Boolean(question)}
				onOpenChange={(open) => {
					if (!open && !answer.isPending) setSelected(null);
				}}
			>
				<TaskOverlayContent>
					<TaskOverlayTitle>
						<Trans>Add information</Trans>
					</TaskOverlayTitle>
					<TaskOverlayDescription dir="auto">{question?.prompt}</TaskOverlayDescription>
					{question?.context && <blockquote dir="auto">{question.context}</blockquote>}
					<Textarea
						aria-label="Your information"
						dir="auto"
						maxLength={4000}
						value={drafts[selected ?? ""] ?? ""}
						onChange={(event) => setDrafts((previous) => ({ ...previous, [selected ?? ""]: event.target.value }))}
					/>
					{answer.error && (
						<ReviewNotice>
							<Trans>Could not save your answer. Your text is kept.</Trans>
						</ReviewNotice>
					)}
					<TaskOverlayFooter>
						<Button variant="secondary" disabled={answer.isPending} onClick={() => setSelected(null)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							disabled={stale || answer.isPending || !(drafts[selected ?? ""] ?? "").trim()}
							onClick={() => {
								if (selected) answer.mutate({ questionId: selected, text: drafts[selected] ?? "" });
							}}
						>
							<Trans>Save</Trans>
						</Button>
					</TaskOverlayFooter>
				</TaskOverlayContent>
			</TaskOverlay>
		</div>
	);
}
