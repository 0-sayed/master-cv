import type { BenchmarkArtifact } from "./runner";
import { required } from "./required";

export type Identity = {
	defenceAccepted?: boolean;
	verifierFault?: boolean;
	model: string;
	reasoning: string;
	members?: { model: string; reasoning: string; defenceAccepted?: boolean; verifierFault?: boolean }[];
	groupId?: string;
	repeatOf?: string;
};
export type Rating = {
	unsupportedFact?: boolean | null;
	outputId: string;
	reviewer: string;
	arabic: number | null;
	fidelity: number;
	naturalness: number;
	notes: string;
	best?: boolean;
};
export type BlindOutput = { id: string; label: string; text: string };
export type BlindGroup = {
	caseId: string;
	language: string;
	category: string;
	runIndex: number;
	input: string;
	intent: string;
	outputs: BlindOutput[];
	holdout: boolean;
	exploratory: boolean;
	repeat: boolean;
	id: string;
};
/** All originals need two independent, complete votes before revealing any identity. */
export function blindReviewComplete(groups: BlindGroup[], ratings: Rating[]): boolean {
	const originals = groups.filter((g) => !g.repeat);
	return (
		originals.length > 0 &&
		originals.every(
			(g) =>
				g.outputs.length > 0 &&
				g.outputs.every((o) => {
					const votes = ratings.filter(
						(r) =>
							r.outputId === o.id &&
							r.reviewer.trim() &&
							[r.fidelity, r.naturalness, ...(g.language === "en" ? [] : [r.arabic])].every(
								(value) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5,
							) &&
							typeof r.unsupportedFact === "boolean",
					);
					return new Set(votes.map((r) => r.reviewer.trim())).size >= 2;
				}),
		)
	);
}
export function arabicReviewComplete(groups: BlindGroup[], ratings: Rating[]) {
	const requiredGroups = groups.filter((g) => !g.repeat && !g.exploratory && g.language !== "en");
	return (
		requiredGroups.length > 0 &&
		requiredGroups.every(
			(g) =>
				g.outputs.length > 0 &&
				g.outputs.every(
					(o) =>
						new Set(ratings.filter((r) => r.outputId === o.id && r.arabic !== null).map((r) => r.reviewer)).size >= 2,
				),
		)
	);
}
export function blindCalls(artifact: BenchmarkArtifact, random: () => number = Math.random) {
	const grouped = new Map<string, typeof artifact.calls>();
	for (const c of artifact.calls) {
		if (c.outcome === "transient") continue;
		const key = `${c.caseId}:${c.runIndex}`;
		const rows = grouped.get(key) ?? [];
		if (!rows.some((r) => r.model === c.model && r.reasoning === c.reasoning && r.provider === c.provider))
			rows.push(c);
		grouped.set(key, rows);
	}
	const identities: Record<string, Identity> = {};
	const groups: BlindGroup[] = [];
	for (const rows of grouped.values()) {
		const shuffled = [...rows];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[shuffled[i], shuffled[j]] = [required(shuffled[j]), required(shuffled[i])];
		}
		const first = required(rows[0]);
		const group: BlindGroup = {
			id: `sample-${first.caseId}-${first.runIndex}`,
			holdout: first.holdout,
			exploratory: first.exploratory,
			repeat: false,
			caseId: first.caseId,
			language: first.language,
			category: first.category,
			runIndex: first.runIndex,
			input: first.input,
			intent: first.intent,
			outputs: shuffled.map((c, i) => {
				const id = `output-${c.id}`;
				identities[id] = {
					defenceAccepted: c.guardAccepted && c.verifierAccepted,
					verifierFault: Boolean(c.verifierFault || c.adjudication === "verifier-fault"),
					model: c.model,
					reasoning: c.reasoning,
					members: [
						{
							model: c.model,
							reasoning: c.reasoning,
							defenceAccepted: c.guardAccepted && c.verifierAccepted,
							verifierFault: Boolean(c.verifierFault || c.adjudication === "verifier-fault"),
						},
					],
					groupId: `sample-${first.caseId}-${first.runIndex}`,
				};
				let text = c.output || "[No output]";
				try {
					const parsed = JSON.parse(c.output) as {
						proposals?: { text: string }[];
						candidates?: { field: string; value: unknown; rawDateText: string | null }[];
						questions?: { prompt: string }[];
					};
					text = ["summary", "job-evidence", "tailoring", "translation", "cover-letter", "interview-prep"].includes(
						c.category,
					)
						? JSON.stringify(parsed, null, 2)
						: [
								...(parsed.proposals ?? []).map((p) => p.text),
								...(parsed.candidates ?? []).map(
									(p) => `${p.field}: ${JSON.stringify(p.value)}${p.rawDateText ? ` (${p.rawDateText})` : ""}`,
								),
								...(parsed.questions ?? []).map((q) => q.prompt),
							].join("\n") || "[No findings]";
				} catch {
					/* Invalid structured output remains visible for rating. */
				}
				return { id, label: String.fromCharCode(65 + i), text };
			}),
		};
		const unique = new Map<string, BlindOutput>();
		for (const output of group.outputs) {
			const previous = unique.get(output.text);
			if (previous) {
				required(identities[previous.id]).members?.push(...(required(identities[output.id]).members ?? []));
				delete identities[output.id];
			} else unique.set(output.text, output);
		}
		group.outputs = [...unique.values()].map((o, i) => {
			const identity = required(identities[o.id]);
			const members = required(identity.members).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
			const canonical = required(
				rows
					.filter((r) => members.some((m) => m.model === r.model && m.reasoning === r.reasoning))
					.map((r) => r.id)
					.sort()[0],
			);
			const id = `output-${canonical}`;
			delete identities[o.id];
			identities[id] = { ...identity, ...required(members[0]), members, groupId: group.id };
			return { ...o, id, label: String.fromCharCode(65 + i) };
		});
		groups.push(group);
	}
	// Sampling is independent of model order. Replicas carry new IDs and no visible repeat label.
	const originals = [...groups];
	const rank = (g: BlindGroup) => {
		let value = 2166136261;
		for (const char of `${artifact.id}:${g.id}`) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
		return value >>> 0;
	};
	const ranked = [...originals].sort((a, b) => rank(a) - rank(b));
	const repeats: BlindGroup[] = [];
	for (const language of new Set(originals.map((g) => g.language))) {
		const bucket = ranked.filter((g) => g.language === language);
		repeats.push(...bucket.slice(0, Math.floor(bucket.length * 0.2)));
	}
	for (const g of ranked) {
		if (repeats.length >= Math.ceil(originals.length * 0.2)) break;
		if (!repeats.includes(g)) repeats.push(g);
	}
	for (const source of repeats) {
		const id = `replica-${source.id}`;
		const outputs = source.outputs.map((o) => {
			const repeated = `${o.id}-repeat`;
			identities[repeated] = { ...required(identities[o.id]), repeatOf: o.id, groupId: id };
			return { ...o, id: repeated };
		});
		groups.push({ ...source, id, outputs, repeat: true });
	}
	for (let i = groups.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[groups[i], groups[j]] = [required(groups[j]), required(groups[i])];
	}
	return { groups, identities };
}
export function parseRatings(raw: unknown, reportId: string, identities: Record<string, Identity>): Rating[] {
	if (
		!raw ||
		typeof raw !== "object" ||
		!("reportId" in raw) ||
		raw.reportId !== reportId ||
		!("ratings" in raw) ||
		!Array.isArray(raw.ratings)
	)
		throw new Error("RATINGS_REPORT_MISMATCH");
	const seen = new Set<string>();
	const bests = new Set<string>();
	return raw.ratings.map((entry: unknown) => {
		if (!entry || typeof entry !== "object") throw new Error("INVALID_RATING");
		const r = entry as Rating;
		const valid = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
		const key = JSON.stringify([r.outputId, typeof r.reviewer === "string" ? r.reviewer.trim() : r.reviewer]);
		if (
			typeof r.outputId !== "string" ||
			!Object.hasOwn(identities, r.outputId) ||
			typeof r.reviewer !== "string" ||
			!r.reviewer.trim() ||
			r.reviewer.length > 100 ||
			!valid(r.fidelity) ||
			!valid(r.naturalness) ||
			(r.arabic !== null && !valid(r.arabic)) ||
			(r.unsupportedFact !== undefined && r.unsupportedFact !== null && typeof r.unsupportedFact !== "boolean") ||
			typeof r.notes !== "string" ||
			r.notes.length > 4000 ||
			seen.has(key)
		)
			throw new Error("INVALID_RATING");
		seen.add(key);
		if (r.best !== undefined && typeof r.best !== "boolean") throw new Error("INVALID_RATING");
		const bestKey = JSON.stringify([identities[r.outputId]?.groupId ?? r.outputId, r.reviewer.trim()]);
		if (r.best && bests.has(bestKey)) throw new Error("DUPLICATE_BEST_PICK");
		if (r.best) bests.add(bestKey);
		return {
			unsupportedFact: r.unsupportedFact ?? null,
			outputId: r.outputId,
			reviewer: r.reviewer.trim(),
			arabic: r.arabic,
			fidelity: r.fidelity,
			naturalness: r.naturalness,
			notes: r.notes,
			best: r.best ?? false,
		};
	});
}
export function humanScores(ratings: Rating[], identities: Record<string, Identity>, excludeVerifierFaults = false) {
	const groups = new Map<string, { identity: Identity; ratings: Rating[] }>();
	for (const r of ratings) {
		const identity = identities[r.outputId];
		if (!identity) continue;
		if (identity.repeatOf) continue;
		for (const member of identity.members ?? [identity]) {
			if (excludeVerifierFaults && member.verifierFault) continue;
			const key = JSON.stringify([member.model, member.reasoning]);
			const g = groups.get(key) ?? { identity: member, ratings: [] as Rating[] };
			g.ratings.push(r);
			groups.set(key, g);
		}
	}
	return [...groups.values()].map(({ identity, ratings: rows }) => {
		const average = (key: "arabic" | "fidelity" | "naturalness") => {
			const numbers = rows.map((r) => r[key]).filter((n) => n !== null);
			return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
		};
		const votes = new Map<string, Set<string>>();
		for (const r of rows) {
			const v = votes.get(r.outputId) ?? new Set<string>();
			v.add(JSON.stringify([r.arabic, r.fidelity, r.naturalness]));
			votes.set(r.outputId, v);
		}
		const withinOne = (a: Rating, b: Rating) =>
			Math.abs(a.fidelity - b.fidelity) <= 1 &&
			Math.abs(a.naturalness - b.naturalness) <= 1 &&
			((a.arabic === null && b.arabic === null) ||
				(a.arabic !== null && b.arabic !== null && Math.abs(a.arabic - b.arabic) <= 1));
		let pairs = 0;
		let agreed = 0;
		let selfPairs = 0;
		let selfAgreed = 0;
		for (let i = 0; i < rows.length; i++) {
			const a = required(rows[i]);
			for (const b of rows.slice(i + 1))
				if (a.outputId === b.outputId && a.reviewer !== b.reviewer) {
					pairs++;
					agreed += Number(withinOne(a, b));
				}
			for (const b of ratings)
				if (identities[b.outputId]?.repeatOf === a.outputId && a.reviewer === b.reviewer) {
					selfPairs++;
					selfAgreed += Number(withinOne(a, b));
				}
		}
		return {
			...identity,
			count: rows.length,
			arabic: average("arabic"),
			fidelity: average("fidelity"),
			naturalness: average("naturalness"),
			disagreement: [...votes.values()].filter((v) => v.size > 1).length,
			reviewers: new Set(rows.map((r) => r.reviewer)).size,
			fabricationsPassing: rows.filter((r) => {
				const source = identities[r.outputId];
				return (
					(r.unsupportedFact === true || r.fidelity <= 2) &&
					(source?.members ?? (source ? [source] : [])).some(
						(m) => m.model === identity.model && m.reasoning === identity.reasoning && m.defenceAccepted,
					)
				);
			}).length,
			bestPicks: rows.filter((r) => r.best).length,
			agreementWithinOne: pairs ? agreed / pairs : null,
			selfConsistencyWithinOne: selfPairs ? selfAgreed / selfPairs : null,
		};
	});
}

