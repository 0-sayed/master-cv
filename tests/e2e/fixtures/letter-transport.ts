type Selection = { id: string; text: string };

export function scriptedLetterResponse(selections: Selection[]): unknown {
	const source = selections.find((selection) => selection.id === "letter-cv-evidence");
	if (!source) return undefined;
	const facts = JSON.parse(source.text) as { id: string; text: string }[];
	const fact = facts.find((entry) => entry.text.includes("Built TypeScript services")) ?? facts[0];
	if (!fact) throw new Error("Synthetic letter evidence required");
	const verifier = selections.find((selection) => selection.id === "letter-verification-task");
	if (verifier)
		return {
			coverage: "complete",
			items: (JSON.parse(verifier.text) as { items: { id: string }[] }).items.map((item) => ({
				id: item.id,
				verdict: "supported",
				evidenceIds: [fact.id],
				reason: "Synthetic exact CV fact",
			})),
		};
	return {
		paragraphs: [
			{ text: fact.text, claims: [{ id: "supported-claim", text: fact.text, evidenceIds: [fact.id], kind: "fact" }] },
		],
		notes: [],
	};
}
