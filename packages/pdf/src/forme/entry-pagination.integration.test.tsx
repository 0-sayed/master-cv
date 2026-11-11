import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { rasterizePdf } from "../semantic/test/rasterize-pdf";
import { Document, Page, Text, View } from "./primitives";
import { renderResume, renderResumeElement } from "./render";

const section = "page-1/region-main/section-projects";
const item = `${section}/section-items/item-project`;
const projectToken = (index: number) => (index === 0 ? "PROJECTZERO" : "PROJECTONE");
const bodyToken = (index: number, line: number) =>
	`BODY${index === 0 ? "A" : "B"}${String.fromCharCode(65 + Math.floor(line / 26))}${String.fromCharCode(65 + (line % 26))}`;

async function readPages(bytes: Uint8Array) {
	const loading = getDocument({ data: bytes.slice(), useSystemFonts: true });
	try {
		const pdf = await loading.promise;
		return await Promise.all(
			Array.from({ length: pdf.numPages }, async (_, index) =>
				(await (await pdf.getPage(index + 1)).getTextContent()).items
					.flatMap((value) => ("str" in value ? [value.str] : []))
					.join(" "),
			),
		);
	} finally {
		await loading.destroy();
	}
}

it.each(["onyx", "scizor", "ditgar"] as const)(
	"paginates shared project paragraphs and bullets in %s",
	async (template) => {
		for (const locale of ["en-US", "ar-SA"]) {
			const data = structuredClone(defaultResumeData);
			data.picture.hidden = true;
			data.basics.name = locale === "ar-SA" ? "أحمد العتيبي" : "Synthetic Resume";
			data.metadata.template = template;
			data.metadata.page.locale = locale;
			const family = locale === "ar-SA" ? "Noto Sans Arabic" : "Helvetica";
			data.metadata.typography.body = { fontFamily: family, fontWeights: ["400"], fontSize: 10, lineHeight: 1.5 };
			data.metadata.typography.heading = { fontFamily: family, fontWeights: ["700"], fontSize: 14, lineHeight: 1.5 };
			data.metadata.layout.pages = [{ fullWidth: true, main: ["summary", "projects"], sidebar: [] }];
			data.summary.content = Array.from({ length: 28 }, (_, i) => `<p>FILLER_${i}</p>`).join("");
			data.sections.projects.title = "PROJECTS";
			data.sections.projects.items = [4, 65].map((count, index) => ({
				id: `project-${index}`,
				hidden: false,
				name: projectToken(index),
				period: "2020-2024",
				website: { url: "https://example.com", label: "PROJECT_LINK", inlineLink: false },
				description: `<ul>${Array.from({ length: count }, (_, line) => `<li><p>${bodyToken(index, line)} ${locale === "ar-SA" ? "تطوير تطبيقات البرمجيات" : "Software delivery"}</p></li>`).join("")}</ul>`,
			}));
			const result = await act(() => renderResume(forme, { data }));
			const pages = await readPages(result.pdf);
			const pageOf = (token: string) => pages.findIndex((page) => page.includes(token));
			expect(pageOf("PROJECTS")).toBe(pageOf(projectToken(0)));
			for (const index of [0, 1]) {
				expect(pageOf(projectToken(index))).toBeGreaterThanOrEqual(0);
				expect(pageOf(projectToken(index)), `${locale}: ${pages.join("\nPAGE\n")}`).toBe(pageOf(bodyToken(index, 1)));
			}
			expect(pageOf(bodyToken(0, 0))).toBe(pageOf(bodyToken(0, 3)));
			expect(pageOf(bodyToken(1, 0))).toBeLessThan(pageOf(bodyToken(1, 64)));
			const fragments = pages.map((page) => page.match(/BODYB[A-Z]{2}/g)?.length ?? 0).filter(Boolean);
			expect(
				fragments.every((count) => count >= 2),
				`${template}/${locale}: ${fragments}`,
			).toBe(true);
			for (const [index, count] of [4, 65].entries())
				for (let line = 0; line < count; line++) expect(pages.join(" ").split(bodyToken(index, line))).toHaveLength(2);
			expect(result.warnings.filter((warning) => warning.includes("render defect"))).toEqual([]);
		}
	},
);

it("preserves the raster of a single-page resume", async () => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = "Synthetic Resume";
	data.metadata.typography.body.fontFamily = "Helvetica";
	data.metadata.typography.heading.fontFamily = "Helvetica";
	data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
	data.sections.projects.items = [
		{
			id: "short",
			hidden: false,
			name: "PROJECT",
			period: "2020-2024",
			website: { url: "", label: "", inlineLink: false },
			description: "<p>First line.</p><p>Second line.</p>",
		},
	];
	const baseline = await act(() =>
		renderResume(
			{
				renderSerializedDocWithLayout: async (document) => {
					const original = structuredClone(document);
					const stripPagination = (value: unknown) => {
						if (!value || typeof value !== "object") return;
						const object = value as Record<string, unknown>;
						for (const key of ["wrap", "minOrphanLines", "minWidowLines", "breakBefore"]) delete object[key];
						Object.values(object).forEach(stripPagination);
					};
					stripPagination(original);
					return forme.renderSerializedDocWithLayout(original);
				},
			},
			{ data },
		),
	);
	const result = await act(() => renderResume(forme, { data }));
	const before = await rasterizePdf(baseline.pdf);
	const after = await rasterizePdf(result.pdf);
	expect(after).toHaveLength(1);
	expect(after).toEqual(before);
});

