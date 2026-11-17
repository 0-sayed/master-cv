import { normalizeNumericDigits } from "@reactive-resume/utils/string";

export const HARD_FACTS_VERSION = "hard-facts-v11-scoped-paraphrases";
const gregorianMonths = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Exact calendar notation only; no inferred day, month, calendar or interval. */
export const normalizeFactDates = (text: string): string =>
	text
		.replace(
			/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/giu,
			(_match, month: string, year: string) =>
				`${year}-${String(gregorianMonths.indexOf(month.toLowerCase().slice(0, 3)) + 1).padStart(2, "0")}`,
		)
		.replace(/(\d{4})\s*[–—-]\s*(\d{4})(?!\d)/gu, "from $1 to $2")
		.replace(/(\d{4}-\d{2})\s*[–—]\s*(?=\d{4}-\d{2})/gu, "$1 to ");
export const normalizeFact = (text: string): string =>
	normalizeNumericDigits(text)
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
		.replace(/[أإآٱ]/gu, "ا")
		.replace(/\s+/gu, " ")
		.trim();
const wordPattern = /[\p{L}\p{N}]+(?:[._/+:#’'-][\p{L}\p{N}]+)*(?:\+{1,2}|#)?/gu;
const words = (text: string): string[] => normalizeFact(text).match(wordPattern) ?? [];
const stem = (word: string) =>
	word
		.replace(/^(?:[وفب]?(?:ال)|[وف](?=[\u0600-\u06ff]))/u, "")
		.replace(/(?:ها|هم|هن|هما|كم|كن|نا)$/u, "")
		.replace(/(?:ات|ون|ين|ا|ت)$/u, "")
		.replace(/(?:ies|s)$/u, "");
const number = /[+-]?\p{Nd}+(?:[.,:/-]\p{Nd}+)*(?:\s*[%٪])?/gu;
const numeric = (text: string) => [...normalizeFact(text).matchAll(number)].map((m) => m[0].replace(/\s/gu, ""));
const separator = /^(?:for|at|in|across|with|and|to|from|during|per|of|في|من|الى|عبر|لدى|خلال|على|و)$/u;
const clauses = (text: string, entityTokens?: ReadonlySet<string>) =>
	text
		.split(/\n/gu)
		.flatMap((line) => normalizeFact(line).split(/\.(?![\p{L}\p{N}])|[;؛!?؟]+/u))
		.flatMap((sentence) => {
			const parts = sentence.split(/\s+and\s+/u);
			if (!entityTokens) return parts;
			const result: string[] = [];
			for (const part of parts) {
				const tokens = lexical(part);
				if (result.length && tokens.length && tokens.every((token) => entityTokens.has(token)))
					result[result.length - 1] += ` and ${part}`;
				else result.push(part);
			}
			return result;
		})
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
	const role = [word, stem(word), word.replace(/^[وكبف]?(?:ك|ب)(?=[\u0600-\u06ff])/u, "")].find((w) => roles.test(w));
	return role ? (roleEquivalents[role] ?? role) : undefined;
};
const identifierCodes = (text: string) =>
	[...text.matchAll(/\b[B-HJ-Z]\s+\d+\b/gu)].map((match) => normalizeFact(match[0]).replace(/\s/gu, ""));
function quantities(text: string): string[] {
	const codes = new Set(identifierCodes(text));
	// A single explicit role can own an otherwise unlabelled date line. Multiple
	// roles retain clause-local bindings; never guess which role owns a date.
	const documentRoles = [...new Set(words(text).map(roleOf).filter(Boolean))];
	return text.split(/\n/gu).flatMap((line) => {
		const localRoles = [...new Set(words(line).map(roleOf).filter(Boolean))];
		const allRoles = localRoles.length ? localRoles : documentRoles;
		const aggregatePrefix = line.match(/^([^\d]+)(?:from|من)\s+\d{4}\s+(?:to|until|الى|حتى)\s+\d{4}/iu)?.[1] ?? "";
		const aggregateRange = words(aggregatePrefix).filter((word) => roleOf(word)).length > 1;
		return clauses(line).flatMap((clause) =>
			[...clause.matchAll(number)]
				.filter((m) => {
					const letter = /(?:^|[^\p{L}\p{N}])([b-hj-z])\s*$/u.exec(clause.slice(0, m.index))?.[1];
					return !letter || !codes.has(letter + m[0]);
				})
				.map((m) => {
					const prefix = clause.slice(0, m.index);
					const end = (m.index ?? 0) + m[0].length;
					const suffix = clause.slice(end);
					if (isYear(m[0])) {
						const experience = [...prefix.matchAll(/experience|خبرة/giu)].at(-1);
						const afterExperience = experience ? prefix.slice(experience.index + experience[0].length) : "";
						const careerRange =
							aggregateRange ||
							(!!experience &&
								(!words(afterExperience).some((word) => roleOf(word)) || /\broles\b|ادوار/u.test(afterExperience)));
						const role = careerRange
							? undefined
							: (words(prefix).map(roleOf).filter(Boolean).at(-1) ??
								words(suffix).map(roleOf).find(Boolean) ??
								(allRoles.length === 1 ? allRoles[0] : undefined));
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
	});
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
const credentialHead = (word: string) => {
	const head = stem(word);
	return (
		({ بكالوريوس: "bachelor", ماجستير: "master", دكتوراه: "phd", دبلوم: "diploma" } as Record<string, string>)[head] ??
		head
	);
};
const responsibility =
	/^(?:led|lead|managed|manage|manag|headed|directed|supervised|oversaw|owned|founded|expert|fluent|senior|chief|principal|sole|solely|بمفردي|وحدي|قد|قاد|قياد|ادر|ادار|ادير|مدير|تراس|اشرف|اسس|خبير|متقدم|متمكن)$/u;
function protectedVocabulary(text: string): Set<string> {
	const credentialModifiers = new Set(credentialBindings(text).flatMap((binding) => binding.modifiers));
	const normalized = normalizeFact(text);
	return new Set(
		[...normalized.matchAll(wordPattern)].flatMap((match) => {
			const w = match[0];
			const bare = credential.test(w)
				? w
				: w.replace(/^[وف]?(?:بال|وال|فال|ال|ب|ل)?/u, "").replace(/(?:ها|هم|هن|هما|نا)$/u, "");
			const root = stem(w).replace(/^ا(?=[\u0600-\u06ff])/u, "");
			if (credential.test(bare)) return [`credential:${credentialHead(bare)}`];
			// الإدارة names a field or activity. Finite management verbs and titles
			// remain protected; the noun alone does not assert managerial authority.
			if (
				bare === "ادارة" ||
				(bare === "ادارت" && /(?:دون|بدون)\s+(?:تولي\s+)?$/u.test(normalized.slice(0, match.index)))
			)
				return [];
			const inflected = stem(w).replace(/ة$/u, "");
			if (credentialModifiers.has(stem(w))) return [];
			if (responsibility.test(root) || responsibility.test(inflected))
				return [`responsibility:${predicate(inflected)}`];
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
				const bare = credential.test(token) ? token : token.replace(/^[وف]?(?:بال|وال|فال|ال|ب|ل)?/u, "");
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
				const start = /^(?:in|of|for|في)$/u.test(tokens[i + 1] ?? "") ? i + 2 : i + 1;
				for (let j = start; j < Math.min(tokens.length, start + 3); j++) {
					const w = tokens[j] ?? "";
					if (boundary.test(w) || credential.test(w) || (arabic && /^ل[تيل]/u.test(w))) break;
					right.push(stem(w));
				}
				return [{ head: credentialHead(bare), modifiers: [...left, ...right] }];
			});
		});
}
function entities(text: string): string[] {
	const products =
		text.match(
			/\b(?:Oracle|Excel|PowerBI|Tableau|Workday|Salesforce|Jira|Docker|Kubernetes|GitHub|GitLab|PostgreSQL)\b|(?<!\p{L})(?:مدد|قوى)(?!\p{L})/gu,
		) ?? [];
	const latin: string[] =
		text.match(/(?:[A-Za-z]+[._/+:#][A-Za-z0-9.+#-]+|[A-Z]{2,}[A-Za-z0-9]*|[A-Z][a-z]+[A-Z][A-Za-z0-9]*)/gu) ?? [];
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
		...identifierCodes(text),
		...products.map(normalizeFact),
		...cities.map((city) => cityEquivalents[city] ?? city),
		...latin.map((t) => t.replace(/[.]+$/u, "")),
		...arabic.map(
			(e) =>
				e.split(
					/\s*[—–|()]\s*|\s+(?:ب(?:تبوك|الرياض|جدة|مكة|المدينة|الدمام|الخبر|حائل|ابها|جازان|ينبع|الجبيل|نجران|الطائف)|في|من|لدى|خلال|باستخدام|وعملت|عام|بمدينة|in|at|from|during|using)(?:\s|$)/u,
				)[0] ?? e,
		),
	]
		.map(normalizeFact)
		.map((entity) => cityEquivalents[entity] ?? entity)
		.filter((entity) => !/^(?:مؤسسة|شركة|مكتب|مركز(?: تدريب)?) افتراضي(?:ة)?$/u.test(entity));
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
const compatibleObject = (a: string, b: string) =>
	a === b || (!!a && !!b && (a.startsWith(b + " ") || b.startsWith(a + " ")));
function assertPolarity(before: string, after: string, evidence: string) {
	const matchesPredicate = (word: string, verb: string) =>
		predicate(word) === verb || (/^[وف]/u.test(word) && predicate(word.slice(1)) === verb);
	const earlier = polarity(before);
	const proposed = polarity(after);
	const supplied = polarity(evidence);
	let unverifiedNegation = false;
	for (const p of proposed.filter(
		(p) => !supplied.some((s) => s.verb === p.verb && compatibleObject(s.object, p.object)),
	)) {
		const knownPredicate = clauses(evidence).some(
			(clause) =>
				words(clause).some((w) => matchesPredicate(w, p.verb)) &&
				(!p.object || lexical(clause).join(" ").includes(p.object)),
		);
		if (knownPredicate) throw new Error("AI_CONTRADICTION");
		unverifiedNegation = true;
	}
	for (const old of [...earlier, ...supplied]) {
		const surviving = clauses(after).some((clause) => {
			const tokens = words(clause);
			return (
				tokens.some((w) => matchesPredicate(w, old.verb)) &&
				(!old.object ||
					lexical(clause).join(" ").includes(old.object) ||
					old.object
						.split(" ")
						.slice(0, 2)
						.every((word) => lexical(clause).includes(word)))
			);
		});
		if (surviving && !proposed.some((p) => p.verb === old.verb && compatibleObject(p.object, old.object)))
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

function assertRoleModifiers(evidence: string, after: string) {
	const bindings = (text: string) =>
		words(text).flatMap((word, i, tokens) => {
			const role = roleOf(word);
			if (!role) return [];
			const modifier = tokens[i + (/\p{Script=Arabic}/u.test(word) ? 1 : -1)] ?? "";
			return modifier && !grammar.test(modifier) && !roleOf(modifier) && !/^\d/u.test(modifier)
				? [{ role, modifier: stem(modifier) }]
				: [];
		});
	const supplied = bindings(evidence);
	for (const claim of bindings(after)) {
		if (supplied.some((source) => source.role === claim.role && source.modifier === claim.modifier)) continue;
		if (supplied.some((source) => source.role !== claim.role && source.modifier === claim.modifier))
			throw new Error("AI_UNSUPPORTED_CLAIM");
	}
}

function assertToolBindings(evidence: string, after: string) {
	const passages = evidence.split(/\n|(?<=[.;؛!?؟])\s+/u);
	for (const match of after.matchAll(/(?:\b(?:using|with)\s+|باستخدام\s+)([A-Za-z][A-Za-z0-9.+#-]*)/gu)) {
		const tool = normalizeFact(match[1] ?? "").replace(/[.]+$/u, "");
		if (!entities(evidence).includes(tool) && !/[._+:#]/u.test(tool)) continue;
		const ownsTool = (passage: string) => words(passage).includes(tool);
		const own = passages.filter(ownsTool).map((passage) => lexical(passage).join(" "));
		if (!own.length) continue; // Entity checks reject an absent tool below.
		const other = passages.filter((passage) => !ownsTool(passage)).map((passage) => lexical(passage).join(" "));
		const activity = lexical(
			after
				.slice(0, match.index)
				.split(/[,،;؛.!?؟\n]|\s+and\s+|\s+و(?=\p{Script=Arabic})/u)
				.at(-1) ?? "",
		).slice(-5);
		for (let i = 0; i < activity.length - 1; i++) {
			const phrase = activity.slice(i, i + 2).join(" ");
			const contains = (text: string) => ` ${text} `.includes(` ${phrase} `);
			if (other.some(contains) && !own.some(contains)) throw new Error("AI_UNSUPPORTED_CLAIM");
		}
	}
}
function assertActionBindings(before: string, after: string) {
	const bindings = (text: string) =>
		clauses(text)
			.map((clause) => {
				const tokens = words(clause).filter((w) => !grammar.test(w) && !negative.test(w) && !auxiliary.test(w));
				return {
					verb: predicate(tokens[0] ?? ""),
					objects: tokens.slice(1).map(stem),
					entity: entities(text).includes(tokens[0] ?? ""),
				};
			})
			.filter((binding) => !binding.entity);
	const supplied = bindings(before);
	for (const proposed of bindings(after)) {
		const own = supplied.filter((s) => s.verb === proposed.verb);
		if (!own.length) continue;
		const sameObject = (binding: typeof proposed) => {
			const head = binding.objects.slice(0, 2);
			return head.length > 0 && head.every((word, index) => proposed.objects[index] === word);
		};
		if (!own.some(sameObject) && supplied.some((binding) => binding.verb !== proposed.verb && sameObject(binding)))
			throw new Error("AI_UNSUPPORTED_CLAIM");
	}
}

/** Embedded instructions are data, never evidence of career facts. */
/** Evidence-reporting grammar carries no candidate facts. Semantic verification reads the full text. */
export function evidenceExplanation(text: string): string {
	const scoped = /^(?:The (?:CV|resume)|(?:تذكر|تثبت|توضح)\s+السيرة|السيرة(?: الذاتية)?\s+(?:تذكر|تثبت|توضح))/iu.test(
		text,
	);
	return (scoped ? text.replace(/،\s*ولا\s+(?:توثق|تثبت|تذكر)[^.!?؟]*(?:[.!?؟]|$)/u, ".") : text)
		.replace(
			/،\s*لكن\s+(?:السيرة(?: الذاتية)?\s+لا\s+(?:توثق|تثبت)|لا\s+يوجد\s+في\s+السيرة(?: الذاتية)?\s+دليل)[^.!?؟]*(?:[.!?؟]|$)/gu,
			".",
		)
		.replace(
			/(?:[,،]\s*but\s+|\b(?:The|This|Supplied) (?:CV|resume) )does not (?:document|establish|show|provide|record)[^.!?؟]*(?:[.!?؟]|$)/giu,
			".",
		)
		.replace(/^(?:السيرة(?: الذاتية)?\s+(?:تذكر|تثبت|توضح)\s+)/u, "")
		.replace(/^(?:The (?:CV|resume) (?:states|shows|documents|records|lists|says)(?: that)?\s+)/iu, "")
		.replace(/^(?:(?:تذكر|تثبت|توضح)\s+(?:هذه المعلومة|السيرة(?: الذاتية)?)\s+)/u, "")
		.replace(/،\s*لكنها لا (?:تثبت|توثق|تذكر)[^.!?؟]*(?:[.!?؟]|$)/u, ".");
}

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
		.join("\n");
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
	assertRoleModifiers(evidence, after);
	assertToolBindings(evidence, after);
	const allowed = normalizeFact(evidence);
	const allowedWords = new Set(words(evidence));
	if (!subset(numeric(after), numeric(evidence))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (!subset(symbolsOf(after), symbolsOf(evidence))) throw new Error("AI_UNSUPPORTED_CLAIM");
	if (
		!grammaticalQuantities(after).every(
			(q) =>
				grammaticalQuantities(evidence).includes(q) ||
				(q.endsWith(":1") && grammaticalQuantities(evidence).includes(q.replace(/:1$/u, ":plural"))),
		)
	)
		throw new Error("AI_UNSUPPORTED_CLAIM");
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
						source.head === claim.head &&
						claim.modifiers.every(
							(modifier) =>
								source.modifiers.includes(modifier) ||
								(source.modifiers.length > 0 &&
									source.modifiers.every(
										(supplied) => /\p{Script=Arabic}/u.test(supplied) !== /\p{Script=Arabic}/u.test(modifier),
									)),
						),
				),
		)
	)
		throw new Error("AI_UNSUPPORTED_CLAIM");
	// Preserve unit and technical token spelling even in otherwise ordinary lowercase text.
	for (const token of words(after))
		if (/[._/+:#]/u.test(token) && !allowedWords.has(token)) throw new Error("AI_UNSUPPORTED_CLAIM");
	// Whole-clause omissions need explicit verifier fact-retention adjudication.
	// A coordinated list of existing entities is one fact-bearing clause, even when its items move.
	const sourceEntities = entities(before);
	const entityTokens = new Set(sourceEntities.flatMap(lexical));
	const afterClauses = clauses(after, entityTokens);
	for (const old of clauses(before, entityTokens)) {
		const oldTokens = lexical(old);
		const oldEntityWords = words(old);
		const surviving = afterClauses.filter((next) => {
			const nextTokens = lexical(next);
			return (
				(oldTokens[0] && nextTokens.some((w) => predicate(w) === predicate(oldTokens[0] ?? ""))) ||
				oldTokens.filter((w) => nextTokens.includes(w)).length >= 2
			);
		});
		if (!surviving.length) continue;
		const retained = surviving.join(" ");
		if (
			[
				...entities(old),
				...sourceEntities.filter((e) => words(e).every((token) => oldEntityWords.includes(token))),
			].some((e) => !normalizeFact(retained).includes(e) && !entities(retained).includes(e)) ||
			!subset(numeric(old), numeric(retained)) ||
			!subset(symbolsOf(old), symbolsOf(retained)) ||
			!subset(old.match(months) ?? [], retained.match(months) ?? [])
		)
			throw new Error("AI_LOST_FACT");
	}
}
