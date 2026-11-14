import type { ReportData } from "./report";
import {
	decisionHumanScores,
	humanDefenceCounts,
	humanScores,
	parseRatings,
	arabicReviewComplete,
	blindReviewComplete,
	type Rating,
} from "./blind";
import { decideEvidence } from "./decision";
import { required } from "./required";

const data = JSON.parse(required(required(document.getElementById("report-data")).textContent)) as ReportData;
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const select = (id: string) => element<HTMLSelectElement>(id);
const input = (id: string) => element<HTMLInputElement>(id);
let arabic = false;
let revealed = false;
let importedRatings = false;
data.identities = Object.fromEntries(
	data.groups.flatMap((g) => g.outputs.map((o) => [o.id, { model: "", reasoning: "", groupId: g.id }])),
);
data.scores = [];
data.tuningScores = [];
data.holdoutScores = [];
data.productionScores = [];
data.variantStatus = [];
let index = 0;
let ratings: Rating[] = [];
const storageKey = `master-cv-a02:${data.reportId}`;
const text = (en: string, ar: string) => (arabic ? ar : en);
const status = (message: string) => {
	element("status").textContent = message;
};
try {
	const saved = localStorage.getItem(storageKey);
	if (saved) ratings = parseRatings(JSON.parse(saved), data.reportId, data.identities);
} catch {
	status("Local storage unavailable or invalid. Use JSON download/upload to preserve ratings.");
}
function persist() {
	try {
		localStorage.setItem(storageKey, JSON.stringify({ reportId: data.reportId, ratings }));
		status(text("Ratings saved locally. Download JSON for backup.", "تم حفظ التقييمات محلياً. نزّل JSON للاحتفاظ بنسخة."));
	} catch {
		status(
			text(
				"Browser storage unavailable. Download ratings JSON before closing.",
				"التخزين غير متاح. نزّل ملف التقييمات قبل الإغلاق.",
			),
		);
	}
}
function filtered() {
	const multiple = new Set(ratings.map((r) => r.reviewer)).size > 1;
	return data.groups.filter(
		(g) =>
			(select("language").value === "all" || g.language === select("language").value) &&
			g.holdout === (select("partition").value === "holdout") &&
			g.exploratory === (select("scope").value === "exploratory") &&
			(!multiple || !g.repeat),
	);
}
function table(id: string, headers: string[], rows: (string | number | null)[][], passes?: boolean[]) {
	const root = element<HTMLTableElement>(id);
	root.replaceChildren();
	const head = document.createElement("thead");
	const header = document.createElement("tr");
	for (const label of headers) {
		const cell = document.createElement("th");
		cell.scope = "col";
		cell.textContent = label;
		header.append(cell);
	}
	head.append(header);
	root.append(head);
	const body = document.createElement("tbody");
	rows.forEach((row, i) => {
		const tr = document.createElement("tr");
		if (passes) tr.className = passes[i] ? "pass" : "fail";
		for (const value of row) {
			const cell = document.createElement("td");
			cell.textContent = value === null ? "—" : String(value);
			tr.append(cell);
		}
		body.append(tr);
	});
	root.append(body);
}
function scorecard() {
	if (!revealed) return;
	element("variant-status").textContent = data.variantStatus
		.map(
			(v) =>
				`${v.model}@${v.reasoning} (${v.provider}): ${v.status} · writer errors: ${JSON.stringify(v.writerErrors ?? {})} · verifier faults: ${v.verifierFaults ?? 0}${v.reason ? ` · ${v.reason}` : ""}`,
		)
		.join("\n");
	const source = select("partition").value === "holdout" ? data.holdoutScores : data.tuningScores;
	const selected = source.filter(
		(g) => g.dimension === select("dimension").value && g.exploratory === (select("scope").value === "exploratory"),
	);
	table(
		"scores",
		[
			text("Model / effort", "النموذج / التفكير"),
			text("Group", "المجموعة"),
			text("Safety", "السلامة"),
			"Safety passed / judged",
			"Quality appropriate / assessed (advisory)",
			text("Quality (holdout fidelity / 5)", "الجودة (دقة المعنى / 5)"),
			text("USD / 1,000 operations", "USD / 1000 عملية"),
			text("Calls", "الطلبات"),
			text("Invented accepted", "اختلاق مقبول"),
			text("Invented proposed", "اختلاق مقترح"),
			text("Lost facts", "حقائق مفقودة"),
			text("Schema failures", "فشل البنية"),
			text("Truncations", "انقطاع"),
			text("Guard rejected", "رفض الحماية"),
			text("Verifier rejected", "رفض التحقق"),
			text("False rejects / verifier-adjudicated honest outputs", "رفض خاطئ / مخرجات حكم المدقق بأمانتها"),
			text("Citation errors", "أخطاء الأدلة"),
			text("Missing questions", "أسئلة مفقودة"),
			text("Empty answers", "إجابات فارغة"),
			text("Usefulness misses", "تحسينات مفقودة"),
			text("Useful cases / cases (majority of repetitions)", "حالات مفيدة / الحالات (أغلبية التكرارات)"),
			text("Disagreement cases", "حالات الاختلاف"),
			text("True cost USD", "التكلفة الفعلية USD"),
			"OpenRouter USD (including 5.5% credit fee)",
			"OpenAI upstream USD",
			"Generation USD (raw)",
			"Verifier USD (raw)",
			"Writer-only USD / 1,000 operations (raw)",
			"Writer outputs >1,024 visible tokens",
			"Transient provider failures",
			"Verifier faults",
			"Verifier truncations",
			text("Unknown costs", "تكلفة مجهولة"),
			text("USD/session", "USD/جلسة"),
			"p50 ms",
			"p95 ms",
		],
		selected.map((g) => [
			`${g.model} / ${g.reasoning}`,
			g.value,
			g.pass ? "PASS" : "FAIL",
			`${g.safetyPasses} / ${g.safetySamples}`,
			`${g.qualityPasses} / ${g.qualitySamples}`,
			decisionHumanScores(
				data.groups.filter((group) => group.category === g.value),
				ratings,
				data.identities,
			)
				.find((h) => h.model === g.model && h.reasoning === g.reasoning)
				?.fidelity?.toFixed(2) ?? "Pending human ratings",
			(g.costPerSessionUsd * 1000).toFixed(4),
			g.runs,
			g.inventedAccepted,
			g.inventedProposed,
			g.lostFacts,
			g.schemaFailures,
			g.truncations,
			g.guardRejections,
			g.verifierRejections,
			`${g.falseRejects} / ${g.honestOutputs}`,
			g.citationErrors,
			g.missingQuestions,
			g.emptyAnswers,
			g.usefulnessMisses,
			`${g.usefulCases} / ${g.usefulnessCases} (n=${g.usefulnessSamples}; advisory)`,
			g.disagreementCases,
			g.costUsd.toFixed(6),
			g.openRouterCostUsd.toFixed(6),
			g.openaiCostUsd.toFixed(6),
			g.generationCostUsd.toFixed(6),
			g.verifierCostUsd.toFixed(6),
			g.writerCostPer1000Usd.toFixed(4),
			g.outputsOverProductionCap,
			g.transientProviderFailures,
			g.verifierFaults,
			g.verifierTruncations,
			g.unknownCosts,
			g.costPerSessionUsd.toFixed(6),
			Math.round(g.p50Ms),
			Math.round(g.p95Ms),
		]),
		selected.map((g) => g.pass),
	);
	element("verifier-faults").textContent =
		"Human adjudication required — verifier faults\n" + JSON.stringify(data.verifierFaults, null, 2);
	table(
		"usefulness-ranking",
		["Task", "Rank", "Model / effort", "Useful / scored cases", "Scored outputs"],
		[...new Set(source.filter((g) => g.dimension === "category").map((g) => g.value))].flatMap((category) =>
			source
				.filter(
					(g) =>
						g.dimension === "category" &&
						g.value === category &&
						g.exploratory === (select("scope").value === "exploratory"),
				)
				.sort(
					(a, b) =>
						(b.usefulnessCases ? b.usefulCases / b.usefulnessCases : -1) -
						(a.usefulnessCases ? a.usefulCases / a.usefulnessCases : -1),
				)
				.map((g, i) => [
					category,
					g.usefulnessCases ? i + 1 : "N/A",
					`${g.model}@${g.reasoning}`,
					`${g.usefulCases} / ${g.usefulnessCases}`,
					g.usefulnessSamples,
				]),
		),
	);
	const visibleIds = new Set(filtered().flatMap((g) => g.outputs.map((o) => o.id)));
	const human = humanScores(
		ratings.filter((r) => visibleIds.has(r.outputId)),
		data.identities,
	);
	const number = (n: number | null) => (n === null ? "—" : n.toFixed(2));
	table(
		"human",
		[
			text("Model / effort", "النموذج / التفكير"),
			text("Ratings", "التقييمات"),
			text("Arabic quality", "جودة العربية"),
			text("Meaning fidelity", "دقة المعنى"),
			text("Naturalness", "طبيعية الصياغة"),
			text("Rater disagreement", "اختلاف المقيمين"),
			text("Best picks", "اختيارات الأفضل"),
			text("Raters", "المقيمون"),
			text("Within 1", "فرق ≤1"),
			text("Self consistency", "الاتساق الذاتي"),
			text("Fabrications passing defence", "اختلاق يجتاز الدفاعات"),
			text("Holdout human honest false rejects / honest outputs", "رفض خاطئ / مخرجات أمينة بشرياً في المجموعة المحجوزة"),
		],
		human.map((h) => [
			`${h.model} / ${h.reasoning}`,
			h.count,
			number(h.arabic),
			number(h.fidelity),
			number(h.naturalness),
			h.disagreement,
			h.bestPicks,
			h.reviewers,
			number(h.agreementWithinOne),
			number(h.selfConsistencyWithinOne),
			h.fabricationsPassing,
			select("partition").value === "holdout"
				? (() => {
						const d = humanDefenceCounts(data.groups, ratings, data.identities, h.model, h.reasoning);
						return `${d.falseRejects} / ${d.honestOutputs}`;
					})()
				: null,
		]),
	);

	const heldout = data.groups.filter((g) => g.holdout && !g.exploratory && !g.repeat);
	const fidelityComplete =
		heldout.length > 0 &&
		heldout.every((g) =>
			g.outputs.every(
				(o) =>
					new Set(
						ratings.filter((r) => r.outputId === o.id && typeof r.unsupportedFact === "boolean").map((r) => r.reviewer),
					).size >= 2,
			),
		);
	const decision = decideEvidence(
		data.decisionEvidence,
		ratings.flatMap((r) => {
			const reportIds = new Set(
				data.decisionEvidence.flatMap((e) =>
					e.candidates.flatMap((c) => c.outputs.filter((o) => o.outputId === r.outputId).map((o) => o.reportId)),
				),
			);
			return [...reportIds].map((reportId) => ({ ...r, reportId }));
		}),
	);
	table(
		"task-decisions",
		[
			"Task",
			"Recommended model / effort",
			"Reason",
			"USD / 1,000 operations",
			"p50 / p95 ms",
			"AR / EN / mixed n (CI95)",
			"Quality advisory / metric",
			"Prompt version / schema hash",
		],
		decision.map((t) => [
			t.category,
			typeof t.winner === "object"
				? `${t.winner.model}@${t.winner.reasoning}${t.provisional ? " (provisional)" : ""}`
				: t.winner,
			t.reason,
			t.costPer1000Usd,
			t.p50Ms === null ? null : `${t.p50Ms.toFixed(0)} / ${t.p95Ms?.toFixed(0)}`,
			(["ar", "en", "mixed"] as const)
				.map((l) => `${l}: ${t.perLanguage[l].n} [${t.perLanguage[l].ci95.map((n) => n.toFixed(3)).join(", ")}]`)
				.join(" · "),
			`${(["ar", "en", "mixed"] as const).map((l) => `${l}: ${t.perLanguage[l].quality ?? "pending"}`).join(" · ")} / ${data.decisionEvidence.find((e) => e.category === t.category)?.qualityPolicy.metric}`,
			`${t.promptVersion} / ${t.schemaHash}`,
		]),
	);
	element("decision").textContent =
		"Safety = guard + independent verifier + zero accepted inventions. Every language needs a case-clustered CI95 lower bound >= 0.95; lexical retention flags and quality metrics are advisory. Ties require two independent blind ratings per output. Contract changes expire decisions. Synthetic benchmark selection does not approve release. " +
		(!fidelityComplete ||
		!arabicReviewComplete(
			data.groups.filter((g) => g.holdout),
			ratings,
		)
			? "Human release qualification pending."
			: "Human review complete.");

	element("variant-status").textContent += `\nIncomplete sessions: ${JSON.stringify(data.incomplete ?? [])}`;
	const groups = data.scores.filter((g) => g.dimension === "model");
	element("totals").textContent = text(
		`${groups.reduce((s, g) => s + g.runs, 0)} / ${data.plannedCalls} planned calls · $${groups.reduce((s, g) => s + g.costUsd, 0).toFixed(6)} measured · $${data.reservedUsd.toFixed(6)} consumed/reserved · OpenRouter cap $${data.budgetUsd} · OpenAI $${data.reservedOpenaiUsd.toFixed(6)} consumed/reserved / cap $${data.openaiBudgetUsd} · ${data.stopReason ?? "complete"}`,
		`${groups.reduce((s, g) => s + g.runs, 0)} / ${data.plannedCalls} طلب مخطط · $${groups.reduce((s, g) => s + g.costUsd, 0).toFixed(6)} مقاس · $${data.reservedUsd.toFixed(6)} مستهلك/محجوز · OpenRouter $${data.budgetUsd} · OpenAI $${data.reservedOpenaiUsd.toFixed(6)} / $${data.openaiBudgetUsd} · ${data.stopReason ?? "مكتمل"}`,
	);
}
function progress() {
	const reviewer = input("reviewer").value.trim();
	const ids = new Set(filtered().flatMap((g) => g.outputs.map((o) => o.id)));
	const total = ids.size;
	const count = ratings.filter((r) => r.reviewer === reviewer && ids.has(r.outputId)).length;
	element("progress").textContent = text(
		`${count} / ${total} outputs rated by ${reviewer}.`,
		`${count} / ${total} مخرجات قيّمها ${reviewer}.`,
	);
}
function render() {
	element("holdout-disclosure").textContent = text(data.holdoutDisclosure.en, data.holdoutDisclosure.ar);
	const groups = filtered();
	index = Math.min(Math.max(index, 0), Math.max(0, groups.length - 1));
	const options = select("case");
	options.replaceChildren();
	groups.forEach((g, i) => {
		const option = document.createElement("option");
		option.value = String(i);
		option.textContent = `${text("Sample", "عينة")} ${i + 1} · ${g.language}`;
		options.append(option);
	});
	options.value = String(index);
	element<HTMLButtonElement>("previous").disabled = index === 0;
	element<HTMLButtonElement>("next").disabled = index >= groups.length - 1;
	const group = groups[index];
	element("outputs").replaceChildren();
	element("source").textContent = group?.input ?? text("No cases", "لا توجد حالات");
	element("intent").textContent = group?.intent ?? "";
	for (const output of group?.outputs ?? []) {
		const card = document.createElement("article");
		card.className = "output";
		card.dataset.outputId = output.id;
		const heading = document.createElement("h2");
		heading.textContent = output.label;
		if (revealed) {
			const identity = document.createElement("span");
			const entry = required(data.identities[output.id]);
			identity.textContent = (entry.members ?? [entry]).map((m) => `${m.model} / ${m.reasoning}`).join(" · ");
			heading.append(identity);
		}
		const content = document.createElement("p");
		content.dir = "auto";
		content.className = "output-text";
		content.textContent = output.text;
		const controls = document.createElement("div");
		controls.className = "ratings";
		const reviewer = input("reviewer").value.trim();
		const vote = ratings.find((r) => r.outputId === output.id && r.reviewer === reviewer);
		const unsupported = document.createElement("select");
		const truthLabel = document.createElement("label");
		truthLabel.textContent = text("Does any claim lack source support?", "هل توجد حقيقة غير مدعومة بالمصدر؟");
		for (const [value, label] of [
			["", text("Choose", "اختر")],
			["no", text("No — every claim is supported", "لا — كل الحقائق مدعومة")],
			["yes", text("Yes — unsupported claim", "نعم — توجد حقيقة غير مدعومة")],
		]) {
			const option = document.createElement("option");
			option.value = required(value);
			option.textContent = required(label);
			unsupported.append(option);
		}
		unsupported.value = vote?.unsupportedFact === true ? "yes" : vote?.unsupportedFact === false ? "no" : "";
		truthLabel.append(unsupported);
		controls.append(truthLabel);
		const fields = {} as Record<"arabic" | "fidelity" | "naturalness", HTMLSelectElement>;
		for (const [key, label] of [
			["arabic", text("Arabic quality", "جودة العربية")],
			["fidelity", text("Meaning fidelity", "دقة المعنى")],
			["naturalness", text("Naturalness", "طبيعية الصياغة")],
		] as const) {
			const wrapper = document.createElement("label");
			wrapper.textContent = label;
			const control = document.createElement("select");
			control.dataset.metric = key;
			for (const [value, caption] of [
				["", text("Choose 1–5", "اختر 1–5")],
				...(key === "arabic" ? [["na", text("N/A — no Arabic output", "لا ينطبق — المخرج بلا عربية")]] : []),
				...[1, 2, 3, 4, 5].map((n) => [String(n), `${n}`]),
			]) {
				const option = document.createElement("option");
				option.value = required(value);
				option.textContent = required(caption);
				control.append(option);
			}
			control.value = vote ? (key === "arabic" && vote.arabic === null ? "na" : String(vote[key])) : "";
			fields[key] = control;
			wrapper.append(control);
			controls.append(wrapper);
		}
		const notesLabel = document.createElement("label");
		notesLabel.textContent = text("Notes", "ملاحظات");
		const notes = document.createElement("textarea");
		notes.maxLength = 4000;
		notes.value = vote?.notes ?? "";
		notes.dir = "auto";
		notesLabel.append(notes);
		controls.append(notesLabel);
		const bestLabel = document.createElement("label");
		bestLabel.className = "best-pick";
		const best = document.createElement("input");
		best.type = "radio";
		best.name = `best-${group?.id}`;
		best.checked = vote?.best ?? false;
		best.dataset.best = "true";
		bestLabel.append(best, document.createTextNode(text("Best of these outputs", "الأفضل بين هذه المخرجات")));
		controls.append(bestLabel);
		const save = () => {
			const reviewer = input("reviewer").value.trim();
			if (!reviewer) {
				status(text("Enter a reviewer name.", "أدخل اسم المقيم."));
				return;
			}
			if (!fields.arabic.value || !fields.fidelity.value || !fields.naturalness.value || !unsupported.value) {
				status(
					text(
						"Complete all ratings and the source-support judgment to save this output.",
						"أكمل التقييمات وحدد هل كل الحقائق مدعومة لحفظ هذا المخرج.",
					),
				);
				return;
			}
			const rating: Rating = {
				unsupportedFact: unsupported.value === "yes",
				outputId: output.id,
				reviewer,
				arabic: fields.arabic.value === "na" ? null : Number(fields.arabic.value),
				fidelity: Number(fields.fidelity.value),
				naturalness: Number(fields.naturalness.value),
				notes: notes.value,
				best: best.checked,
			};
			ratings = parseRatings(
				{
					reportId: data.reportId,
					ratings: [
						...ratings
							.filter((r) => !(r.outputId === output.id && r.reviewer === reviewer))
							.map((r) =>
								best.checked && r.reviewer === reviewer && data.identities[r.outputId]?.groupId === group?.id
									? { ...r, best: false }
									: r,
							),
						rating,
					],
				},
				data.reportId,
				data.identities,
			);
			persist();
			progress();
			scorecard();
		};
		controls.addEventListener("change", save);
		notes.addEventListener("input", save);
		card.append(heading, content, controls);
		element("outputs").append(card);
	}
	progress();
	scorecard();
}
function localize() {
	document.documentElement.lang = arabic ? "ar" : "en";
	document.documentElement.dir = arabic ? "rtl" : "ltr";
	const labels: Record<string, [string, string]> = {
		"fixture-tab": ["Review fixtures", "مراجعة الحالات"],
		"fixture-title": ["Source and gold review", "مراجعة المصدر والإجابة المرجعية"],
		"fixture-next": ["Next fixture", "الحالة التالية"],
		"approval-download": ["Download Arabic approval", "تنزيل موافقة المراجعة العربية"],
		"source-reviewed-label": ["Source wording reviewed", "راجعت صياغة المصدر"],
		"gold-reviewed-label": ["Gold facts and acceptable outputs reviewed", "راجعت الحقائق والمخرجات المرجعية"],
		title: ["Blind model review", "تقييم النماذج دون كشف الهوية"],
		locale: ["العربية", "English"],
		"blind-tab": ["Blind rating", "التقييم المحجوب"],
		reveal: ["Reveal models & scorecard", "كشف النماذج وبطاقة النتائج"],
		"scores-tab": ["Scorecard", "بطاقة النتائج"],
		"source-title": ["Source and requested task", "المصدر والمهمة المطلوبة"],
		previous: ["Previous", "السابق"],
		next: ["Next", "التالي"],
		download: ["Download ratings JSON", "تنزيل التقييمات JSON"],
		"score-title": ["Automatic scorecard", "النتائج الآلية"],
		"human-title": ["Human ratings", "التقييم البشري"],
	};
	for (const [id, pair] of Object.entries(labels)) element(id).textContent = pair[arabic ? 1 : 0];
	for (const [id, en, ar] of [
		["reviewer-label", "Reviewer", "المقيم"],
		["language-label", "Cases", "الحالات"],
		["case-label", "Case / run", "الحالة / التكرار"],
		["dimension-label", "Group", "المجموعة"],
		["upload-label", "Upload ratings JSON", "تحميل التقييمات JSON"],
		["partition-label", "Dataset", "المجموعة"],
		["scope-label", "Scope", "النطاق"],
		["fixture-reviewer-label", "Arabic reviewer", "مراجع العربية"],
		["fixture-case-label", "Fixture", "الحالة"],
		["approval-upload-label", "Upload Arabic approval", "تحميل موافقة العربية"],
	])
		required(element(required(id)).firstChild).textContent = `${text(required(en), required(ar))} `;
	const languageNames = arabic ? ["الكل", "العربية", "الإنجليزية", "مختلط"] : ["All", "Arabic", "English", "Mixed"];
	[...select("language").options].forEach((o, i) => (o.textContent = required(languageNames[i])));
	const dimensions = arabic
		? ["النموذج", "الفئة", "اللغة", "الفئة + اللغة"]
		: ["Model", "Category", "Language", "Category + language"];
	[...select("dimension").options].forEach((o, i) => (o.textContent = required(dimensions[i])));
	[...select("partition").options].forEach(
		(o, i) => (o.textContent = required((arabic ? ["التطوير", "المجموعة المحجوزة"] : ["Tuning", "Held out"])[i])),
	);
	[...select("scope").options].forEach(
		(o, i) =>
			(o.textContent = required(
				(arabic ? ["معالجات الإنتاج", "استكشافي · T007"] : ["Production handlers", "Exploratory · T007"])[i],
			)),
	);
	element("control-summary").textContent =
		`${data.fixedHonesty.rejected}/${data.fixedHonesty.total} (${data.fixedHonesty.fullPassages.rejected}/${data.fixedHonesty.fullPassages.total} ${text("full passages", "مقاطع كاملة")}) ${text("fixed honest paraphrases rejected (separate diagnostic)", "صياغات أمينة مرفوضة في الاختبار الثابت المنفصل")} · ${data.control.honestFalseRejects?.length ?? 0} ${text("tuning honest defence rejections", "رفض صياغات أمينة في مجموعة التطوير")} · ${data.control.pass ? "PASS" : "BLOCKED"} · ${data.control.failures.length}/${data.control.checked} ${text("guard control failures. Paid preflight validates tuning labels and usefulness; honest defence rejections are reported separately. Identical outputs are grouped; every repetition is rated. Held-out cases are excluded from tuning.", "إخفاقات ضوابط الحماية. يتحقق الفحص المسبق من تسميات التطوير وفائدة التحسين، ويعرض رفض الصياغات الأمينة منفصلاً. تُجمع المخرجات المتطابقة ويُقيّم كل تكرار. الحالات المحجوزة مستبعدة من التطوير.")}`;
	element("qualification").textContent = text(
		`${data.mode.toUpperCase()} · Synthetic cases only. Fake mode does not qualify models. Automated PASS is a corpus check, not A02 release approval.`,
		`${data.mode.toUpperCase()} · حالات اصطناعية فقط. الوضع الوهمي لا يؤهل النماذج. النجاح الآلي فحص للمجموعة وليس موافقة إصدار A02.`,
	);
	element("rubric").textContent = text(
		"Rate 1 = serious errors, 3 = usable with corrections, 5 = accurate and natural. Judge only the supplied source and requested task. Use N/A when the output has no Arabic. Scores auto-save when all ratings and the source-support judgment are complete. Download/upload JSON to transfer or merge reviewers. Identities are absent from this file. Import completed ratings before the separate private identity file.",
		"1 = أخطاء جسيمة، 3 = صالح بعد تصحيح، 5 = دقيق وطبيعي. قيّم وفق المصدر والمهمة فقط. اختر لا ينطبق عندما يخلو المخرج من العربية. تُحفظ الدرجات تلقائياً عند اكتمالها. نزّل/حمّل JSON لنقل التقييمات أو دمج المقيمين. لا يحتوي هذا الملف على هويات النماذج. استورد التقييمات أولاً ثم ملف الهوية المنفصل.",
	);
	element("definitions").textContent = text(
		"Session = one generation plus one independent verification call, not a full customer journey. Pair totals include the credit fee; separate generation/verifier and writer-only costs are raw provider billing. Tax is excluded; unknown cost is reserved, never treated as free. Lost facts use normalized authored alternatives plus verifier retention; human review checks semantics. Disagreement counts exact-output variants for identical case/prompt/input within each model/effort. Rater disagreement counts outputs with differing scores; adjudicate with a second independent reviewer. No human score is invented. Missing/partial calls and human coverage must be reviewed before task-specific model selection.",
		"الجلسة = طلب توليد وتحقق محدود، وليست رحلة مستخدم كاملة. إجمالي الجلسة يشمل رسوم الرصيد؛ تكاليف التوليد والتحقق والتوليد فقط تعرض فاتورة المزود دون الرسوم. الضريبة مستبعدة؛ تُحجز التكلفة المجهولة. الحقائق المفقودة فحص نصي مرجعي؛ المعنى يتطلب تقييماً بشرياً. الاختلاف يحصي تنويعات المخرج لنفس المدخل داخل كل نموذج/تفكير. اختلاف المقيمين يحصي المخرجات ذات الدرجات المختلفة؛ راجعها مع مقيم مستقل. لا تُختلق درجات بشرية. راجع الطلبات الناقصة وتغطية التقييم قبل اختيار نموذج.",
	);
	render();
	renderFixture();
}
element("locale").onclick = () => {
	arabic = !arabic;
	localize();
};
select("language").onchange = () => {
	index = 0;
	render();
};
select("partition").onchange = () => {
	index = 0;
	render();
};
select("scope").onchange = () => {
	index = 0;
	render();
};
select("case").onchange = () => {
	index = Number(select("case").value);
	render();
};
element("previous").onclick = () => {
	index--;
	render();
};
element("next").onclick = () => {
	index++;
	render();
};
input("reviewer").onchange = render;
select("dimension").onchange = scorecard;
element("blind-tab").onclick = () => {
	element("fixture-review").hidden = true;
	element("blind").hidden = false;
	element("scorecard").hidden = true;
};
element("reveal").onclick = () => {
	if (!importedRatings || !blindReviewComplete(data.groups, ratings)) {
		status("Complete two independent blind ratings for every output before importing identities.");
		return;
	}
	input("identity-upload").click();
};
input("identity-upload").onchange = async () => {
	const file = input("identity-upload").files?.[0];
	if (!file || !importedRatings || !blindReviewComplete(data.groups, ratings)) return;
	try {
		const privateData = JSON.parse(await file.text()) as ReportData;
		if (
			privateData.reportId !== data.reportId ||
			Object.keys(data.identities).some((id) => !privateData.identities[id])
		)
			throw new Error("IDENTITY_MISMATCH");
		Object.assign(data, privateData);
		revealed = true;
		element("reveal").hidden = true;
		element("scores-tab").hidden = false;
		element("blind").hidden = true;
		element("fixture-review").hidden = true;
		element("scorecard").hidden = false;
		render();
	} catch {
		status("Invalid identity file. Ratings preserved.");
	}
};
element("scores-tab").onclick = () => {
	element("fixture-review").hidden = true;
	element("blind").hidden = true;
	element("scorecard").hidden = false;
	scorecard();
};
element("download").onclick = () => {
	const blob = new Blob([JSON.stringify({ reportId: data.reportId, ratings }, null, 2)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = `a02-ratings-${data.reportId}.json`;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
input("upload").onchange = async () => {
	const file = input("upload").files?.[0];
	if (!file) return;
	try {
		if (file.size > 10000000) throw new Error("RATINGS_TOO_LARGE");
		const imported = parseRatings(JSON.parse(await file.text()), data.reportId, data.identities);
		const merged = new Map(ratings.map((r) => [JSON.stringify([r.outputId, r.reviewer]), r]));
		for (const r of imported) merged.set(JSON.stringify([r.outputId, r.reviewer]), r);
		ratings = [...merged.values()];
		importedRatings = true;
		persist();
		render();
	} catch {
		status(
			text(
				"Invalid ratings JSON or different report. Existing ratings preserved.",
				"ملف غير صالح أو تقرير مختلف. التقييمات الحالية محفوظة.",
			),
		);
	}
	input("upload").value = "";
};
type FixtureReview = { id: string; hash: string; sourceReviewed: boolean; goldReviewed: boolean };
let reviewed: FixtureReview[] = [];
try {
	const stored = JSON.parse(localStorage.getItem(`${storageKey}:fixtures`) ?? "[]") as FixtureReview[];
	reviewed = stored.filter(
		(e) =>
			data.fixtures.some((c) => c.id === e.id && c.hash === e.hash) &&
			typeof e.sourceReviewed === "boolean" &&
			typeof e.goldReviewed === "boolean",
	);
} catch {
	reviewed = [];
}
for (const c of data.fixtures) {
	const option = document.createElement("option");
	option.value = c.id;
	option.textContent = `${c.id} · ${c.difficulty}${c.holdout ? " · held out" : ""}`;
	select("fixture-case").append(option);
}
function renderFixture() {
	const c = data.fixtures.find((c) => c.id === select("fixture-case").value);
	if (!c) return;
	element("fixture-source").textContent = c.input;
	element("fixture-intent").textContent = c.intent;
	element("fixture-gold").textContent = JSON.stringify(
		{
			acceptableOutputs: c.acceptableOutputs,
			controlFailures: data.control.failures.filter((f) => f.id === c.id),
			controlReview: data.controlReview.filter((r) => r.id === c.id),
			knownGuardLimitation: data.control.knownLimitations?.find((r) => r.id === c.id)?.reason ?? null,
			requiredFacts: c.requiredFacts,
			forbiddenClaims: c.forbiddenClaims,
			forbiddenPatterns: c.forbiddenPatterns,
			requiresQuestion: c.requiresQuestion,
			improvementExpected: c.improvementExpected,
			extraction: c.extraction,
		},
		null,
		2,
	);
	const entry = reviewed.find((r) => r.id === c.id && r.hash === c.hash);
	input("source-reviewed").checked = entry?.sourceReviewed ?? false;
	input("gold-reviewed").checked = entry?.goldReviewed ?? false;
	const needed = data.fixtures.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)));
	element("fixture-progress").textContent =
		`${needed.filter((c) => reviewed.some((r) => r.id === c.id && r.hash === c.hash && r.sourceReviewed && r.goldReviewed)).length} / ${needed.length} ${text("Arabic source/gold pairs reviewed", "حالات عربية راجعت مصدرها ومرجعها")}`;
	const rows: (string | number)[][] = [];
	for (const category of new Set(data.fixtures.map((c) => c.category)))
		rows.push([
			category,
			...["ar", "en", "mixed"].map(
				(language) => data.fixtures.filter((c) => c.category === category && c.language === language).length,
			),
		]);
	table("coverage", [text("Coverage", "التغطية"), "AR", "EN", "Mixed"], rows);
}
function saveFixture() {
	const c = required(data.fixtures.find((c) => c.id === select("fixture-case").value));
	reviewed = [
		...reviewed.filter((r) => r.id !== c.id),
		{
			id: c.id,
			hash: c.hash,
			sourceReviewed: input("source-reviewed").checked,
			goldReviewed: input("gold-reviewed").checked,
		},
	];
	try {
		localStorage.setItem(`${storageKey}:fixtures`, JSON.stringify(reviewed));
	} catch {
		status(text("Storage unavailable; export approval before closing.", "التخزين غير متاح؛ صدّر الموافقة قبل الإغلاق."));
	}
	renderFixture();
}
input("source-reviewed").onchange = saveFixture;
input("gold-reviewed").onchange = saveFixture;
select("fixture-case").onchange = renderFixture;
element("fixture-next").onclick = () => {
	const control = select("fixture-case");
	control.selectedIndex = Math.min(control.options.length - 1, control.selectedIndex + 1);
	renderFixture();
};
element("fixture-tab").onclick = () => {
	element("blind").hidden = true;
	element("scorecard").hidden = true;
	element("fixture-review").hidden = false;
	renderFixture();
};
element("approval-download").onclick = () => {
	const reviewer = input("fixture-reviewer").value.trim();
	if (!reviewer) {
		status(text("Enter the Arabic reviewer's name.", "أدخل اسم مراجع العربية."));
		return;
	}
	const approval = {
		version: 1,
		reviewer,
		reviewedAt: new Date().toISOString(),
		fixtures: reviewed.filter((r) => r.sourceReviewed && r.goldReviewed),
	};
	const url = URL.createObjectURL(new Blob([JSON.stringify(approval, null, 2)], { type: "application/json" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = "arabic-approval.json";
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
input("approval-upload").onchange = async () => {
	try {
		const file = input("approval-upload").files?.[0];
		if (!file || file.size > 1000000) throw new Error("INVALID_APPROVAL");
		const raw = JSON.parse(await file.text()) as { version: number; reviewer: string; fixtures: FixtureReview[] };
		if (
			raw.version !== 1 ||
			typeof raw.reviewer !== "string" ||
			!raw.reviewer.trim() ||
			!Array.isArray(raw.fixtures) ||
			raw.fixtures.some(
				(r) =>
					!data.fixtures.some((c) => c.id === r.id && c.hash === r.hash) ||
					r.sourceReviewed !== true ||
					r.goldReviewed !== true,
			)
		)
			throw new Error("INVALID_APPROVAL");
		reviewed = raw.fixtures;
		input("fixture-reviewer").value = raw.reviewer;
		localStorage.setItem(`${storageKey}:fixtures`, JSON.stringify(reviewed));
		renderFixture();
		status(
			text(
				"Approval loaded; verify all required pairs are reviewed.",
				"حُمّلت الموافقة؛ تحقق من مراجعة جميع الحالات المطلوبة.",
			),
		);
	} catch {
		status(
			text(
				"Invalid or stale approval. Existing reviews preserved.",
				"موافقة غير صالحة أو قديمة. المراجعات السابقة محفوظة.",
			),
		);
	}
	input("approval-upload").value = "";
};
localize();
