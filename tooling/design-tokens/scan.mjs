import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

// TypeScript 7 ships its parser through the native API. All files/configuration are
// virtual: the checker never writes source or starts a project typecheck.
let parser;
let virtualSource = "";
let snapshot;
const virtualRoot = "/__master_cv_design_tokens__";
export function closeParser() {
	snapshot?.dispose();
	snapshot = undefined;
	parser?.close();
	parser = undefined;
}
export function parseSource(file, source) {
	const virtualFile = `${virtualRoot}/source.${/\.[jt]sx$/.test(file) ? "tsx" : "ts"}`;
	virtualSource = source;
	if (!parser)
		parser = new API({
			fs: {
				readFile: (name) =>
					name === `${virtualRoot}/tsconfig.json`
						? JSON.stringify({
								compilerOptions: { noLib: true, noResolve: true, jsx: "preserve" },
								files: ["source.ts", "source.tsx"],
							})
						: name === `${virtualRoot}/source.ts` || name === `${virtualRoot}/source.tsx`
							? virtualSource
							: name.startsWith(virtualRoot)
								? null
								: undefined,
				fileExists: (name) =>
					name.startsWith(virtualRoot)
						? ["tsconfig.json", "source.ts", "source.tsx"].some((suffix) => name === `${virtualRoot}/${suffix}`)
						: undefined,
				directoryExists: (name) => (name.startsWith(virtualRoot) ? name === virtualRoot : undefined),
			},
		});
	snapshot?.dispose();
	parser.clearSourceFileCache();
	snapshot = parser.updateSnapshot(
		snapshot ? { fileChanges: { invalidateAll: true } } : { openProjects: [`${virtualRoot}/tsconfig.json`] },
	);
	const tree = snapshot.getProject(`${virtualRoot}/tsconfig.json`).program.getSourceFile(virtualFile);
	if (!tree) throw new Error(`TypeScript could not parse ${file}`);
	return tree;
}
const isStringLiteralLike = (node) => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

const absoluteLength = /(?:(?:\d*\.)?\d+|\$\{[^}]+\})(?:px|rem|em)\b/i;
const sharedControlNames = new Set([
	"Button",
	"IconButton",
	"Input",
	"Textarea",
	"NativeSelect",
	"SegmentedControl",
	"SegmentedControlItem",
	"Switch",
	"Checkbox",
	"RadioGroupItem",
	"InputGroupInput",
	"InputGroupTextarea",
	"InputGroupButton",
]);
const controlOverride =
	/^(?:(?:(?:min-|max-)?h|size)-(?:\d+(?:\.\d+)?|px|auto|full|min|max|fit)|p[xysetblr]?-(?:\d+(?:\.\d+)?|px)|rounded(?:-[setblr]{1,2})?-(?:none|sm|md|lg|xl|\d+xl|full))$/;
const typeClass =
	/^(?:text-(?:xs|sm|base|lg|xl|\d+xl)(?:\/[^\s]+)?|leading-(?!\(--)[\w.[-]+|tracking-(?:tight|tighter|wide|wider|widest|\[.*\]))$/;
const namedColor =
	/^(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)$/i;
const stockColor =
	/^(?:bg|text|border(?:-[trblsexy])?|ring|outline|fill|stroke|from|via|to|shadow)-(?:black|white|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?:\/[^\s]+)?$/;
const geometryProperty =
	/^(?:fontSize|font-size|lineHeight|line-height|letterSpacing|letter-spacing|(?:min|max)?(?:Width|Height)|width|height|(?:min|max)-(?:width|height)|(?:padding|margin|gap|rowGap|columnGap|borderRadius|borderWidth|top|right|bottom|left|inset)(?:[A-Z][a-z]*)*|(?:padding|margin|gap|inset|border)-(?:[\w-]+)|gridTemplateColumns|grid-template-columns|transform|translate)$/;
const typeProperty = /^(?:fontSize|font-size|lineHeight|line-height|letterSpacing|letter-spacing)$/;
const replacement = {
	color:
		"Use semantic ink/accent/warn/danger tokens or var(--token); preserve document/provider colors with an exact reviewed exception.",
	typography:
		"Use type-body/type-label/type-metadata/type-section/type-title-s/type-title (nav: type-nav); remove separate font-size/leading/tracking.",
	geometry:
		"Use named --space-*, radius-control/card/dialog/sheet, control or layout tokens; define approved geometry centrally.",
	"dynamic-class": "Use complete static role/token classes instead of constructing class names dynamically.",
	"control-override":
		"Use the shared control size/variant API; keep height, padding and radius inside its owning component.",
};

// Preserve offsets while ignoring CSS comments. String contents, including URLs, remain intact.
function maskComments(source) {
	let quote = "";
	let result = "";
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (quote) {
			result += char;
			if (char === "\\") result += source[++i] ?? "";
			else if (char === quote) quote = "";
		} else if (char === '"' || char === "'") {
			quote = char;
			result += char;
		} else if (char === "/" && source[i + 1] === "*") {
			result += "  ";
			i += 2;
			while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
				result += source[i] === "\n" ? "\n" : " ";
				i++;
			}
			result += "  ";
			i++;
		} else result += char;
	}
	return result;
}

