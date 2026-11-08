import { describe, expect, it } from "vite-plus/test";
import { act } from "react";
import { Document, Link, Page, Text } from "./primitives";
import { renderHostTree } from "./reconciler";
import { toFormeDocument } from "./to-forme";

type SerializedNode = {
	kind: { type: string; runs?: { content: string; style: Record<string, unknown> }[] };
	style: Record<string, unknown>;
	children: SerializedNode[];
};

describe("toFormeDocument", () => {
	// Forme's Text paints no background, border or padding, so a section heading drawn as a filled bar or an underlined
	// title vanished whenever its icon (which made it a box) was hidden.
	it("puts a text's background, border and padding on a box around it", () => {
		const tree = renderHostTree(
			<Document>
				<Page>
					<Text style={{ backgroundColor: "#24346E", borderBottomWidth: 1, paddingTop: 4, color: "#ffffff" }}>Bar</Text>
				</Page>
			</Document>,
		);
		const { document } = toFormeDocument(tree) as unknown as { document: { children: SerializedNode[] } };
		const [box] = document.children[0]?.children ?? [];

		expect(box?.kind.type).toBe("View");
		expect(box?.style).toMatchObject({ backgroundColor: expect.anything(), padding: { top: 4 } });
		expect(box?.style).toHaveProperty("borderWidth");
		expect(box?.children[0]?.kind.type).toBe("Text");
		expect(box?.children[0]?.style).not.toHaveProperty("backgroundColor");
		expect(box?.children[0]?.style).toHaveProperty("color");
	});
});

it.each([
	{ fitted: undefined, childSize: 9, expected: 9 },
	{ fitted: undefined, childSize: 18, expected: 18 },
	{ fitted: 8, childSize: 9, expected: 8 },
])(
	"preserves contact sizing and applies measured website fitting ($fitted/$childSize)",
	async ({ fitted, childSize, expected }) => {
		const tree = await act(() =>
			renderHostTree(
				<Document language="ar-SA">
					<Page style={{ fontSize: 12 }}>
						<Link src="https://example.test" data-export-no-wrap>
							<Text style={{ fontSize: childSize }}>site</Text>
						</Link>
					</Page>
				</Document>,
			),
		);
		const { document } = toFormeDocument(tree, {
			noWrapFontSizes: fitted === undefined ? new Map() : new Map([[0, fitted]]),
		}) as unknown as { document: { children: SerializedNode[] } };
		const nodes = (node: SerializedNode): SerializedNode[] => [node, ...(node.children ?? []).flatMap(nodes)];
		const text = document.children.flatMap(nodes).find((node) => node.kind.type === "Text");
		expect(text?.kind.runs?.find((run) => run.content === "site")?.style.fontSize).toBe(expected);
	},
);
