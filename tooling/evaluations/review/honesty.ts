import { assertHardFacts } from "@reactive-resume/api/features/ai/hard-facts";
import fixed from "./honest-paraphrases.json";
/** Independently authored diagnostics, separate from live adjudication and holdout decisions. */
export function fixedHonesty() {
	const rejected = fixed.flatMap((p) => {
		try {
			assertHardFacts(p.source, p.paraphrase, p.source);
			return [];
		} catch (error) {
			return [{ id: p.id, reason: error instanceof Error ? error.message : "unknown" }];
		}
	});
	const group = (full: boolean) => {
		const selected = fixed.filter((p) => (p.fullPassage === true) === full);
		const failures = rejected.filter((r) => selected.some((p) => p.id === r.id));
		return { total: selected.length, rejected: failures.length, rate: failures.length / selected.length, failures };
	};
	return {
		basis:
			"58 hand-written non-gold EN/AR paraphrases, including 10 full-passage negation rewrites; no live verifier evidence",
		total: fixed.length,
		families: new Set(fixed.map((p) => p.family)).size,
		rejected: rejected.length,
		rate: rejected.length / fixed.length,
		failures: rejected,
		shortPassages: group(false),
		fullPassages: {
			...group(true),
			languages: {
				en: fixed.filter((p) => p.fullPassage && p.language === "en").length,
				ar: fixed.filter((p) => p.fullPassage && p.language === "ar").length,
			},
		},
	};
}
