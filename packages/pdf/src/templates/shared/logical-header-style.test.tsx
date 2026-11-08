import type { StyleInput } from "./styles";
import { expect, it } from "vite-plus/test";
import { createElement } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";
import { renderHostTree } from "../../forme/reconciler";
import { resolveResumeRuntime } from "../../semantic/resolve";
import { mergeStyles } from "./styles";

it("applies logical header semantic box padding and border once", () => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["certifications"], sidebar: [] }];
	data.sections.certifications.items = [
		{
			id: "cert",
			hidden: false,
			title: "Source Certificate",
			issuer: "Institute",
			date: "2030",
			website: { url: "", label: "", inlineLink: false },
			description: "",
		},
	];
	const semanticRuntime = resolveResumeRuntime({
		data,
		template: "onyx",
		source: {
			languageVersion: 1,
			text: '@version 1; template-part[name="item-header-row"] { padding: 10pt; border: 2pt solid #ff0000; }',
		},
	});
	const tree = renderHostTree(createElement(ResumeDocument, { data, template: "onyx", semanticRuntime }));
	let padded = 0;
	let bordered = 0;
	const walk = (node: (typeof tree)[number]) => {
		if ("text" in node) return;
		const style = mergeStyles(node.props.style as StyleInput);
		if (style.paddingTop === 10) padded++;
		if (style.borderTopWidth === 2) bordered++;
		for (const child of node.children) walk(child);
	};
	for (const node of tree) walk(node);
	expect(padded).toBe(1);
	expect(bordered).toBe(1);
});
