import { expect, it } from "vite-plus/test";
import { loadStudyCases, studyReviewItems } from "../../study";

const priorClosing = "يسعدني لقاؤكم لمناقشة الوظيفة وكيف يمكن لخبرتي أن تسهم في أداء مهامها.";
const neutralClosing = "يسعدني لقاؤكم لمناقشة الوظيفة ومهامها، والإجابة عن أسئلتكم في الموعد الذي يناسبكم.";

it("keeps every Arabic invitation free of unannotated experience claims without changing word counts", () => {
	const cases = studyReviewItems("tasks-v1", loadStudyCases("tasks-v1"));
	const changed = new Set<string>();
	let occurrences = 0;
	for (const c of cases) {
		if (c.kind !== "task" || c.category !== "cover-letter") continue;
		for (const output of [c.gold, ...c.mutants.map((control) => control.output)]) {
			const serialized = JSON.stringify(output);
			expect(serialized, c.id).not.toContain(priorClosing);
			for (const paragraph of (output as { paragraphs: { text: string }[] }).paragraphs) {
				if (paragraph.text.includes(neutralClosing)) {
					changed.add(c.id);
					occurrences++;
				}
			}
		}
	}
	expect(neutralClosing.split(/\s+/)).toHaveLength(priorClosing.split(/\s+/).length);
	expect(changed.size).toBe(32);
	expect(occurrences).toBe(102);
});
