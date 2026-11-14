import { expect, it } from "vite-plus/test";
import { cases, evaluateOutput } from "./corpus";
import recorded from "./lexical-lost-fact-regressions.json";
import { required } from "./required";
import { factPosition } from "./score";

it.each(recorded)("scores recorded lexical retention $caseId / $fact", ({ caseId, fact, output, lost }) => {
	const evaluation = evaluateOutput(required(cases.find((c) => c.id === caseId)), output);
	expect(evaluation.score).not.toBeNull();
	expect(evaluation.score?.lostFacts.includes(fact)).toBe(lost);
});

it.each([
	["سجّلت الاستفسارات، ولم أقرر أهلية التمويل", "لم أقرر أهلية التمويل"],
	["فلم أعتمد الطلبات", "لم أعتمد الطلبات"],
	["العمل بالتمويل وللشركة وكالمشروع", "التمويل"],
	["العمل بالتمويل وللشركة وكالمشروع", "الشركة"],
	["العمل بالتمويل وللشركة وكالمشروع", "المشروع"],
	["ومدد وSAP وOracle", "مدد"],
	["ومدد وSAP وOracle", "SAP"],
	["ومدد وSAP وOracle", "Oracle"],
	["مدرسه فـي مدينه على", "مدرسة في مدينة علي"],
	["إعْدَاد ۱۲ تقريرًا، ١٤٤٣هـ", "اعداد 12 تقريرا 1443 هـ"],
	["2019-04 to 2021-08", "2019/04 to 2021/08"],
	["April 2019–August 2021", "2019-04"],
	["Apr 2019–Aug 2021", "2021-08"],
	["prepared (dispatch) notes", "prepared dispatch notes"],
])("retains orthographic variants: %s / %s", (text, fact) => {
	expect(factPosition(text, fact)).toBeGreaterThanOrEqual(0);
});

it.each([
	["أقرر أهلية التمويل", "لم أقرر أهلية التمويل"],
	["اعتمد الطلبات", "لا اعتمد الطلبات"],
	["راجعت العقود", "ما راجعت العقود"],
	["approved transport fees", "not approved transport fees"],
	["اعتمد فواتير ZATCA", "لم اعتمد فواتير ZATCA"],
	["Oracle", "not Oracle"],
	["دبلوم", "دبلوم أرشفة"],
	["تمويل", "التمويل العقاري"],
	["بلم اعتمد", "لم اعتمد"],
	["ممدد", "مدد"],
	["SAPsquared", "SAP"],
	["transport", "port"],
	["April 2020", "2019-04"],
	["2019-04", "2019-05"],
])("preserves losses, negation and word boundaries: %s / %s", (text, fact) => {
	expect(factPosition(text, fact)).toBe(-1);
});
