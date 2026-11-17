// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vite-plus/test";
import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { i18n } from "@lingui/core";
import { createSemanticCssEditorExtensions, revealStyleRule } from "./editor-extensions";
import { getUiLocaleMessages } from "@/libs/locale";

const views: EditorView[] = [];

afterEach(() => {
	for (const view of views.splice(0)) view.destroy();
});

describe("Semantic CSS editor extensions", () => {
	it("labels the color action in the interface language", async () => {
		i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
		const parent = document.createElement("div");
		document.body.append(parent);
		const view = new EditorView({
			parent,
			doc: "red",
			extensions: createSemanticCssEditorExtensions({
				metadata: {
					semanticTree: { key: "resume", kind: "resume", attributes: {}, roles: [], children: [] },
					templateParts: [],
				},
				colorTokens: [{ from: 0, to: 3, value: "red" }],
				onColorSelect: () => {},
			}),
		});
		views.push(view);
		expect(parent.querySelector("button.semantic-css-color-swatch")?.getAttribute("aria-label")).toBe(
			"تعديل اللون red",
		);
		openSearchPanel(view);
		expect(parent.querySelector('input[name="search"]')?.getAttribute("aria-label")).not.toBe("Find");
		expect(parent.querySelector(".cm-search")?.textContent).not.toMatch(/match case|regexp|by word|replace all/);
		parent.remove();
	});
	it("adds a rule for a picked element once, then moves the cursor into it", () => {
		const view = new EditorView({ doc: "header { color: red; }" });
		views.push(view);
		const target = { selector: 'section[id="experience"] item[id="a"]', label: "Experience › Lead */ dev" };

		revealStyleRule(view, target);
		expect(view.state.doc.toString()).toBe(
			'header { color: red; }\n\n/* Experience › Lead *\\/ dev */\nsection[id="experience"] item[id="a"] {\n\t\n}\n',
		);
		const inside = view.state.selection.main.head;
		expect(view.state.doc.sliceString(inside - 1, inside + 2)).toBe("\t\n}");

		view.dispatch({ selection: { anchor: 0 } });
		revealStyleRule(view, target);
		expect(view.state.doc.toString().match(/item\[id="a"\]/g)).toHaveLength(1);
		expect(view.state.selection.main.head).toBe(inside);
	});
});
