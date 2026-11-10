import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vite-plus/test";
import { check } from "./check.mjs";
import { checkAllowlist, closeParser, collectFindings } from "./scan.mjs";

afterAll(closeParser);

const file = "apps/web/src/fixture.tsx";
const scan = (source) => collectFindings(file, source);

it.each([
	'<div className="md:text-[15px]" />',
	'<nav className="text-[11px]" />',
	'<div className="h-[calc(100%-3px)]" />',
	'<div className="h-[2.5rem] p-[1.25rem] rounded-[.75rem]" />',
	'<div className="gap-[.25em]" />',
	'<div style={{ padding: "2.5rem", borderRadius: "1.25rem" }} />',
	'const padding = "2.5rem"; const view = <div style={{ padding }} />;',
	"const view = <div style={{ padding: `${padding}rem` }} />;",
	'<div className="bg-[#fff]" />',
	"<div style={{ fontSize: 15 }} />",
	"<div style={{ marginTop: -15 }} />",
	"const size = 15; const view = <div style={{ fontSize: size }} />;",
	"const cls = `md:text-[${size}px]`;",
	'const cls = "text-[" + size + "px]";',
	'const cls = "text-" + "[15px]";',
	'const color = "oklch(0.5 0.1 150)";',
	'const color = "rgb(1, 2, 3)";',
	'<div style={{ color: "rebeccapurple" }} />',
	'<div className="text-sm leading-5" />',
	'<div className="bg-[rebeccapurple]" />',
	'<div style={{ "--button-size": "15px" }} />',
	'const value = "15px"; const view = <div style={{ "--button-size": value }} />;',
	'<div style={{ border: "1px solid magenta" }} />',
	'const color = "hsl(120 50% 50%)";',
	'const cls = "text-" + size;',
	"const size = 15; function A() { return <div style={{fontSize: size}} />; } function B() { const size = unknown; }",
])("rejects an unapproved literal: %s", (source) => {
	expect(checkAllowlist(scan(source), [])).not.toHaveLength(0);
});

it.each([
	'import { Button } from "@reactive-resume/ui/components/button"; const view = <Button className="h-6 px-0 rounded-none" />;',
	'import { Button as Action } from "@reactive-resume/ui/components/button"; const view = <Action className="md:h-6 px-0 rounded-none" />;',
	'import * as Controls from "@reactive-resume/ui/components/button"; const view = <Controls.Button className="h-6 px-0 rounded-none" />;',
	'import { Button } from "@reactive-resume/ui/components/button"; const cls = "h-6 px-0 rounded-none"; const view = <Button className={cls} />;',
	'import { Button } from "@reactive-resume/ui/components/button"; const view = <Button className={cn(active && "h-6", "px-0 rounded-none")} />;',
])("blocks actual shared control sizing overrides: %s", (source) => {
	expect(scan(source).filter((finding) => finding.kind === "control-override")).toHaveLength(3);
});

it("allows structural geometry and components unrelated to shared control imports", () => {
	expect(
		scan(`
		import { Button } from "./unrelated";
		const view = <><div className="h-6 px-0 rounded-none" /><Button className="h-6 px-0 rounded-none" /></>;
	`),
	).toEqual([]);
	expect(
		scan(`
		import { Button } from "@reactive-resume/ui/components/button";
		const view = <Button size="sm" className="w-full gap-2 type-label bg-accent" />;
	`),
	).toEqual([]);
});

it("does not treat a shadowed import as a shared control", () => {
	expect(
		scan(`
		import { Button } from "@reactive-resume/ui/components/button";
		function Unrelated(Button) { return <Button className="h-6 px-0 rounded-none" />; }
	`),
	).toEqual([]);
});

it("parses CSS rem/em geometry while allowing semantic references", () => {
	expect(
		collectFindings(
			"packages/ui/src/example.css",
			".box { padding: 1.25rem; border-radius: .75em; height: var(--control-default); }",
		),
	).toHaveLength(2);
});

