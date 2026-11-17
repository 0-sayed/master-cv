import { glob, readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import * as ts from "typescript/unstable/ast";
import { closeParser, parseSource } from "../design-tokens/scan.mjs";

async function catalog(locale: "ar-SA" | "en-US") {
	return formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
		locale,
		sourceLocale: "en-US",
		filename: `${locale}.po`,
	});
}

it("extracts and translates toast text and conditional action labels", async () => {
	const catalogs = await Promise.all([catalog("en-US"), catalog("ar-SA")]);
	const problems: string[] = [];
	const root = new URL("../../apps/web/src/", import.meta.url);
	for await (const path of glob("**/*.{ts,tsx}", { cwd: root })) {
		if (/\.(test|spec)\./u.test(path)) continue;
		const text = await readFile(new URL(path, root), "utf8");
		if (!text.includes("toast.add")) continue;
		const source = parseSource(path, text);
		const inspectValue = (value: ts.Node) => {
			if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
				problems.push(`${path}: unlocalized toast text ${value.text}`);
			else if (
				ts.isTaggedTemplateExpression(value) &&
				value.tag.getText(source) === "t" &&
				ts.isNoSubstitutionTemplateLiteral(value.template)
			) {
				const text = value.template.text;
				for (const [index, messages] of catalogs.entries()) {
					const message = Object.values(messages).find((entry) => !entry.obsolete && entry.message === text);
					if (!message?.translation?.trim() || (index === 1 && !/\p{Script=Arabic}/u.test(message.translation)))
						problems.push(`${path}: missing ${index === 1 ? "Arabic" : "English"} toast text ${text}`);
				}
			} else if (ts.isConditionalExpression(value)) {
				inspectValue(value.whenTrue);
				inspectValue(value.whenFalse);
			}
		};
		const inspectText = (node: ts.Node) => {
			if (
				ts.isPropertyAssignment(node) &&
				["title", "description", "children", "label"].includes(node.name.getText(source))
			)
				inspectValue(node.initializer);
			node.forEachChild(inspectText);
		};
		const visit = (node: ts.Node) => {
			if (ts.isCallExpression(node) && node.expression.getText(source) === "toast.add")
				for (const argument of node.arguments) inspectText(argument);
			node.forEachChild(visit);
		};
		visit(source);
	}
	closeParser();
	expect(problems).toEqual([]);
});

it("uses English source identities and complete English/Arabic interface catalogs", async () => {
	for (const locale of ["en-US", "ar-SA"] as const) {
		const active = Object.values(await catalog(locale)).filter((message) => !message.obsolete);
		expect(active.filter((message) => !message.translation?.trim()).map((message) => message.message)).toEqual([]);
		expect(active.filter((message) => /\p{Script=Arabic}/u.test(message.message ?? ""))).toEqual([]);
		if (locale === "en-US")
			expect(active.filter((message) => /\p{Script=Arabic}/u.test(message.translation ?? ""))).toEqual([]);
	}
});

it("localizes audited labels while preserving product names and CSV separators", async () => {
	const messages = Object.values(await catalog("ar-SA"));
	for (const source of ["Edited text", "Your information", "Loading", "Template not found", "Markdown (.md)"])
		expect(messages.find((message) => message.message === source)?.translation, source).toMatch(/\p{Script=Arabic}/u);
	expect(messages.find((message) => message.context?.startsWith("US Letter paper size"))?.translation).toBe(
		"مقاس Letter الأمريكي",
	);
	expect(messages.find((message) => message.message === "Company,Role,Stage,…")?.translation).toBe(
		"الشركة,الوظيفة,المرحلة,…",
	);
	// The retired upstream landing's fixture names (Fieldnote, Figma, WCAG 2.1 AA) left the catalog with it.
	for (const name of ["Claude Desktop"])
		expect(messages.find((message) => message.message === name)?.translation, name).toBe(name);
});
