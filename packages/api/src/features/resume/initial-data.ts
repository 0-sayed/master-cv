import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Locale } from "@reactive-resume/utils/locale";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { getDefaultFontPairing } from "@reactive-resume/schema/resume/font-policy";
import { createSampleResumeData } from "@reactive-resume/schema/resume/sample";
import { EMPTY_SEMANTIC_CSS_SOURCE } from "@reactive-resume/schema/resume/stylesheet";

type CreateResumeDataOptions = {
	withSampleData?: boolean;
	/** The person the resume is for, printed as its name: the account holder's name, not the document's. */
	name?: string;
	locale?: Locale;
	empty?: boolean;
};

export function createResumeData(options: CreateResumeDataOptions): ResumeData {
	const data = structuredClone(
		options.withSampleData && !options.empty ? createSampleResumeData(undefined, options.locale) : defaultResumeData,
	);

	const name = options.name?.trim();
	if (name && !options.empty) data.basics.name = name;
	if (options.locale) data.metadata.page.locale = options.locale;
	const pairing = getDefaultFontPairing(data.metadata.page.locale);
	data.metadata.typography.body.fontFamily = pairing.body;
	data.metadata.typography.body.fontWeights = ["400", "700"];
	data.metadata.typography.heading.fontFamily = pairing.heading;
	data.metadata.typography.heading.fontWeights = [pairing.headingWeight];
	data.metadata.stylesheet = {
		mode: "semantic",
		source: { languageVersion: 1, text: EMPTY_SEMANTIC_CSS_SOURCE },
	};

	return data;
}
