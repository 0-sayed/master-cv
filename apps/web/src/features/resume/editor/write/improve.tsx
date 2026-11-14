import type { Editor } from "@tiptap/react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { collectPassages } from "@reactive-resume/resume/proposals";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { ReviewNotice } from "../proposals/review-operation";
import { ResumeReviewWorkspace } from "../proposals/review-panel";
import { useResumeStore } from "@/features/resume/builder/draft";

type Action = "verb" | "result" | "shorter" | "custom";

/** The line Improve works on: the paragraph or list item holding the caret, as it was when Improve opened. */
export type ImproveLine = { from: number; to: number; text: string };

export function lineAtCaret(editor: Editor): ImproveLine | null {
	const { $from } = editor.state.selection;
	if (!$from.parent.isTextblock) return null;
	const text = $from.parent.textContent;
	if (!text.trim()) return null;
	return { from: $from.start(), to: $from.end(), text };
}

type ImprovePanelProps = {
	editor: Editor;
	line: ImproveLine;
	/** Where the line sits, e.g. the field's label. */
	where: string;
	onClose: () => void;
};

/** Improve uses the same durable review/decision path as Writing and the assistant. */
export function ImprovePanel({ editor, line, where, onClose }: ImprovePanelProps) {
	const data = useResumeStore((state) => state.resume?.data);
	const [action, setAction] = useState<Action | null>(null);
	const [request, setRequest] = useState("");
	const [target] = useState(() => {
		const passages = data
			? collectPassages(data, {
					summary: "",
					sectionTitle: () => "",
					entryTitle: () => "",
					bullet: () => "",
					paragraph: () => "",
				}).filter((passage) => passage.text === line.text)
			: [];
		return passages.length === 1 ? passages[0]?.target : undefined;
	});
	return (
		<div className="grid gap-3 border-t border-line p-3">
			<p dir="auto" className="type-metadata text-ink-2">
				{where}
			</p>
			{!target ? (
				<ReviewNotice>
					<Trans>This passage could not be identified uniquely in the saved CV. Review it in Writing.</Trans>
				</ReviewNotice>
			) : (
				<>
					<p className="type-body">
						<Trans>The selected field and related confirmed facts are included in this review.</Trans>
					</p>
					<div className="flex flex-wrap gap-2">
						{(
							[
								["verb", t`Stronger verb`],
								["result", t`Add a result`],
								["shorter", t`Make it shorter`],
								["custom", t`Ask for something else…`],
							] as const
						).map(([value, label]) => (
							<Button key={value} variant="secondary" aria-pressed={action === value} onClick={() => setAction(value)}>
								{label}
							</Button>
						))}
					</div>
					{action === "custom" && (
						<Input
							aria-label={t`What should change?`}
							value={request}
							maxLength={500}
							onChange={(event) => setRequest(event.target.value)}
						/>
					)}
					{action && (action !== "custom" || request.trim()) && (
						<ResumeReviewWorkspace
							key={`${action}:${request}`}
							target={target}
							action={action}
							request={action === "custom" ? request.trim() : undefined}
						/>
					)}
				</>
			)}
			<Button
				variant="secondary"
				onClick={() => {
					onClose();
					editor.commands.focus();
				}}
			>
				<Trans>Close</Trans>
			</Button>
		</div>
	);
}
