import type { FixChange } from "./fix-preview";
import type { ReviewValue } from "./review-values";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { t } from "@lingui/core/macro";
import { Avatar, AvatarImage, AvatarFallback } from "@reactive-resume/ui/components/avatar";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SuggestionDiff } from "@reactive-resume/ui/components/suggestion-diff";
import { formatReviewValue } from "./review-values";

function Value({ value }: { value: ReviewValue }) {
	return (
		<bdi
			dir={value.kind === "token" ? "ltr" : "auto"}
			className={value.kind === "token" ? "rounded-sm bg-sunken px-1 wrap-anywhere" : undefined}
		>
			{value.kind === "color" && (
				<span
					aria-hidden="true"
					className="me-1 inline-block size-3 rounded-sm border border-line-2 align-middle"
					style={{ backgroundColor: value.color }}
				/>
			)}
			{value.text}
		</bdi>
	);
}

/** Cards, grouped findings and confirmation dialogs share one formatted comparison. */
export function ReviewDiff({
	change,
	before,
	after = before,
}: {
	change: FixChange;
	before: ResumeData;
	after?: ResumeData;
}) {
	const previous = formatReviewValue(change.path, change.before, before);
	const next = formatReviewValue(change.path, change.after, after);
	const photo = change.path[0] === "picture" ? before.picture.url || after.picture.url : undefined;
	return (
		<div className="flex min-w-0 items-start gap-2" data-review-diff>
			{photo && (
				<Avatar size="sm" shape="square">
					<AvatarImage src={photo} alt={t`CV photo`} />
					<AvatarFallback>
						<Icon name="user" />
					</AvatarFallback>
				</Avatar>
			)}
			<SuggestionDiff
				layout="inline"
				before={previous.text}
				after={next.text}
				labels={{ before: t`Before`, after: t`After`, showMore: t`Show more`, showLess: t`Show less` }}
				values={
					previous.kind !== "text" || next.kind !== "text"
						? { before: <Value value={previous} />, after: <Value value={next} /> }
						: undefined
				}
			/>
		</div>
	);
}
