import { normalizeNumericDigits } from "@reactive-resume/utils/string";

export const HARD_FACTS_VERSION = "t006-hard-facts-v10-literal-evidence";
const gregorianMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Exact calendar notation only; no inferred day, month, calendar or interval. */
export const normalizeFactDates = (text: string): string =>
	text
		.replace(
			/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/giu,
			(_match, month: string, year: string) =>
				`${year}-${String(gregorianMonths.indexOf(month.toLowerCase().slice(0, 3)) + 1).padStart(2, "0")}`,
		)
		.replace(/(\d{4}-\d{2})\s*[–—]\s*(?=\d{4}-\d{2})/gu, "$1 to ");
export const normalizeFact = (text: string): string =>
	normalizeNumericDigits(text)
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
		.replace(/[أإآٱ]/gu, "ا")
		.replace(/\s+/gu, " ")
		.trim();
const words = (text: string) =>
	normalizeFact(text).match(/[\p{L}\p{N}]+(?:[._/+:#’'-][\p{L}\p{N}]+)*(?:\+{1,2}|#)?/gu) ?? [];
const stem = (word: string) =>
	word
		.replace(/^(?:[وفب]?(?:ال)|[وف](?=[\u0600-\u06ff]))/u, "")
		.replace(/(?:ها|هم|هن|هما|كم|كن|نا)$/u, "")
		.replace(/(?:ات|ون|ين|ا|ت)$/u, "")
		.replace(/(?:ies|s)$/u, "");
const number = /[+-]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*(?:\s*[%٪])?/gu;
const numeric = (text: string) => [...normalizeFact(text).matchAll(number)].map((m) => m[0].replace(/\s/gu, ""));
const separator = /^(?:for|at|in|across|with|and|to|from|during|per|of|في|من|الى|عبر|لدى|خلال|على|و)$/u;
const clauses = (text: string) =>
	normalizeFact(text)
		.split(/[.;؛!?؟\n]+|\s+and\s+/u)
		.filter(Boolean);
const grammar =
	/^(?:i|we|the|a|an|as|was|were|is|am|in|at|during|from|to|for|with|using|of|across|and|في|من|الى|لدى|على|خلال|عام|سنة|باستخدام|بصفة|بوظيفة|بمنصب)$/u;
const lexical = (text: string) =>
	words(text)
		.filter((w) => !grammar.test(w))
		.map(stem);
const roles =
	/^(?:apprentice|technician|engineer|accountant|clerk|cashier|analyst|coordinator|assistant|supervisor|manager|director|teacher|nurse|consultant|developer|specialist|مساعد|مشرف|مهندس|محاسب|فني|مدير|معلم|ممرض|استشاري|مطور|اخصائي|منسق)$/u;
// Closed language equivalents for the existing protected vocabulary, never
// fixture-specific employer aliases or free-form semantic inference.
const roleEquivalents: Record<string, string> = {
	مساعد: "assistant",
	مشرف: "supervisor",
	مهندس: "engineer",
	محاسب: "accountant",
	فني: "technician",
	مدير: "manager",
	معلم: "teacher",
	ممرض: "nurse",
	استشاري: "consultant",
	مطور: "developer",
	اخصائي: "specialist",
	منسق: "coordinator",
};
const cityEquivalents: Record<string, string> = {
	riyadh: "الرياض",
	jeddah: "جدة",
	dammam: "الدمام",
	khobar: "الخبر",
	tabuk: "تبوك",
	hail: "حائل",
	abha: "ابها",
	jazan: "جازان",
	yanbu: "ينبع",
	jubail: "الجبيل",
	najran: "نجران",
	taif: "الطائف",
	buraidah: "بريدة",
};
const isYear = (s: string) => /^(?:1[3-9]|20)\d{2}(?:[-/:]\d{1,2}){0,2}$/u.test(s);
const roleOf = (word: string) => {
	const role = [word, stem(word)].find((w) => roles.test(w));
	return role ? (roleEquivalents[role] ?? role) : undefined;
};
function quantities(text: string): string[] {
	// A single explicit role can own an otherwise unlabelled date line. Multiple
	// roles retain clause-local bindings; never guess which role owns a date.
	const allRoles = [...new Set(words(text).map(roleOf).filter(Boolean))];
	return clauses(text).flatMap((clause) =>
		[...clause.matchAll(number)].map((m) => {
			const prefix = clause.slice(0, m.index);
			const end = (m.index ?? 0) + m[0].length;
			const suffix = clause.slice(end);
			if (isYear(m[0])) {
				const role =
					words(prefix).map(roleOf).filter(Boolean).at(-1) ??
					words(suffix).map(roleOf).find(Boolean) ??
					(allRoles.length === 1 ? allRoles[0] : undefined);
				const temporal = words(prefix).at(-1);
				const endpoint =
					/^(?:from|من)$/u.test(temporal ?? "") || /^\s+(?:to|until|الى|حتى)\s+\d/u.test(suffix)
						? "start"
						: /^(?:to|until|الى|حتى)$/u.test(temporal ?? "")
							? "end"
							: "point";
				return `${m[0]}:year:${role ?? ""}:${endpoint}`;
			}
			const label = prefix.match(/([^,:=،]+)[:=،,]\s*$/u)?.[1];
			const following = suffix.split(/[,.;،؛!?؟\n]|\p{Nd}/u)[0] ?? "";
			let noun = words(following)
				.slice(0, 3)
				.filter(
					(_, i, all) =>
						!all
							.slice(0, i + 1)
							.some((w, j) => separator.test(w) || (j > 0 && /(?:[a-z]{3}ed|[\u0600-\u06ff]+(?<!ا)ت)$/u.test(w))),
				)
				.map(stem);
			if (label && !noun.length) noun = lexical(label).slice(-2);
			if (!noun.length) {
				const trailing = lexical(prefix.split(/[,،]/u).at(-1) ?? "");
				if (trailing.length >= 2) noun = trailing.slice(-2);
			}
			return `${m[0].replace(/\s/gu, "")}:${noun.join(" ")}`;
		}),
	);
}
const months =
	/(?<!\p{L})(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|محرم|صفر|ربيع\s+(?:الاول|الاخر|الثاني)|جمادى\s+(?:الاولى|الاخرة|الثانية)|رجب|شعبان|رمضان|شوال|ذو\s+(?:القعدة|الحجة)|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|هجري|ميلادي|هـ)(?!\p{L})/gu;
const nounParadigms = [
	["ملف", "ملفات"],
	["عقد", "عقود"],
	["تقرير", "تقارير"],
	["جهاز", "اجهزة"],
	["فرع", "فروع"],
	["طلب", "طلبات"],
	["فاتورة", "فواتير"],
	["موقع", "مواقع"],
	["مضخة", "مضخات"],
	["عيادة", "عيادات"],
];
function grammaticalQuantities(text: string): string[] {
	return clauses(text).flatMap((clause) => {
		const tokens = words(clause);
		return tokens.flatMap((token, i) => {
			if (/^\d/u.test(tokens[i - 1] ?? "")) return [];
			const bare = token.replace(/^[وفب]?(?:ال)?/u, "");
			for (const paradigm of nounParadigms) {
				const root = paradigm[0];
				if (!root) continue;
				const dualRoot = root.replace(/ة$/u, "ت");
				if ([dualRoot + "ان", dualRoot + "ين"].includes(bare)) return [`${root}:2`];
				if (bare === paradigm[1]) return [`${root}:plural`];
				if ([root, root + "ا"].includes(bare)) return [`${root}:1`];
			}
			return [];
		});
	});
}
const credential =
	/^(?:certif(?:ied|icate|icates|ication|ications)|degree|degrees|diploma|diplomas|bachelor\w*|master[’']?s?|doctorate|phd|licen[cs]\w*|charter\w*|accredit\w*|award\w*|شهاد\p{L}*|بكالوريوس|ماجستير|دكتوراه|دبلوم\p{L}*|رخص\p{L}*|ترخيص\p{L}*|معتمد\p{L}*|اعتماد\p{L}*|جائز\p{L}*|جوائز\p{L}*|زمال\p{L}*)$/u;
const responsibility =
	/^(?:led|lead|managed|manag|headed|directed|supervised|oversaw|owned|founded|expert|fluent|senior|chief|principal|sole|solely|بمفردي|وحدي|قد|قاد|قياد|ادر|ادار|ادير|مدير|تراس|اشرف|اسس|خبير|متقدم|متمكن)$/u;
function protectedVocabulary(text: string): Set<string> {
	return new Set(
		words(text).flatMap((w) => {
			const bare = w.replace(/^[وف]?(?:بال|وال|فال|ال|ب|ل)?/u, "").replace(/(?:ها|هم|هن|هما|نا)$/u, "");
			const root = stem(w).replace(/^ا(?=[\u0600-\u06ff])/u, "");
			if (credential.test(bare)) return [`credential:${stem(bare)}`];
			if (responsibility.test(root) || responsibility.test(stem(w))) return [`responsibility:${root}`];
			return [];
		}),
	);
}
/** Keep qualification modifiers beside their credential, rather than borrowing words across evidence. */
function credentialBindings(text: string) {
	const boundary =
		/^(?:i|we|my|held|hold|holds|earned|completed|received|awarded|obtained|has|have|a|an|the|while|before|after|and|with|for|in|of|on|at|to|from|during|على|عن|في|من|خلال|قبل|بعد|حصلت|حصل|اكملت|نلت)$/u;
	return clauses(text)
		.flatMap((clause) => clause.split(/[,،]/u))
		.flatMap((clause) => {
			const tokens = words(clause);
			return tokens.flatMap((token, i) => {
				const bare = token.replace(/^[وف]?(?:بال|وال|فال|ال|ب|ل)?/u, "");
				if (!credential.test(bare)) return [];
				const arabic = /\p{Script=Arabic}/u.test(bare);
				const left: string[] = [];
				if (!arabic)
					for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
						const w = tokens[j] ?? "";
						if (boundary.test(w) || credential.test(w)) break;
						left.unshift(stem(w));
					}
				const right: string[] = [];
				const start = /^(?:in|of|for)$/u.test(tokens[i + 1] ?? "") ? i + 2 : i + 1;
				for (let j = start; j < Math.min(tokens.length, start + 3); j++) {
					const w = tokens[j] ?? "";
					if (boundary.test(w) || credential.test(w) || (arabic && /^ل[تيل]/u.test(w))) break;
					right.push(stem(w));
				}
				return [{ head: stem(bare), modifiers: [...left, ...right] }];
			});
		});
}
function entities(text: string): string[] {
	const products =
		text.match(
			/\b(?:Oracle|Excel|PowerBI|Tableau|Workday|Salesforce|Jira|Docker|Kubernetes|GitHub|GitLab|PostgreSQL)\b|(?<!\p{L})(?:مدد|قوى)(?!\p{L})/gu,
		) ?? [];
	const latin: string[] =
		text.match(/(?:[A-Za-z]+[._/+:#-][A-Za-z0-9.+#-]+|[A-Z]{2,}[A-Za-z0-9]*|[A-Z][a-z]+[A-Z][A-Za-z0-9]*)/gu) ?? [];
	// Sentence-initial capitalization is ambiguous grammar, not confident identity.
	for (const match of text.matchAll(/\b[A-Z][a-z]+\b/gu)) {
		const prefix = text.slice(0, match.index).trimEnd();
		const suffix = text.slice((match.index ?? 0) + match[0].length);
		if (prefix && !/[.!?;:]$/u.test(prefix) && !/^\s*:/u.test(suffix)) latin.push(match[0]);
	}
	const cities =
		normalizeFact(text).match(
			/(?<!\p{L})(?:الرياض|جدة|مكة|المدينة|الدمام|الخبر|تبوك|حائل|ابها|جازان|ينبع|الجبيل|نجران|الطائف|بريدة|عنيزة|الاحساء|القطيف|riyadh|jeddah|dammam|khobar|tabuk|hail|abha|jazan|yanbu|jubail|najran|taif|buraidah)(?!\p{L})/gu,
		) ?? [];
	const arabic =
		normalizeFact(text).match(
			/(?<!\p{L})(?:بنك|مصرف|شركة|مؤسسة|وزار[ةه]|جامع[ةه]|مستشفى|منص[ةه]|هيئ[ةه]|مدرس[ةه]|جمعي[ةه])\s+[^.,،؛;\n]+/gu,
		) ?? [];
	return [
		...products.map(normalizeFact),
		...cities.map((city) => cityEquivalents[city] ?? city),
		...latin.map((t) => t.replace(/[.]+$/u, "")),
		...arabic.map(
			(e) =>
				e.split(
					/\s*[—–|()]\s*|\s+(?:ب(?:تبوك|الرياض|جدة|مكة|المدينة|الدمام|الخبر|حائل|ابها|جازان|ينبع|الجبيل|نجران|الطائف)|في|من|لدى|خلال|باستخدام|وعملت|عام|in|at|from|during|using)(?:\s|$)/u,
				)[0] ?? e,
		),
	]
		.map(normalizeFact)
		.map((entity) => cityEquivalents[entity] ?? entity);
}
const predicate = (word: string) =>
	(/\p{Script=Arabic}/u.test(word)
		? word
				.replace(/^[وف]?(?:ال)/u, "")
				.replace(/(?:ها|هم|هن|هما|نا)$/u, "")
				.replace(/(?:ات|ون|ين|ا|ت)$/u, "")
		: stem(word)
	)
		.replace(/(?:ed|ing)$/u, "")
		.replace(/e$/u, "")
		.replace(/^[اي](?=[\u0600-\u06ff])/u, "");
const negative =
	/^(?:not|never|without|no|cannot|\w+n['’]t|[وف]?(?:ما|لم|لن|لا|ليس|ليست|لست|لسنا|ليسوا|بدون|دون|غير))$/u;
const auxiliary = /^(?:be|been|being|have|has|a|an|the|did|do|does|ان|عن|كنت|اكن|يكن|تكن|نكن|كان|تكون|اكون)$/u;
function polarity(text: string) {
	return clauses(text).flatMap((clause) =>
		clause.split(/[,،]/u).flatMap((part) => {
			const tokens = words(part);
			return tokens.flatMap((w, i) => {
				if (!negative.test(w)) return [];
				const start = tokens.findIndex((t, j) => j > i && !auxiliary.test(t));
				if (start < 0) return [];
				return [
					{
						verb: predicate(tokens[start] ?? ""),
						object: tokens
							.slice(start + 1)
							.filter((t) => !grammar.test(t))
							.slice(0, 3)
							.map(stem)
							.join(" "),
					},
				];
			});
		}),
	);
}
function assertPolarity(before: string, after: string, evidence: string) {
	const matchesPredicate = (word: string, verb: string) =>
		predicate(word) === verb || (/^[وف]/u.test(word) && predicate(word.slice(1)) === verb);
	const earlier = polarity(before);
	const proposed = polarity(after);
	const supplied = polarity(evidence);
	let unverifiedNegation = false;
	for (const p of proposed.filter((p) => !supplied.some((s) => s.verb === p.verb && s.object === p.object))) {
		const knownPredicate = clauses(evidence).some(
			(clause) =>
				words(clause).some((w) => matchesPredicate(w, p.verb)) &&
				(!p.object || lexical(clause).join(" ").includes(p.object)),
		);
		if (knownPredicate) throw new Error("AI_CONTRADICTION");
		unverifiedNegation = true;
	}
	for (const old of earlier) {
		const surviving = clauses(after).some((clause) => {
			const tokens = words(clause);
			return (
				tokens.some((w) => matchesPredicate(w, old.verb)) &&
				(!old.object || lexical(clause).join(" ").includes(old.object))
			);
		});
		if (surviving && !proposed.some((p) => p.verb === old.verb && p.object === old.object))
			throw new Error("AI_CONTRADICTION");
	}
	// A different predicate or language is not proof of reversed polarity. The
	// independent verifier must establish entailment; exact predicate/object flips
	// above still fail closed. Do not invent a translation dictionary here.
	if (unverifiedNegation && !supplied.length) throw new Error("AI_UNVERIFIED_NEGATION");
}
const symbolsOf = (s: string) =>
	normalizeFact(s).match(
		/(?<!\p{L})(?:usd|eur|sar|gbp|aed)(?!\p{L})|[\p{Sc}%٪﷼]|\b[A-Za-z]+(?:\+\+|#)|[\w.+-]+@[\w.-]+|@[\w.-]+/gu,
	) ?? [];

/** Outcomes require semantic entailment, including causality without explicit metrics. */
export function claimKinds(text: string): "outcome"[] {
	return /\b(?:which|therefore|thereby|resulting|halv\w*|eliminat\w*|passed\s+(?:every|all)\s+(?:\w+\s+)*audit\w*)\b|(?<!\p{L})(?:مما|وبذلك|ف(?:اختف\p{L}*|انه\p{L}*|ضاعف\p{L}*|خفض\p{L}*|حقق\p{L}*|حسن\p{L}*|زاد\p{L}*|قل\p{L}*))(?!\p{L})/iu.test(
		normalizeFact(text),
	)
		? ["outcome"]
		: [];
}
const subset = (items: string[], available: string[]) => items.every((item) => available.includes(item));
function assertActionBindings(before: string, after: string) {
	const bindings = (text: string) =>
		clauses(text).map((clause) => {
			const tokens = words(clause).filter((w) => !grammar.test(w) && !negative.test(w) && !auxiliary.test(w));
			return { verb: predicate(tokens[0] ?? ""), objects: tokens.slice(1).map(stem) };
		});
	const supplied = bindings(before);
	for (const proposed of bindings(after)) {
		const own = supplied.filter((s) => s.verb === proposed.verb);
		if (!own.length) continue;
		const other = supplied.filter((s) => s.verb !== proposed.verb).flatMap((s) => s.objects);
		const ownObjects = own.flatMap((s) => s.objects);
		const distinctive = ownObjects.filter((o) => !other.includes(o));
		if (distinctive.some((o) => proposed.objects.includes(o))) continue;
		if (distinctive.length && other.some((o) => !ownObjects.includes(o) && proposed.objects.includes(o)))
			throw new Error("AI_UNSUPPORTED_CLAIM");
	}
}

/** Embedded instructions are data, never evidence of career facts. */
export function factualEvidence(text: string): string {
	return text
		.replace(/<!--[\s\S]*?-->/gu, " ")
		.replace(/<(formatting|instructions?|system|developer|prompt)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
		.split(/(?<=[.;؛!?؟])\s+|\n/gu)
		.filter(
			(part) =>
				!/(?:\b(?:instructions?|directive|memorandum)\s*:|response contract|تعليمات\s*:|مهمة إخراج|(?:^|[:：]\s*)(?:(?:please )?(?:ignore|disregard|report|invent|include|add|assume|upgrade|enlarge|expand|replace)\b|تجاهل|اكتب|أضف|اضف|ارفع|وسّع))/iu.test(
					part.trim(),
				),
		)
		.join(" ");
}
/** Diagnostics independent of authored forbidden labels; semantic verification still follows. */
export function unsupportedEvidenceClaims(before: string, after: string, evidence: string): string[] {
	const trusted = factualEvidence(evidence);
	const allowed = new Set(lexical(trusted));
	// Proclitic بـ is grammar, and an instruction's "include" is not a fact.
	const equivalent = (w: string) => [w, w.replace(/^ب(?=[\u0600-\u06ff])/u, "")];
	const trustedForms = new Set([...allowed].flatMap(equivalent));
	const excluded = new Set(
		lexical(evidence).filter(
			(w) =>
				!equivalent(w).some((v) => trustedForms.has(v)) &&
				!/^(?:include|add|report|replace|assume|invent|upgrade|enlarge|expand)$/u.test(w),
		),
	);
	const failures: string[] = [];
	for (const clause of clauses(after))
		// Structural education/tool labels do not assert a qualification by themselves.
		if (
			lexical(clause.trim().replace(/^(?:المؤهل|التعليم|الادوات|الاداة|qualification|education|tools?)\s*:/u, "")).some(
				(w) => excluded.has(w),
			)
		)
			failures.push(`instruction-only:${clause.trim()}`);
	try {
		assertPolarity(factualEvidence(before), after, trusted);
	} catch (error) {
		failures.push(
			error instanceof Error && error.message === "AI_UNVERIFIED_NEGATION" ? "unverified-negation" : "polarity-flip",
		);
	}
	return failures;
}

/** Conservative relational checks, followed by the independent model verifier for semantic entailment. */
export function assertHardFacts(rawBefore: string, rawAfter: string, rawEvidence: string): void {
	const sourceBefore = normalizeFactDates(rawBefore);
	const after = normalizeFactDates(rawAfter);
	const sourceEvidence = normalizeFactDates(rawEvidence);
	const unsupported = unsupportedEvidenceClaims(sourceBefore, after, sourceEvidence);
	if (unsupported.includes("polarity-flip") || unsupported.includes("unverified-negation"))
		throw new Error("AI_CONTRADICTION");
	if (unsupported.length) throw new Error("AI_UNSUPPORTED_CLAIM");
	const before = factualEvidence(sourceBefore);
	const evidence = factualEvidence(sourceEvidence);
	assertPolarity(before, after, evidence);
	assertActionBindings(evidence, after);
	const allowed = normalizeFact(evidence);
	const allowedWords = new Set(words(evidence));
	if (!subset(numeric(after), numeric(evidence))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (!subset(symbolsOf(after), symbolsOf(evidence))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (!subset(grammaticalQuantities(after), grammaticalQuantities(evidence))) throw new Error("AI_UNSUPPORTED_CLAIM");
	const suppliedQuantities = quantities(evidence);
	const script = (s: string) => (/\p{Script=Arabic}/u.test(s) ? "ar" : /[a-z]/u.test(s) ? "en" : "none");
	const crossScriptUnit = (q: string) => {
		if (q.includes(":year:")) return false;
		const [value, unit = ""] = q.split(":");
		const matches = suppliedQuantities.filter((s) => s.split(":")[0] === value);
		const suppliedUnit = matches[0]?.split(":")[1] ?? "";
		// No semantic unit equivalence is asserted. A unique literal value and
		// changed language leave its label entailment to the mandatory verifier.
		return (
			matches.length === 1 &&
			script(unit) !== "none" &&
			script(suppliedUnit) !== "none" &&
			script(unit) !== script(suppliedUnit)
		);
	};
	if (
		!quantities(after).every(
			(q) =>
				suppliedQuantities.includes(q) ||
				crossScriptUnit(q) ||
				(q.endsWith(":") && suppliedQuantities.some((s) => s.startsWith(q))) ||
				// A date-only claim makes no role assignment; an explicit role remains bound above.
				(q.includes(":year::") &&
					suppliedQuantities.some(
						(s) =>
							s.startsWith(q.split(":year::")[0] + ":year:") &&
							(q.endsWith(":point") || s.endsWith(":" + q.split(":").at(-1))),
					)),
		)
	)
		throw new Error("AI_UNSUPPORTED_CLAIM");
	const suppliedEntities = entities(evidence);
	if (entities(after).some((e) => !allowed.includes(e) && !suppliedEntities.includes(e)))
		throw new Error("AI_UNSUPPORTED_CLAIM");
	if ((normalizeFact(after).match(months) ?? []).some((m) => !allowed.includes(m)))
		throw new Error("AI_UNSUPPORTED_CLAIM");
	if ([...protectedVocabulary(after)].some((w) => !protectedVocabulary(evidence).has(w)))
		throw new Error("AI_UNSUPPORTED_CLAIM");
	const suppliedRoles = words(evidence).map(roleOf).filter(Boolean);
	const proposedRoles = words(after).map(roleOf).filter(Boolean);
	if (proposedRoles.some((r) => !suppliedRoles.includes(r))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (
		(entities(after).length || numeric(after).length) &&
		words(before)
			.map(roleOf)
			.some((r) => r && !proposedRoles.includes(r))
	)
		throw new Error("AI_LOST_FACT");
	const suppliedCredentials = credentialBindings(evidence);
	if (
		credentialBindings(after).some(
			(claim) =>
				!suppliedCredentials.some(
					(source) =>
						source.head === claim.head && claim.modifiers.every((modifier) => source.modifiers.includes(modifier)),
				),
		)
	)
		throw new Error("AI_UNSUPPORTED_CLAIM");
	// Preserve unit and technical token spelling even in otherwise ordinary lowercase text.
	for (const token of words(after))
		if (/[._/+:#]/u.test(token) && !allowedWords.has(token)) throw new Error("AI_UNSUPPORTED_CLAIM");
	// Whole-clause omissions need explicit verifier fact-retention adjudication.
	for (const old of clauses(before)) {
		const oldTokens = lexical(old);
		const surviving = clauses(after).filter((next) => {
			const nextTokens = lexical(next);
			return (
				(oldTokens[0] && nextTokens.some((w) => predicate(w) === predicate(oldTokens[0] ?? ""))) ||
				oldTokens.filter((w) => nextTokens.includes(w)).length >= 2
			);
		});
		if (!surviving.length) continue;
		const retained = surviving.join(" ");
		if (
			entities(old).some((e) => !normalizeFact(retained).includes(e) && !entities(retained).includes(e)) ||
			!subset(numeric(old), numeric(retained)) ||
			!subset(symbolsOf(old), symbolsOf(retained)) ||
			!subset(old.match(months) ?? [], retained.match(months) ?? [])
		)
			throw new Error("AI_LOST_FACT");
	}
}
