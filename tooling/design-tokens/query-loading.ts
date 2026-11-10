import * as ts from "typescript/unstable/ast";
import { parseSource } from "./scan.mjs";

/** Explicit retained indicators: unknown boot shape, mutations, streaming and export actions. Counts prevent silent new uses. */
const actionSpinners: Record<string, { maximum: number; reason: string }> = {
	"components/layout/loading-screen.tsx": {
		maximum: 1,
		reason: "First boot/auth gate: destination and identity unresolved.",
	},
	"dialogs/manager.tsx": { maximum: 1, reason: "Unknown lazy dialog component before its module is available." },
	"routes/builder/letter/-components/letter-bar.tsx": { maximum: 1, reason: "Acknowledged document save action." },
	"features/ats-checker/checker.tsx": { maximum: 2, reason: "File upload/parsing and explicit ATS check actions." },
	"features/assistant/conversation.tsx": { maximum: 2, reason: "AI generation/streaming and tool execution." },
	"features/career/coach-thread.tsx": { maximum: 1, reason: "AI reply streaming." },
	"features/career/workspace/practise.tsx": { maximum: 1, reason: "Recording/transcription action." },
	"features/documents/new-document-dialog.tsx": { maximum: 1, reason: "File upload/import action." },
	"features/settings/ai/providers.tsx": { maximum: 1, reason: "Explicit connection test mutation." },
	"features/resume/share/download-tab.tsx": { maximum: 1, reason: "PDF/DOCX export action." },
	"features/resume/editor/save-status.tsx": { maximum: 1, reason: "Pending autosave mutation." },
	"features/resume/editor/check/writing-tab.tsx": { maximum: 1, reason: "Explicit opt-in AI writing review mutation." },
	"features/resume/editor/check/check-panel.tsx": { maximum: 1, reason: "Explicit local rendered-PDF check action." },
};

export function queryLoadingViolations(source: string, path: string): string[] {
	const file = parseSource(path, source);
	const errors: string[] = [];
	let spinners = 0;
	function visit(node: ts.Node) {
		if (
			ts.isIdentifier(node) &&
			node.getText(file) === "LoadingScreen" &&
			path !== "router.tsx" &&
			path !== "components/layout/loading-screen.tsx"
		)
			errors.push(`${path}: LoadingScreen is reserved for the unknown boot/auth destination; use a query skeleton.`);
		if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(file) === "Spinner")
			spinners++;
		const translated = ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === "Trans";
		const literal = ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
		const text = translated
			? node.children
					.map((child) => child.getText(file))
					.join("")
					.trim()
			: literal
				? node
						.getText(file)
						.replace(/^[`"']|[`"']$/g, "")
						.trim()
				: "";
		// Trans children are checked once at the element level.
		const insideTrans =
			ts.isJsxText(node) &&
			ts.isJsxElement(node.parent) &&
			node.parent.openingElement.tagName.getText(file) === "Trans";
		if (/^Loading(?:\s|[.…]|$)/.test(text) && !insideTrans) {
			let parent: ts.Node | undefined = node.parent;
			let hiddenStatus = path === "dialogs/manager.tsx"; // Unknown lazy module; explicit exception above.
			if (path === "features/career/coach.tsx" && text === "Loading Knowledge before you send…") hiddenStatus = true; // Send-action privacy disclosure, not a content loader.
			while (
				parent &&
				!ts.isFunctionDeclaration(parent) &&
				!ts.isArrowFunction(parent) &&
				!ts.isFunctionExpression(parent)
			) {
				if (ts.isJsxAttribute(parent) && ["label", "loadingMessage"].includes(parent.name.getText(file)))
					hiddenStatus = true;
				if (ts.isJsxAttribute(parent) && parent.name.getText(file) === "aria-label") hiddenStatus = true;
				if (
					ts.isJsxAttribute(parent) &&
					parent.name.getText(file) === "className" &&
					parent.getText(file).includes("sr-only")
				)
					hiddenStatus = true;
				if (ts.isJsxElement(parent) && parent.openingElement.attributes.getText(file).includes('className="sr-only"'))
					hiddenStatus = true;
				if (
					(ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) &&
					/QuerySkeleton|SkeletonBoundary|QueryListState/.test(parent.getText(file).split(">")[0] ?? "")
				)
					hiddenStatus = true;
				parent = parent.parent;
			}
			if (!hiddenStatus)
				errors.push(`${path}: query loading copy must be a hidden skeleton status: ${node.getText(file)}`);
		}
		node.forEachChild(visit);
	}
	visit(file);
	if (spinners > (actionSpinners[path]?.maximum ?? 0))
		errors.push(
			`${path}: ${spinners} unclassified content/action spinners (allowed ${actionSpinners[path]?.maximum ?? 0})`,
		);
	return errors;
}
