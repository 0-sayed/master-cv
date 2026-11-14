import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { buildJobPassages } from "@reactive-resume/resume/ats";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { Label } from "@reactive-resume/ui/components/label";
import { savePendingChanges, useResumeStore } from "../builder/draft";
import { ReviewLaunch, ReviewOperationPanel } from "../editor/proposals/review-operation";
import { TranslationReview } from "./translation-review";
import { client } from "@/libs/orpc/client";
export function SummaryReview({ locked }: { locked: boolean }) {
	const document = useResumeStore((state) => state.resume);
	const [selected, setSelected] = useState<string[]>([]);
	const [operationId, setOperationId] = useState<string | null>(null);
	if (!document) return null;
	const facts = buildJobPassages(document.data);
	return (
		<div className="grid gap-3">
			<details>
				<summary>
					<Trans>Select facts for the summary</Trans>
				</summary>
				<div className="grid gap-2">
					{facts.map((fact) => (
						<Label key={fact.id}>
							<Checkbox
								checked={selected.includes(fact.id)}
								disabled={locked}
								onCheckedChange={(checked) =>
									setSelected((previous) =>
										checked ? [...previous, fact.id] : previous.filter((id) => id !== fact.id),
									)
								}
							/>
							<span dir="auto">{fact.text}</span>
						</Label>
					))}
				</div>
			</details>
			<ReviewLaunch
				kind="review.summary"
				disabled={locked}
				prepare={async () => {
					if (!(await savePendingChanges(document.id))) throw new Error("SAVE_REQUIRED");
					const saved = useResumeStore.getState();
					if (saved.resume?.id !== document.id || !saved.acknowledgedUpdatedAt) throw new Error("SOURCE_CHANGED");
					return client.ai.variantReview.prepare({
						kind: "review.summary",
						resumeId: document.id,
						expectedUpdatedAt: saved.acknowledgedUpdatedAt.toISOString(),
						selectedEvidenceIds: selected,
					});
				}}
				onStarted={setOperationId}
			>
				<Trans>Review summary</Trans>
			</ReviewLaunch>
			{operationId && (
				<ReviewOperationPanel operationId={operationId}>
					<TranslationReview operationId={operationId} />
				</ReviewOperationPanel>
			)}
		</div>
	);
}
