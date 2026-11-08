import config from "./vitest.config";

// Qualification and individually reviewed reader limitations are report-only in CI.
export default {
	...config,
	test: {
		...config.test,
		include:
			process.env.DOCUMENT_REGRESSIONS === "1"
				? ["document-qualification/{month-ranges,nested-ranges,round10-headers,round9-display}.test.ts"]
				: ["document-qualification/run.qualification.ts"],
		exclude: process.env.DOCUMENT_REGRESSIONS === "1" ? ["**/run.qualification.ts"] : [],
		passWithNoTests: false,
	},
};
