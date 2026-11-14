import { Trans } from "@lingui/react/macro";
import { useId } from "react";

const tokens = (text: string) => text.match(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu) ?? [];
const word = (text: string) => /[\p{L}\p{N}]/u.test(text);
/** Added word occurrences, preserving exact proposed spelling, spacing and bidirectional text. */
function addedWording(before: string, after: string) {
	const original = new Map<string, number>();
	for (const token of tokens(before).filter(word)) original.set(token, (original.get(token) ?? 0) + 1);
	return tokens(after).map((text) => {
		const remaining = original.get(text) ?? 0;
		if (word(text) && remaining) original.set(text, remaining - 1);
		return { text, added: word(text) && remaining === 0 };
	});
}
type WordingDiffProps = { before: string; after: string };
export function WordingDiff({ before, after }: WordingDiffProps) {
	const legend = useId();
	const parts = addedWording(before, after);
	const hasNewWording = parts.some((p) => p.added);
	return (
		<>
			<ins dir="auto" className="no-underline" aria-describedby={hasNewWording ? legend : undefined}>
				{parts.map((p, index) =>
					p.added ? (
						<mark className="wording-added" key={index}>
							{p.text}
						</mark>
					) : (
						p.text
					),
				)}
			</ins>
			{hasNewWording && (
				<span id={legend} className="type-metadata text-ink-2">
					<Trans>New wording — check it is true</Trans>
				</span>
			)}
		</>
	);
}