it("accepts canonical roles, variables, semantic colors and comments", () => {
	expect(
		scan(`
		// const old = "text-[15px] bg-[#fff]";
		/* <div style={{ fontSize: 15 }} /> */
		const view = <div className="type-body px-(--space-18) text-ink bg-accent-soft rounded-control" />;
		const fragment = "url(#fff)";
		const url = "https://example.com/#abcdef";
		const entity = "&#160;";
		const prose = "Use a white paper or a green card";
		const link = <a href="#fff" />;
		const animation = <div style={{ "--progress": 1 }} />;
	`),
	).toEqual([]);
});

it("bounds exact approved document/provider occurrences and rejects duplicates, edits, moves and stale entries", () => {
	const source = 'const provider = { color: "#4285F4" };';
	const findings = scan(source);
	const entries = findings.map(({ line: _line, replacement: _replacement, ...entry }) => ({
		...entry,
		count: 1,
		reason: "Original provider mark; preserve its approved color.",
	}));
	expect(checkAllowlist(findings, entries)).toEqual([]);
	expect(checkAllowlist(scan('const provider = { color: "#4285F4", fill: "#4285F4" };'), entries)).not.toEqual([]);
	expect(checkAllowlist(scan('const provider = { color: ["#4285F4", "#4285F4"] };'), entries)).not.toEqual([]);
	expect(checkAllowlist(scan(source.replace("#4285F4", "#4285F5")), entries)).not.toEqual([]);
	expect(checkAllowlist(collectFindings("apps/web/src/other.tsx", source), entries)).not.toEqual([]);
	expect(checkAllowlist([], entries)).toEqual([expect.objectContaining({ kind: "stale-allowlist" })]);
});

it("parses CSS nesting, comments, quoted delimiters, functions and @apply with balanced brackets", () => {
	const findings = collectFindings(
		"packages/ui/src/fixture.css",
		`
		/* .example { color: #fff; padding: 99px; } */
		@media (width > 10rem) {
			.panel[data-label="a;b"] {
				@apply md:text-[clamp(15px,2vw,19px)] h-[calc(100%-3px)];
				padding: calc(var(--space-4) + 3px);
				color: rgb(1, 2, 3);
				background-image: url("#fff");
			}
		}
	`,
	);
	expect(findings).toHaveLength(4);
	expect(findings.every((finding) => finding.context.includes('.panel[data-label="a;b"]'))).toBe(true);
});

it("accepts an exact protected document stylesheet without exempting its selector or property", () => {
	const path = "apps/web/src/features/resume/template.css";
	const source = ".resume { font-size: 10px; color: #fff; }";
	const findings = collectFindings(path, source);
	const entries = findings.map(({ line: _line, replacement: _replacement, ...entry }) => ({
		...entry,
		count: 1,
		reason: "Protected original document typography and user color data.",
	}));
	expect(checkAllowlist(findings, entries)).toEqual([]);
	expect(checkAllowlist(collectFindings(path, source.replace("10px", "11px")), entries)).not.toEqual([]);
});

it("checks both source roots including new files and leaves source and allowlist bytes unchanged", () => {
	const directory = mkdtempSync(join(tmpdir(), "master-cv-design-tokens-"));
	try {
		for (const path of ["apps/web/src", "packages/ui/src", "tooling/design-tokens"]) {
			mkdirSync(join(directory, path), { recursive: true });
		}
		const web = join(directory, "apps/web/src/new.tsx");
		const css = join(directory, "packages/ui/src/new.css");
		const allowlist = join(directory, "tooling/design-tokens/allowlist.json");
		writeFileSync(web, '<div className="type-body text-ink px-(--space-18)" />');
		writeFileSync(css, ".view { color: var(--ink); padding: var(--space-18); }");
		writeFileSync(allowlist, JSON.stringify({ entries: [] }));
		expect(check(directory)).toEqual([]);
		writeFileSync(web, '<div className="text-[15px]" />');
		writeFileSync(css, ".view { padding: calc(var(--space-4) + 3px); }");
		const before = [web, css, allowlist].map((path) => readFileSync(path, "utf8"));
		expect(check(directory)).toEqual([
			expect.objectContaining({ file: "apps/web/src/new.tsx", kind: "typography" }),
			expect.objectContaining({ file: "packages/ui/src/new.css", kind: "geometry" }),
		]);
		expect([web, css, allowlist].map((path) => readFileSync(path, "utf8"))).toEqual(before);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
