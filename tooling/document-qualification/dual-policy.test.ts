import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { configureFontReader } from "@reactive-resume/pdf/native";
import { readServerFont } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { expectedDisplayGold } from "./expected-gold";
import { qualificationFixtures } from "./fixtures";
import { qualifyCase } from "./qualify";

it(
	"records both versioned policies against identical saved reader bytes, retaining strict default",
	{ timeout: 60000 },
	async () => {
		configureFontReader(readServerFont);
		const input = qualificationFixtures().find((item) => item.id === "AR03");
		assert(input);
		const directory = await mkdtemp(join(tmpdir(), "t001-round8-policies-"));
		const result = await qualifyCase(input, directory);
		expect(result.policy).toBe("strict v1");
		expect(result.automatedPassByPolicy["strict v1"]).toBe(result.automatedPass);
		for (const reader of result.readers) {
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
