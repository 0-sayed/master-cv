import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { extractQualificationPdf } from "./extract";

it.each([
	{ language: "ar", name: "أحمد العتيبي", company: "شركة الأفق", role: "مهندس برمجيات" },
	{ language: "mixed", name: "ليلى الحربي", company: "شركة النور", role: "Software Engineer" },
	{ language: "en", name: "Ada Lovelace", company: "Horizon Systems", role: "Software Engineer" },
])("joins native $language PDF fragments without inserting spaces inside words", async (gold) => {
	const bytes = await readFile(new URL(`./native/${gold.language}.pdf`, import.meta.url));
	const evidence = await extractQualificationPdf(bytes);
	const reader = evidence.find((item) => item.reader === "pdfjs");
	expect(reader?.status).toBe("complete");
	expect(reader?.rawPages?.flatMap((page) => page.items)).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ str: "synthetic@example", dir: "ltr" }),
			expect.objectContaining({ str: ".", dir: "ltr" }),
			expect.objectContaining({ str: "test", dir: "ltr" }),
		]),
	);
	// Chromium's Arabic font maps glyphs to presentation forms; this checks joining only,
	// not qualification equivalence (the gate still compares the unmodified reader text).
	const text = reader?.text.normalize("NFKC").replace(/\s+/gu, " ");
	for (const fact of [gold.name, gold.company, gold.role, "synthetic@example.test", "+966 50 123 4567"])
		expect(text).toContain(fact);
});

it("preserves both failures for malformed bytes", async () => {
	const evidence = await extractQualificationPdf(new TextEncoder().encode("invalid"));
	expect(evidence).toHaveLength(3);
	expect(evidence.every((reader) => reader.status === "failed" && reader.error)).toBe(true);
});
it("a missing independent reader cannot erase PDF.js evidence", async () => {
	const bytes = await readFile(new URL("../../packages/pdf/fixtures/ats/outlined-text.pdf", import.meta.url));
	const evidence = await extractQualificationPdf(bytes, { popplerPath: "/missing/qualification-pdftotext" });
	expect(evidence.find((reader) => reader.reader === "pdfjs")?.status).toBe("complete");
	expect(evidence.find((reader) => reader.reader === "poppler")?.status).toBe("failed");
});

it("rejects an executable claiming the upstream version without the pinned build checksum", async () => {
	const bytes = await readFile(new URL("../../packages/pdf/fixtures/ats/outlined-text.pdf", import.meta.url));
	const directory = await mkdtemp(join(tmpdir(), "reader-impostor-"));
	try {
		const executable = join(directory, "pdftotext");
		await writeFile(
			executable,
			'#!/usr/bin/env node\nconsole.log(process.argv.includes("-v") ? "pdftotext version 22.02.0" : "unqualified text");\n',
			{ mode: 0o755 },
		);
		const evidence = await extractQualificationPdf(bytes, { popplerPath: executable });
		expect(evidence.find((reader) => reader.reader === "poppler")).toMatchObject({ status: "failed" });
		expect(evidence.find((reader) => reader.reader === "poppler")?.error).toMatch(/checksum|toolchain/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