// Split only at delimiters outside bracket values, functions and quotes.
export function splitBalanced(value, delimiter) {
	const result = [];
	let depth = 0;
	let quote = "";
	let start = 0;
	for (let i = 0; i < value.length; i++) {
		const char = value[i];
		if (char === "\\") {
			i++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = "";
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char === "[" || char === "(" || char === "{") depth++;
		else if (char === "]" || char === ")" || char === "}") depth--;
		else if (depth === 0 && delimiter.test(char)) {
			if (i > start) result.push({ value: value.slice(start, i), offset: start });
			start = i + 1;
		}
	}
	if (start < value.length) result.push({ value: value.slice(start), offset: start });
	return result;
}

function rawColor(value, namedAnywhere = false) {
	const cleaned = value
		.replace(/url\((?:[^)"']|"[^"]*"|'[^']*')*\)/gi, "")
		.replace(/https?:\/\/[^\s"']+/gi, "")
		.replace(/&#(?:x[\da-f]+|\d+);/gi, "");
	return (
		/(?:^|[^\w&#])#[\da-f]{3,8}(?![\da-f\w])/i.test(cleaned) ||
		/\b(?:rgba?|hsla?|oklch|oklab|lch|lab|hwb|color)\(/i.test(cleaned) ||
		namedColor.test(cleaned.trim()) ||
		((namedAnywhere || /gradient\(/.test(cleaned)) && cleaned.split(/[^a-z-]+/i).some((word) => namedColor.test(word)))
	);
}

function classKind(token) {
	if (/^(?:https?:\/\/|url\(|&#)/i.test(token)) return undefined;
	const segments = splitBalanced(token, /:/);
	const base = segments.at(-1)?.value.replace(/^!|!$/g, "").replace(/^-/, "") ?? "";
	if (stockColor.test(base) || (/[#[(]/.test(base) && rawColor(base, true))) return "color";
	if (typeClass.test(base)) return "typography";
	if (/^(?:text|leading|tracking)-\[/.test(base) && !/\[.*(?:var\(|--)/.test(base)) return "typography";
	if (base.includes("[") && absoluteLength.test(base)) return "geometry";
	if (/^(?:text|leading|tracking|bg|rounded|[pm][xysetblr]?|[wh]|size)-.*\$\{/.test(base)) return "dynamic-class";
	return undefined;
}

export function collectFindings(file, source) {
	const findings = [];
	function add(context, literal, kind, offset) {
		findings.push({
			file,
			context,
			literal,
			kind,
			line: source.slice(0, Math.max(0, offset)).split("\n").length,
			replacement: replacement[kind],
		});
	}
	function scanValue(value, context, offset, property = "") {
		const tokens = splitBalanced(value, /\s/);
		let matched = false;
		for (const token of tokens) {
			const kind = classKind(token.value);
			if (kind) {
				add(context, token.value, kind, offset + token.offset);
				matched = true;
			}
		}
		if (!matched && rawColor(value, Boolean(property))) add(context, value, "color", offset);
		else if (!matched && (geometryProperty.test(property) || property.startsWith("--")) && absoluteLength.test(value))
			add(context, value, typeProperty.test(property) ? "typography" : "geometry", offset);
		else if (!matched && typeProperty.test(property) && /\d/.test(value) && !value.includes("var("))
			add(context, value, "typography", offset);
	}
	function css(text, prefix = "", baseOffset = 0) {
		const clean = maskComments(text);
		const stack = [];
		let start = 0;
		let depth = 0;
		let quote = "";
		function declaration(end) {
			const value = clean.slice(start, end).trim();
			const offset = baseOffset + start + clean.slice(start, end).indexOf(value);
			const selector = `${prefix}${stack.join(" > ")}`;
			if (value.startsWith("@apply ")) scanValue(value.slice(7), `${selector}/@apply`, offset + 7);
			else {
				const colon = splitBalanced(value, /:/)[0]?.value.length;
				if (colon === undefined || colon === value.length) return;
				const property = value.slice(0, colon).trim();
				const literal = value.slice(colon + 1).trim();
				if (rawColor(literal, true)) add(`${selector}/${property}`, literal, "color", offset + colon + 1);
				else if ((geometryProperty.test(property) || property.startsWith("--")) && absoluteLength.test(literal))
					add(
						`${selector}/${property}`,
						literal,
						typeProperty.test(property) ? "typography" : "geometry",
						offset + colon + 1,
					);
				else if (typeProperty.test(property) && /\d/.test(literal) && !literal.includes("var("))
					add(`${selector}/${property}`, literal, "typography", offset + colon + 1);
			}
		}
		for (let i = 0; i < clean.length; i++) {
			const char = clean[i];
			if (char === "\\") {
				i++;
				continue;
			}
			if (quote) {
				if (char === quote) quote = "";
				continue;
			}
			if (char === '"' || char === "'") {
				quote = char;
				continue;
			}
			if (char === "(" || char === "[") depth++;
			else if (char === ")" || char === "]") depth--;
			else if (depth === 0 && char === "{") {
				stack.push(clean.slice(start, i).trim().replace(/\s+/g, " "));
				start = i + 1;
			} else if (depth === 0 && char === ";") {
				declaration(i);
				start = i + 1;
			} else if (depth === 0 && char === "}") {
				declaration(i);
				stack.pop();
				start = i + 1;
			}
		}
	}
	if (file.endsWith(".css")) {
		css(source);
		return findings;
	}
	const tree = parseSource(file, source);
	const sharedControls = new Set();
	for (const statement of tree.statements) {
		if (!ts.isImportDeclaration(statement) || !isStringLiteralLike(statement.moduleSpecifier)) continue;
		if (!statement.moduleSpecifier.text.startsWith("@reactive-resume/ui/components/")) continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings)) {
			for (const specifier of bindings.elements) {
				if (sharedControlNames.has((specifier.propertyName ?? specifier.name).text))
					sharedControls.add(specifier.name.text);
			}
		} else if (bindings && ts.isNamespaceImport(bindings)) {
			for (const name of sharedControlNames) sharedControls.add(`${bindings.name.text}.${name}`);
		}
	}
	const constants = new Map();
	function index(node) {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
			let scope = node.parent;
			while (scope && !ts.isSourceFile(scope) && !ts.isBlock(scope) && !ts.isFunctionLikeDeclaration(scope))
				scope = scope.parent;
			if (!constants.has(scope)) constants.set(scope, new Map());
			constants.get(scope).set(node.name.text, node.initializer);
		}
		node.forEachChild(index);
	}
	index(tree);
	function context(node) {
		const parts = [];
		for (let parent = node.parent; parent && !ts.isSourceFile(parent); parent = parent.parent) {
			if (ts.isFunctionDeclaration(parent) && parent.name) parts.unshift(`function:${parent.name.text}`);
			else if (ts.isVariableDeclaration(parent)) parts.unshift(`const:${parent.name.getText(tree)}`);
			else if (ts.isPropertyAssignment(parent)) parts.push(`property:${parent.name.getText(tree)}`);
			else if (ts.isJsxAttribute(parent))
				parts.push(`jsx:${parent.parent.parent.tagName.getText(tree)}@${parent.name.getText(tree)}`);
		}
		return parts.join("/") || "module";
	}
	function resolve(node, seen = new Set()) {
		if (isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
		if (ts.isIdentifier(node) && !seen.has(node.text)) {
			seen.add(node.text);
			for (let scope = node.parent; scope; scope = scope.parent) {
				if (
					ts.isFunctionLikeDeclaration(scope) &&
					scope.parameters.some((parameter) => parameter.name.getText(tree) === node.text)
				)
					return undefined;
				const initializer = constants.get(scope)?.get(node.text);
				if (initializer) return resolve(initializer, seen);
			}
		}
		if (ts.isPrefixUnaryExpression(node)) {
			const value = resolve(node.operand, seen);
			if (value !== undefined && /^\d+(?:\.\d+)?$/.test(value))
				return node.operator === ts.SyntaxKind.MinusToken ? `-${value}` : value;
		}
		if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))
			return resolve(node.expression, seen);
		if (ts.isTemplateExpression(node))
			return (
				node.head.text +
				node.templateSpans
					.map(
						(span) =>
							`${resolve(span.expression, new Set(seen)) ?? `\${${span.expression.getText(tree)}}`}${span.literal.text}`,
					)
					.join("")
			);
		if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
			return `${resolve(node.left, new Set(seen)) ?? `\${${node.left.getText(tree)}}`}${resolve(node.right, new Set(seen)) ?? `\${${node.right.getText(tree)}}`}`;
		return undefined;
	}
	function isSharedControl(node) {
		const name = node.parent.parent.tagName.getText(tree);
		if (!sharedControls.has(name)) return false;
		const binding = name.split(".")[0];
		for (let scope = node.parent; scope; scope = scope.parent) {
			if (constants.get(scope)?.has(binding)) return false;
			if (
				ts.isFunctionLikeDeclaration(scope) &&
				scope.parameters.some((parameter) => parameter.name.getText(tree) === binding)
			)
				return false;
		}
		return true;
	}
	function visit(node) {
		if (
			ts.isJsxAttribute(node) &&
			node.name.getText(tree) === "className" &&
			node.initializer &&
			isSharedControl(node)
		) {
			function checkControlValue(valueNode) {
				const value = resolve(valueNode);
				if (value !== undefined) {
					for (const token of splitBalanced(value, /\s/)) {
						const base = splitBalanced(token.value, /:/).at(-1)?.value.replace(/^!|!$/g, "").replace(/^-/, "") ?? "";
						if (controlOverride.test(base))
							add(
								`${context(node.initializer)}`,
								token.value,
								"control-override",
								valueNode.getStart(tree) + token.offset,
							);
					}
				} else valueNode.forEachChild(checkControlValue);
			}
			checkControlValue(node.initializer);
		}
		if (ts.isShorthandPropertyAssignment(node) && geometryProperty.test(node.name.text)) {
			const value = resolve(node.name);
			if (value !== undefined && (absoluteLength.test(value) || (/^-?[\d.]+$/.test(value) && Number(value) !== 0))) {
				add(
					`${context(node)}/property:${node.name.text}`,
					value,
					typeProperty.test(node.name.text) ? "typography" : "geometry",
					node.getStart(tree),
				);
			}
		}
		if (
			ts.isPropertyAssignment(node) &&
			(geometryProperty.test(node.name.getText(tree).replace(/['"]/g, "")) ||
				node.name.getText(tree).replace(/['"]/g, "").startsWith("--"))
		) {
			const property = node.name.getText(tree).replace(/['"]/g, "");
			const value = resolve(node.initializer);
			if (value !== undefined && geometryProperty.test(property) && /^-?[\d.]+$/.test(value) && Number(value) !== 0)
				add(
					`${context(node.initializer)}`,
					value,
					typeProperty.test(property) ? "typography" : "geometry",
					node.initializer.getStart(tree),
				);
			else if (
				value !== undefined &&
				!isStringLiteralLike(node.initializer) &&
				!ts.isTemplateExpression(node.initializer) &&
				absoluteLength.test(value)
			)
				scanValue(value, context(node.initializer), node.initializer.getStart(tree), property);
		}
		const valueNode =
			isStringLiteralLike(node) ||
			ts.isTemplateExpression(node) ||
			(ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken);
		const parent = node.parent;
		const isPart =
			parent &&
			((ts.isTemplateSpan(parent) && parent.literal === node) ||
				ts.isTemplateExpression(parent) ||
				(ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken));
		const linkAttribute =
			parent && ts.isJsxAttribute(parent) && /^(?:href|src|xlinkHref|to)$/.test(parent.name.getText(tree));
		if (valueNode && !isPart && !linkAttribute) {
			const value = resolve(node);
			if (value !== undefined) {
				const property =
					parent && ts.isPropertyAssignment(parent) ? parent.name.getText(tree).replace(/['"]/g, "") : "";
				if (/[{}]/.test(value) && /(?:font-size|padding|margin|color)\s*:/.test(value))
					css(value, `${context(node)}/css:`, node.getStart(tree));
				else scanValue(value, context(node), node.getStart(tree), property);
			}
		}
		node.forEachChild(visit);
	}
	visit(tree);
	return findings;
}

export function fingerprint(entry) {
	return JSON.stringify([entry.file, entry.context, entry.literal, entry.kind]);
}

export function checkAllowlist(findings, entries) {
	const allowed = new Map();
	const diagnostics = [];
	for (const entry of entries) {
		const key = fingerprint(entry);
		if (
			!entry.reason?.trim() ||
			!Number.isInteger(entry.count) ||
			entry.count < 1 ||
			allowed.has(key) ||
			/[*?]/.test(entry.file)
		) {
			diagnostics.push({
				...entry,
				line: 1,
				kind: "invalid-allowlist",
				replacement: "Use a unique exact fingerprint, positive count and a review reason.",
			});
		} else allowed.set(key, entry);
	}
	const counts = new Map();
	for (const finding of findings) {
		const key = fingerprint(finding);
		const count = (counts.get(key) ?? 0) + 1;
		counts.set(key, count);
		if (count > (allowed.get(key)?.count ?? 0)) diagnostics.push(finding);
	}
	for (const [key, entry] of allowed) {
		if ((counts.get(key) ?? 0) < entry.count)
			diagnostics.push({
				...entry,
				line: 1,
				kind: "stale-allowlist",
				replacement: `Reduce/remove the reviewed allowance: expected ${entry.count}, found ${counts.get(key) ?? 0}.`,
			});
	}
	return diagnostics;
}
