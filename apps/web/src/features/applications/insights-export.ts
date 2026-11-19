import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { getStageColor } from "./stages";

type FunnelExport = {
	rows: readonly { status: ApplicationStatus; label: string; count: number; percentage: number }[];
	sent: number;
	asOf: Date;
	locale: "ar-SA" | "en-US";
};
const escapeXml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

/** SVG images cannot resolve page resources. Include both Arabic and Latin font subsets. */
async function uiFontFaces(families: string[]): Promise<string> {
	const found = new Set<string>();
	const faces: string[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of Array.from(rules)) {
			if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
			const style = (rule as CSSFontFaceRule).style;
			const family = style.getPropertyValue("font-family").replace(/["']/g, "").trim();
			if (!families.includes(family) || (style.getPropertyValue("font-style") || "normal") !== "normal") continue;
			const source = style.getPropertyValue("src").match(/url\(["']?([^"')]+\.(woff2|ttf)(?:\?[^"')]*)?)["']?\)/);
			const url = source?.[1];
			const extension = source?.[2];
			const format = extension === "ttf" ? "truetype" : "woff2";
			if (!url) continue;
			const response = await fetch(new URL(url, sheet.href ?? window.location.href));
			if (!response.ok) throw new Error("Could not load export font");
			const bytes = await response.arrayBuffer();
			if (!bytes.byteLength) throw new Error("Empty export font");
			faces.push(
				`@font-face{font-family:"${family}";font-style:normal;font-weight:${style.getPropertyValue("font-weight") || "400"};src:url(data:font/${extension};base64,${toBase64(bytes)}) format("${format}");unicode-range:${style.getPropertyValue("unicode-range") || "U+0-10FFFF"};}`,
			);
			found.add(family);
		}
	}
	if (families.some((family) => !found.has(family))) throw new Error("Missing Arabic or Latin export font");
	return faces.join("\n");
}

/** Resolves only after a complete PNG starts downloading. Errors remain available to the caller. */
export async function exportFunnelPng(input: FunnelExport): Promise<void> {
	if (!document.fonts) throw new Error("Font loading is unavailable");
	await document.fonts.ready;
	const styles = getComputedStyle(document.documentElement);
	const familyList = styles.getPropertyValue("--font-ui");
	const families = familyList
		.split(",")
		.map((value) => value.trim().replace(/["']/g, ""))
		.filter((value) => value.startsWith("Noto "));
	if (!families.includes("Noto Sans") || !families.includes("Noto Sans Arabic")) throw new Error("Missing UI fonts");
	for (const family of families) {
		const loaded = await document.fonts.load(
			`400 16px "${family}"`,
			`Export تطبيق 0123456789 ${input.rows.map((row) => row.label).join(" ")}`,
		);
		if (!loaded.length) throw new Error("Export fonts are not ready");
	}
	const fontFace = await uiFontFaces(families);
	const markResponse = await fetch("/master-cv/dark.svg");
	if (!markResponse.ok) throw new Error("Could not load the Sirawise export mark");
	const mark = await markResponse.text();
	if (!/<svg\b/.test(mark)) throw new Error("Invalid Sirawise export mark");
	const paint = (name: string) => {
		const value = styles.getPropertyValue(name).trim();
		if (!value) throw new Error(`Missing export paint ${name}`);
		return escapeXml(value);
	};
	const surface = paint("--surface");
	const ink = paint("--ink");
	const muted = paint("--ink-3");
	const track = paint("--raised");
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) throw new Error("PNG canvas is unavailable");
	context.font = `16px ${familyList}`;
	const rtl = input.locale === "ar-SA";
	let y = 112;
	const rows = input.rows
		.map((row) => {
			const lines: string[] = [];
			let line = "";
			for (const word of row.label.split(/\s+/)) {
				const candidate = line ? `${line} ${word}` : word;
				if (line && context.measureText(candidate).width > 500) {
					lines.push(line);
					line = word;
				} else line = candidate;
			}
			if (line) lines.push(line);
			const text = lines
				.map(
					(label, index) =>
						`<text x="${rtl ? 600 : 40}" y="${y + index * 26}" direction="${rtl ? "rtl" : "ltr"}" text-anchor="start" fill="${ink}">${escapeXml(label)}</text>`,
				)
				.join("");
			y += lines.length * 26;
			const bar = `<text x="40" y="${y}" fill="${muted}" direction="ltr" unicode-bidi="isolate">${row.count} / ${input.sent} · ${Math.round(row.percentage)}%</text><rect x="40" y="${y + 14}" width="560" height="8" rx="4" fill="${track}"/><rect x="${rtl ? 600 - 560 * (input.sent ? row.count / input.sent : 0) : 40}" y="${y + 14}" width="${560 * (input.sent ? row.count / input.sent : 0)}" height="8" rx="4" fill="${escapeXml(getStageColor(row.status))}"/>`;
			y += 64;
			return text + bar;
		})
		.join("");
	const height = y + 40;
	const date = formatUiTimestamp(input.asOf, input.locale, { year: "numeric", month: "long", day: "numeric" });
	const title = rtl ? "مراحل الطلبات المرسلة" : "Historical application funnel";
	const population = rtl ? `طلبات مرسلة: ${input.sent}` : `Applications sent: ${input.sent}`;
	const xml = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${height}" viewBox="0 0 640 ${height}"><defs><style>${fontFace}</style></defs><rect width="640" height="${height}" fill="${surface}"/><g font-family="${escapeXml(familyList)}" font-size="16"><text x="${rtl ? 600 : 40}" y="40" direction="${rtl ? "rtl" : "ltr"}" text-anchor="start" fill="${ink}">${title}</text><text x="${rtl ? 600 : 40}" y="72" direction="${rtl ? "rtl" : "ltr"}" text-anchor="start" fill="${muted}">${population} · ${escapeXml(date)}</text>${rows}</g><image href="data:image/svg+xml,${encodeURIComponent(mark)}" x="614" y="${height - 26}" width="18" height="18"/></svg>`;
	const image = new Image();
	image.src = `data:image/svg+xml,${encodeURIComponent(xml)}`;
	await image.decode();
	canvas.width = 640 * 3;
	canvas.height = height * 3;
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const png = canvas.toDataURL("image/png");
	if (!png.startsWith("data:image/png;base64,") || png.length < 30) throw new Error("PNG creation failed");
	const link = document.createElement("a");
	link.download = "pipeline-flow.png";
	link.href = png;
	link.click();
}