it.each([
	{ language: "en-US", heading: true, lines: 4 },
	{ language: "ar-SA", heading: true, lines: 4 },
	{ language: "en-US", heading: false, lines: 4 },
	{ language: "ar-SA", heading: false, lines: 4 },
	{ language: "en-US", heading: true, lines: 35 },
	{ language: "ar-SA", heading: true, lines: 35 },
])(
	"keeps entry openings together ($language, heading=$heading, lines=$lines)",
	async ({ language, heading, lines }) => {
		const result = await act(() =>
			renderResumeElement(
				forme,
				<Document language={language}>
					<Page size={{ width: 300, height: 300 }} style={{ padding: 10, fontSize: 10, lineHeight: 1.5 }}>
						<View style={{ height: 215 }} />
						<View data-resume-node={section}>
							{heading && <Text data-resume-node={`${section}/section-heading`}>PROJECTS</Text>}
							<View data-resume-node={item}>
								<View data-resume-node={`${item}/item-header`}>
									<Text>TITLE</Text>
									<Text>SUBTITLE</Text>
								</View>
								<Text>{Array.from({ length: lines }, (_, index) => `BODY_${index + 1}`).join("\n")}</Text>
							</View>
						</View>
					</Page>
				</Document>,
			),
		);
		const loading = getDocument({ data: result.pdf.slice(), useSystemFonts: true });
		try {
			const pdf = await loading.promise;
			const pages = await Promise.all(
				Array.from({ length: pdf.numPages }, async (_, i) =>
					(await (await pdf.getPage(i + 1)).getTextContent()).items
						.flatMap((x) => ("str" in x ? [x.str] : []))
						.join(" "),
				),
			);
			if (lines === 4) expect(pages).toHaveLength(2);
			for (const token of [
				...(heading ? ["PROJECTS"] : []),
				"TITLE",
				"SUBTITLE",
				"BODY_1",
				"BODY_2",
				...(lines === 4 ? ["BODY_4"] : []),
			])
				expect(pages.findIndex((p) => p.includes(token))).toBe(1);
		} finally {
			await loading.destroy();
		}
	},
);

it.each([false, true])("keeps two lines per entry fragment (separate paragraphs=%s)", async (separate) => {
	const result = await act(() =>
		renderResumeElement(
			forme,
			<Document>
				<Page size={{ width: 300, height: 300 }} style={{ padding: 10, fontSize: 10, lineHeight: 1.5 }}>
					<View style={{ height: 245 }} />
					<View data-resume-node={item}>
						<View data-resume-node={`${item}/item-header`}>
							<Text>TITLE</Text>
							<Text>SUBTITLE</Text>
						</View>
						{separate ? (
							Array.from({ length: 35 }, (_, i) => (
								<Text
									key={i}
									data-resume-node={`${item}/field-description/rich-text-description/p-${i}`}
								>{`LINE_${String(i).padStart(2, "0")}`}</Text>
							))
						) : (
							<Text>{Array.from({ length: 35 }, (_, i) => `LINE_${String(i).padStart(2, "0")}`).join("\n")}</Text>
						)}
					</View>
				</Page>
			</Document>,
		),
	);
	const loading = getDocument({ data: result.pdf.slice(), useSystemFonts: true });
	try {
		const pdf = await loading.promise;
		const pages = await Promise.all(
			Array.from({ length: pdf.numPages }, async (_, i) =>
				(await (await pdf.getPage(i + 1)).getTextContent()).items.flatMap((x) => ("str" in x ? [x.str] : [])).join(" "),
			),
		);
		expect(pages.findIndex((p) => p.includes("TITLE"))).toBe(pages.findIndex((p) => p.includes("LINE_01")));
		expect(pages.findIndex((p) => p.includes("SUBTITLE"))).toBe(pages.findIndex((p) => p.includes("TITLE")));
		const counts = pages.map((p) => p.match(/LINE_\d+/g)?.length ?? 0).filter(Boolean);
		expect(counts.length).toBeGreaterThan(1);
		expect(
			counts.every((count) => count >= 2),
			JSON.stringify(counts),
		).toBe(true);
		expect(counts.reduce((a, b) => a + b, 0)).toBe(35);
	} finally {
		await loading.destroy();
	}
});
