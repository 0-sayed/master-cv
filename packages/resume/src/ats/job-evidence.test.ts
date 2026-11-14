import { expect, it } from "vite-plus/test";
import { jobTermReportSchema } from "@reactive-resume/schema/job-evidence";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { analyzeJobTerms, buildJobPassages, JOB_NORMALIZATION_VERSION, JOB_RUBRIC_VERSION } from "./job-evidence";

const identity = {
	resumeId: "cv",
	resumeRevision: "r1",
	contentHash: "h1",
	jobId: "job",
	jobRevision: "j1",
	rubricVersion: "literal-v1",
	normalizationVersion: "matching-v2",
};
const passage = (text: string, id = "summary") => ({ id, target: { sectionId: "summary", field: "content" }, text });

it("reports distinct literal React/SAP coverage without inferring ability", () => {
	const report = analyzeJobTerms({ identity, jobText: "React, SAP", passages: [passage("React")] });
	expect(report).toMatchObject({ state: "complete", denominator: 2, matchedCount: 1, unmatchedCount: 1 });
	expect(report.terms.map((term) => [term.term, term.matched])).toEqual([
		["react", true],
		["sap", false],
	]);
	expect(jobTermReportSchema.parse(report)).toEqual(report);
	expect(
		analyzeJobTerms({ identity, jobText: "React, REACT.js, react, SAP, sap", passages: [passage("React")] })
			.denominator,
	).toBe(2);
	expect(
		analyzeJobTerms({ identity, jobText: "React, SAP", passages: [passage("No React experience")] }).matchedCount,
	).toBe(1);
});

it("keeps empty and unusable jobs unknown and discloses selection limits", () => {
	expect(analyzeJobTerms({ identity, jobText: "", passages: [] })).toMatchObject({
		state: "not-checked",
		denominator: 0,
	});
	expect(analyzeJobTerms({ identity, jobText: "and the 123", passages: [] })).toMatchObject({
		state: "not-checkable",
		denominator: 0,
	});
	const report = analyzeJobTerms({
		identity,
		jobText: Array.from({ length: 70 }, (_, n) => `tech${String(n).padStart(2, "0")}`).join(", "),
		passages: [],
	});
	expect(report.denominator).toBe(35);
	expect(report.selection).toMatchObject({ limit: 35, truncated: true });
	expect(report.exclusions).toContain("ranked-selection-not-all-requirements");
});

it.each([
	["React.js, C++, C#", "😀 REACT, C++, C#"],
	["إِدَارَة, تحليل", "😀 إِدَارَة وتحليل"],
	["مهارة١٢, مـهارة", "مهارة12، مهارة"],
	["ﬁnance, Ｒｅａｃｔ, café", "finance; React; café"],
	["React, React", "“React” — React"],
])("retains original UTF-16 offsets across normalization: %s", (jobText, text) => {
	const report = analyzeJobTerms({ identity, jobText, passages: [passage(text)] });
	expect(report.matchedCount).toBeGreaterThan(0);
	for (const term of report.terms) {
		expect(term.jobSpans.length).toBeGreaterThan(0);
		for (const span of term.jobSpans) expect(jobText.slice(span.start, span.end)).toBe(span.quote);
		for (const span of term.cvSpans) expect(text.slice(span.start, span.end)).toBe(span.quote);
	}
});

it("excludes contact, hidden and unplaced content from selected CV evidence", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.email = "SAP@example.test";
	data.summary.content = "<p>React</p>";
	data.summary.hidden = false;
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const passages = buildJobPassages(data);
	expect(passages.map((p) => p.text).join(" ")).toContain("React");
	expect(passages.map((p) => p.text).join(" ")).not.toContain("SAP");
	data.basics.headline = "Engineer";
	expect(buildJobPassages(data).find((p) => p.target.sectionId === "summary")?.id).toBe(passages[0]?.id);
	data.basics.headline = "";
	data.summary.hidden = true;
	expect(buildJobPassages(data)).toEqual([]);
});

it("rejects false policy identity and duplicate passage/target inventory", () => {
	const valid = { ...identity, rubricVersion: JOB_RUBRIC_VERSION, normalizationVersion: JOB_NORMALIZATION_VERSION };
	expect(() =>
		analyzeJobTerms({ identity: { ...valid, normalizationVersion: "wrong" }, jobText: "React", passages: [] }),
	).toThrow();
	expect(() =>
		analyzeJobTerms({ identity: valid, jobText: "React", passages: [passage("React"), passage("SAP")] }),
	).toThrow();
});
