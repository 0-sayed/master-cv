import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi, afterEach } from "vite-plus/test";
import { configureFontReader } from "@reactive-resume/pdf/native";
import { readServerFont } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { expectedDisplayGold } from "./expected-gold";
import * as extraction from "./extract";
import { qualificationFixtures } from "./fixtures";
import { qualifyCase } from "./qualify";

afterEach(() => vi.restoreAllMocks());
const extractPdf = extraction.extractQualificationPdf;
it.each([false, true])(
	"records both versioned policies against identical saved reader bytes, retaining strict default (diagnostic fails: %s)",
	{ timeout: 60000 },
	async (failDiagnostic) => {
		if (failDiagnostic)
			vi.spyOn(extraction, "extractQualificationPdf").mockImplementation(async (bytes) =>
				(await extractPdf(bytes)).map((reader) =>
					reader.reader === "poppler-layout"
						? { ...reader, status: "failed" as const, text: "", error: "controlled diagnostic failure" }
						: reader,
				),
			);
		configureFontReader(readServerFont);
		const input = qualificationFixtures().find((item) => item.id === "AR03");
		assert(input);
		const directory = await mkdtemp(join(tmpdir(), "t001-round8-policies-"));
		const result = await qualifyCase(input, directory);
		expect(result.policy).toBe("strict v1");
		expect(result.automatedPassByPolicy["strict v1"]).toBe(result.automatedPass);
		for (const reader of result.readers) {
			if (reader.status === "failed") {
				expect(reader.reader).toBe("poppler-layout");
				expect(reader.comparison).toBeNull();
				for (const comparison of Object.values(reader.comparisons)) expect(comparison).toBeNull();
				continue;
			}
			expect(reader.comparisons["strict v1"]).toEqual(compareQualification(input.gold, reader.text));
			expect(reader.comparisons["fact-level v2"]).toEqual(
				compareQualification(input.gold, reader.text, "fact-level v2"),
			);
			expect(reader.comparisons["fact-level v2.1"]).toEqual(
				compareQualification(expectedDisplayGold(input), reader.text, "fact-level v2.1"),
			);
			expect(reader.comparison).toEqual(reader.comparisons["strict v1"]);
		}
		expect(JSON.parse(await readFile(join(directory, `${input.id}.json`), "utf8"))).toEqual(result);
	},
);
