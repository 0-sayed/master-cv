import { expect, it } from "vite-plus/test";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import { createDemoFixture } from "./demo-fixture";

it("keeps data-check totals consistent across the 15 synthetic seeded resumes", () => {
	const now = new Date("2026-11-18T12:00:00Z");
	const fixture = createDemoFixture(now);
	const tailoredApplications = fixture.applicationScenarios.filter((scenario) => scenario.resumeGroup === "tailored");
	// The first tailored application uses the tailored fixture. Later applications copy the English CV.
	const copies = tailoredApplications.slice(1).map(() => structuredClone(fixture.resumes[1]));
	const resumes = [...fixture.resumes, ...copies, ...fixture.showcaseResumes.map((resume) => resume.data)];
	expect(resumes).toHaveLength(15);
	for (const data of resumes) {
		const report = lintResumeForAts(data, { now });
		expect(Object.values(report.counts).reduce((sum, count) => sum + count, 0)).toBe(report.findings.length);
		expect(Object.values(report.categories).reduce((sum, category) => sum + category.total, 0)).toBe(report.totalRules);
		expect(Object.values(report.categories).reduce((sum, category) => sum + category.passed, 0)).toBe(
			report.passedRules,
		);
		expect(report.score).toBe(Math.round((report.passedRules / report.totalRules) * 100));
	}
});
