import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect } from "vite-plus/test";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { expectedExportTextDisplay } from "./expected-display";
import { extractQualificationPdf } from "./extract";
import { validateManifest } from "./manifest";
import { regressionIt } from "./regression-status";
// Opened Round 6 inputs are development regressions. Meowth numbered employers remain red (NEW-R3).
const cases = validateManifest(
	JSON.parse(await readFile(new URL("./fixtures/holdout-2.json", import.meta.url), "utf8")),
);

for (const input of cases)
	regressionIt(
		`preserves nested histories and date associations: ${input.id} ${input.language} ${input.data.metadata.template}`,
	)(
		`preserves nested histories and date associations: ${input.id} ${input.language} ${input.data.metadata.template}`,
		{ timeout: 60000 },
		async () => {
			const snapshot = structuredClone(input.data);
			const file = await act(() => createResumePdfFile({ data: input.data, filename: "nested.pdf" }));
			const bytes = new Uint8Array(await file.arrayBuffer());
			if (process.env.NESTED_OUTPUT) {
				await mkdir(process.env.NESTED_OUTPUT, { recursive: true });
				await writeFile(`${process.env.NESTED_OUTPUT}/${input.id}.pdf`, bytes);
			}
			const readers = await extractQualificationPdf(bytes);
			if (process.env.NESTED_OUTPUT)
				await writeFile(`${process.env.NESTED_OUTPUT}/${input.id}.json`, JSON.stringify(readers, null, 2));
			const gold = structuredClone(input.gold);
			gold.fields = gold.fields.map((field) => ({ ...field, value: expectedExportTextDisplay(field.value) }));
			// D32 does not require extraction order of endpoints within an associated entry.
			const dates = new Set([
				"job-start",
				"job-end",
				"promotion",
				"senior-end",
				"junior-start",
				"junior-end",
				"old-start",
				"old-end",
				"education-start",
			]);
			gold.order = gold.order.filter(([a, b]) => !dates.has(a) && !dates.has(b));
			for (const reader of readers.filter((x) => x.reader !== "poppler-layout")) {
				expect(reader.status).toBe("complete");
				const result = compareQualification(gold, reader.text);
				expect
					.soft(
						result.missing.filter((id) => !["hijri-raw", "gregorian-raw", "skill"].includes(id)),
						reader.reader,
					)
					.toEqual([]);
				expect.soft(result.orderFailures, reader.reader).toEqual([]);
				expect.soft(result.associationFailures, reader.reader).toEqual([]);
			}
			expect(input.data).toEqual(snapshot);
		},
	);
