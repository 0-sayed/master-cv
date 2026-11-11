import { describe, expect, it } from "vite-plus/test";
import fc from "fast-check";
import { buildExtractedDocument } from "./extract";
import { healthyResume, healthyResumeLines, makeRawExtraction } from "./test-fixtures";

describe("buildExtractedDocument", () => {
	it("clusters spans on the same baseline into one line, in left-to-right order", () => {
		const raw = makeRawExtraction({
			lines: [
				{ text: "Principal Engineer", x: 56, y: 60 },
				{ text: "Jan 2020 - Present", x: 400, y: 60 },
			],
		});

		const [line] = buildExtractedDocument(raw).lines;

		expect(line?.text).toBe("Principal Engineer Jan 2020 - Present");
		expect(line?.spans).toHaveLength(2);
	});

	/**
	 * Geometry must not depend on the order the reader happened to emit items in. Stream order is
	 * measured separately, as inversion; everything else has to be a pure function of the page.
	 */
	it("derives the same lines however the content stream was ordered", () => {
		const baseline = buildExtractedDocument(healthyResume());
		const indices = [...healthyResumeLines.keys()];

		fc.assert(
			fc.property(fc.shuffledSubarray(indices, { minLength: indices.length }), (permutation) => {
				const shuffled = healthyResume({
					streamOrder: (lines) => permutation.map((index) => lines[index]).filter((line) => line !== undefined),
				});

				const document = buildExtractedDocument(shuffled);

				expect(document.fullText).toBe(baseline.fullText);
				expect(document.lines.map((line) => [line.x, line.y, line.width, line.height])).toEqual(
					baseline.lines.map((line) => [line.x, line.y, line.width, line.height]),
				);
			}),
			{ numRuns: 25 },
		);
	});
});

it("reads wholly untagged Arabic spans from right to left", () => {
	const raw = makeRawExtraction({
		lines: [
			{ text: "العتيبي", x: 200, y: 60 },
			{ text: "أحمد", x: 300, y: 60 },
		],
	});
	expect(buildExtractedDocument(raw).lines[0]?.text).toBe("أحمد العتيبي");
});
it("preserves explicitly LTR numeric islands on an untagged Arabic line", () => {
	const raw = makeRawExtraction({
		lines: [
			{ text: "123", x: 50, y: 60 },
			{ text: "456", x: 90, y: 60 },
			{ text: "الهاتف", x: 200, y: 60 },
		],
	});
	const items = raw.pages[0]?.items;
	if (!items) throw new Error("missing fixture");
	for (const item of items.slice(0, 2)) item.dir = "ltr";
	expect(buildExtractedDocument(raw).lines[0]?.text).toBe("الهاتف 123 456");
});

it.each(["Forme (Master CV logical dates v1)", "External ATS fixture"])(
	"uses ordinary geometry regardless of producer: %s",
	(producer) => {
		const raw = makeRawExtraction({
			lines: [
				{ text: "2015", x: 180, y: 60 },
				{ text: "-", x: 165, y: 60 },
				{ text: "2019", x: 135, y: 60 },
				{ text: "مهندس", x: 230, y: 60 },
			],
		});
		for (const item of raw.pages[0]?.items ?? []) item.dir = /[0-9-]/u.test(item.str) ? "ltr" : "rtl";
		raw.metadata.producer = producer;
		expect(buildExtractedDocument(raw).lines[0]?.text.replace(/\s/gu, "")).toBe("مهندس2019-2015");
	},
);

it("keeps ordinary PDF geometry rules without a producer date-order declaration", () => {
	const raw = makeRawExtraction({
		lines: [
			{ text: "2015", x: 180, y: 60 },
			{ text: "-", x: 165, y: 60 },
			{ text: "2019", x: 135, y: 60 },
		],
	});
	expect(buildExtractedDocument(raw).lines[0]?.text.replace(/\s/gu, "")).toBe("2019-2015");
});

it("preserves a compact authored descending range without inferring chronology", () => {
	const raw = makeRawExtraction({
		lines: [{ text: "2019-2015", x: 135, y: 60 }],
	});
	for (const item of raw.pages[0]?.items ?? []) item.dir = "ltr";
	expect(buildExtractedDocument(raw).lines[0]?.text.replace(/\s/gu, "")).toBe("2019-2015");
});