/** Arabic fidelity is rated only on Arabic/mixed HOLDOUT outputs; fabrication coverage spans every holdout language. */
export function decisionHumanScores(groups: BlindGroup[], ratings: Rating[], identities: Record<string, Identity>) {
	const held = groups.filter((g) => g.holdout && !g.exploratory && !g.repeat);
	const ids = new Set(held.flatMap((g) => g.outputs.map((o) => o.id)));
	const arabicIds = new Set(held.filter((g) => g.language !== "en").flatMap((g) => g.outputs.map((o) => o.id)));
	const arabic = humanScores(
		ratings.filter((r) => arabicIds.has(r.outputId)),
		identities,
		true,
	);
	return humanScores(
		ratings.filter((r) => ids.has(r.outputId)),
		identities,
		true,
	).map((h) => {
		const language = arabic.find((a) => a.model === h.model && a.reasoning === h.reasoning);
		return {
			...h,
			arabic: language?.arabic ?? null,
			fidelity: held.every((g) => g.language === "en") ? h.fidelity : (language?.fidelity ?? null),
		};
	});
}
export function humanDefenceCounts(
	groups: BlindGroup[],
	ratings: Rating[],
	identities: Record<string, Identity>,
	model: string,
	reasoning: string,
) {
	let honestOutputs = 0;
	let falseRejects = 0;
	for (const group of groups.filter((g) => g.holdout && !g.exploratory && !g.repeat))
		for (const output of group.outputs) {
			const identity = identities[output.id];
			const member = (identity?.members ?? (identity ? [identity] : [])).find(
				(m) => m.model === model && m.reasoning === reasoning,
			);
			if (!member || member.verifierFault) continue;
			const votes = ratings.filter((r) => r.outputId === output.id);
			if (
				new Set(votes.map((r) => r.reviewer)).size >= 2 &&
				votes.every((r) => r.fidelity >= 4 && r.unsupportedFact === false)
			) {
				honestOutputs++;
				if (!member.defenceAccepted) falseRejects++;
			}
		}
	return { honestOutputs, falseRejects };
}
