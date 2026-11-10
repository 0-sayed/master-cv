# Arabic document qualification

D33 makes qualification CI report-only. Historical rendering assertions run separately with
`DOCUMENT_REGRESSIONS=1 pnpm --filter @reactive-resume/tooling test:documents`; their original
assertions remain intact, including known failures under the final display decisions. Opened
synthetic inputs and historical reader baselines used by these tests are committed under
`fixtures/regressions/`, so a fresh checkout does not depend on ignored local evidence. No H6
fixture or sealed result is reopened or regraded by these tests.

The local command fails on qualification errors, but qualification CI is report-only. It renders actual server PDFs and compares the same bytes through PDF.js 6.4.299 and a checksum-pinned Poppler 22.02.0 Ubuntu revision. Poppler `-layout` is retained as a diagnostic and cannot replace a failed default extraction.

From the repository root, use Node 24 and the existing pnpm toolchain:

```sh
node tooling/document-qualification/install-poppler.mjs
export PATH="$PWD/.cache/document-toolchain/bin:$PATH"
pnpm --filter @reactive-resume/tooling test:documents
DOCUMENT_PILOT=1 pnpm --filter @reactive-resume/tooling test:documents
DOCUMENT_MATRIX=1 pnpm --filter @reactive-resume/tooling test:documents
```

The installer only downloads, verifies and extracts the two packages in `versions.json`; it does not install system packages. It requires Linux x64 and Ubuntu 22.04 runtime libraries. Both browser and document CI jobs use Ubuntu 22.04 and supply these libraries. Each reader invocation verifies the actual executable and linked Poppler SONAME target against the recorded hashes; an upstream version banner or PATH wrapper is insufficient. Other operating systems are unqualified. Exact package URLs fail closed if unavailable; updating pins requires another measured run.

Outputs are ignored under `test-results/document-qualification/{smoke,pilot,matrix}`. Each run keeps the full manifest, PDF bytes and SHA-256, raw outputs for all three reader modes, field recall, order/association failures, numeric differences, CER/WER, source font URLs/hashes, environment, duration and process peak RSS. Process RSS includes the test runner and is not an isolated renderer benchmark. Source fonts can be cached; browser font subsets need separate evidence. No performance threshold is approved.

Set `DOCUMENT_QUALIFICATION_OUTPUT` to an absolute directory to retain a separate investigation run; the runner appends `smoke`, `pilot` or `matrix`. For example, from the repository root:

```sh
DOCUMENT_QUALIFICATION_OUTPUT="$PWD/test-results/document-qualification/attribution-2026-11-07" pnpm --filter @reactive-resume/tooling test:documents
```

**Round 7 (2026-11-07): holdout-2 is development data, never blind again.** Its original fixture/seal and Round 6 0/20 evidence remain unchanged. `DOCUMENT_DEV_HOLDOUT_2=1` selects a source-identical development manifest with source-derived `gold.text`; `DOCUMENT_HOLDOUT_3=1` selects the new sealed final suite. Both require an explicit `DOCUMENT_QUALIFICATION_FIXTURES` file path and append their own suite label. Flags are mutually exclusive with pilot/matrix. The retired `DOCUMENT_HOLDOUT_2=1` switch throws instead of silently selecting smoke. Round 7 manifests, before/after gold hashes and run evidence live under `test-results/document-qualification/round7-2026-11-07/`. The one-run holdout wrapper records a seal and source freeze before rendering; never rerun it or alter code/gold after reading its results.

**Round 8 (2026-11-07), owner D32:** `DOCUMENT_QUALIFICATION_POLICY="fact-level v2"` explicitly selects the new policy; the default remains `strict v1`. Each PDF is rendered/extracted once and records both policies against identical reader text in `comparisons` and `automatedPassByPolicy`. V2 relaxes only number-adjacent spacing for explicitly date-marked Arabic suffixes/labels and shipped localized ongoing labels, plus complete-word multiset order for explicitly marked mixed Arabic/Latin free-text fields. Names, employers, roles, degrees, contacts, website labels, numeric values and entry associations remain protected; contiguous token windows preserve word multiplicity. V2 contact boundaries reject modified domains/local parts; adjacent exclusive association spans do not overlap. Strict's matcher and historical result files remain unchanged.

`DOCUMENT_DEV_HOLDOUT_3=1` opens holdout-3 as development data; it is never blind again. `DOCUMENT_HOLDOUT_4=1` selects the newly sealed final cohort. Both require an explicit fixture path. Round 8 development gold adds omitted degree, education end, project title and visible website assertions plus date ordering; original source CVs, gold text and original assertions are retained. These new strict scores evaluate strengthened gold; historical results are not rescored. Outputs and the source/gold seal are under `test-results/document-qualification/round8-2026-11-07/`.

`source-gold.ts` inventories source text (including visible websites and nested descriptions), excluding hidden sections/items and HTML spans with `display:none`, metadata, numeric IDs, HTML attributes and link destinations. The existing installed HTML parser preserves inline digit adjacency and inserts boundaries for blocks/breaks. It fails on unsupported populated section types instead of silently omitting them. `qualificationFixtures()` uses it after parsing/synchronizing dates. Round 7 retained critical-field values, order, associations and comparator rules/thresholds. The old hand-authored gold text omitted four visible source numbers in every holdout-2 case.

The code-owned Arabic/mixed diagnostic template list is `arabicMixedDiagnosticTemplates` in `packages/schema/src/templates.ts`. `template-evidence.test.ts` checks its Round 5 matrix support and the exclusion of known template blockers. Round 9 narrows that intersection by excluding Meowth (numbered employer identity) and Persian (English name changes). Kakuna (header association) and Smeargle (role identity) remain excluded. This is conditional beta diagnostic support with documented content limitations, not an unconditional v2 pass or human acceptance. The complete Round 9 suite results and exception inventory are in the archive's `font-probe/report8.md`; T004 owns product UI exposure.

PDF.js text items are glyph runs, not words. Qualification now uses the existing production harvest/geometry/line-joining path instead of adding a space after every item. `rawPages` retains the original strings, direction, coordinates, widths, font references and EOL markers; `options` identifies the join policy. No reader string is normalized or repaired inside the extractor. Poppler remains a separate reader, and its layout mode remains diagnostic. Geometry joining cannot repair spaces PDF.js already inserts inside a single item.

The 50 cases comprise 20 Arabic, 15 English and 15 mixed synthetic drafts, with 12 smoke and 10 held-out draft IDs (4/3/3). Many are fixture variants, not independent reviewed resumes. No held-out result is blind after this diagnostic run. All expected text is authored before rendering; no output is rewritten into gold. `reviewed` requires a reviewer and date, and this corpus has neither. A machine pass cannot satisfy A01/A04 by itself.

A candidate pass also requires complete analysis and no blocking findings. Processing coverage is independent of factual accuracy: a complete pass through the checker can still miss broken words or associations. Critical-field recall and non-interleaving association checks are conservative diagnostics, not an ATS vendor acceptance claim. Substring matching and repeated fields need human adjudication; precision is not inferred from arbitrary prose. Numeric alphabet equivalents, NFC, whitespace and reader bidi wrappers are declared comparison differences; letters, hamza, vowels and punctuation remain significant. A source field containing bidi controls must also survive exactly. Raw output is always retained.

`native-import.test.ts` independently reads the three Chromium print PDFs in `native/`, harvests and imports them, validates schema round trips and checks actual facts/associations and the absence of false section blockers. These one-column sources are separate from Forme's exports. Recovery tests cover malformed bytes, reader isolation, per-page failures, truncation and thrown checks. Browser tests in `tests/e2e/specs/pdf-text.spec.ts` use real authenticated synthetic documents, both UI locales, desktop/mobile widths and actual downloaded bytes; their qualification failures remain failures.

The separate CI qualification job always runs smoke, draft pilot and template diagnostics, including after a preceding qualification failure. The existing application's reader remains a regression dependency, not the qualification pin. The exact font license/embedding audit, native Arabic gold review, comprehensive input/template/font matrix, approved limits and DOCX viewer qualification remain open. See [the execution evidence](../../docs/t001-document-compatibility.md).

## Round 9 (2026-11-07)

`DOCUMENT_DEV_HOLDOUT_4=1` opens holdout-4 as development; `DOCUMENT_HOLDOUT_5=1` selects the new sealed suite. Both require an explicit fixture manifest and reject other suite selectors. Existing source/gold, strict and fact-level v2 rules are frozen. Round 9 development fixtures are byte-identical copies of Round 8 manifests. Display-only range canonicalization is documented beside D31; frozen-gold mismatches remain failures, with factual loss adjudicated separately. A single invocation evaluates holdout-5 and records both policies from the same saved bytes/readers.

## Round 10 — fact-level v2.1 (2026-11-07)

`DOCUMENT_QUALIFICATION_POLICY="fact-level v2.1"` selects the new expected-export-display policy. Strict remains the default. Every invocation saves strict v1, fact-level v2 and v2.1 comparisons against identical PDF bytes and reader text; historical manifests/gold and comparator paths remain unchanged.

Before extraction, `expectedDisplayGold` derives a separate source-only gold copy. `expectedExportDateDisplay` independently implements D31 Western digits, canonical numeric range tokens and repeated Hijri year-suffix collapse. It imports no renderer/formatter/reader code. Only explicitly date-marked facts and source-verified legacy raw-date IDs receive canonical display values; protected identities/contacts/free text stay exact under the existing v2 rules. Date value, endpoint order and precision remain significant. This is expected-display alignment, not arbitrary punctuation removal from observed text.

Source-derived owner spans additionally require whole date facts before the next entry or visible section heading. An immediately preceding RTL date on the same extracted line may belong to the adjacent title only when its ordinary span lacks that date; its position is excluded from the previous owner's interval. The saved H5-EN-14 Poppler terminal-date pattern is rejected under v2.1, while the recorded strict/v2 historical result stays unchanged. Repeated owners are scoped to their source section and occurrence, and nested roles have separate spans. Section headings may use the template’s uppercase display and English letter spacing; owner facts remain exact. Bounds currently support the curated AR/EN built-in sections; unsupported custom sections/locales fail explicitly.

`DOCUMENT_DEV_HOLDOUT_5=1` opens H5 as development; `DOCUMENT_HOLDOUT_6=1` selects the fresh sealed 20-case suite. Both require explicit fixture manifests and reject competing suite flags. H2-H5 are development data. H6 is evaluated exactly once only after the final fixes, verification and independent review, with source/gold hashes and no post-result source changes. Source gold remains draft, with native human Arabic acceptance pending.

## D33 closing scope — 2026-11-07

The final confirmation uses fact-level v2.1 once each on smoke, pilot and matrix. Its expected-display gold independently removes only tashkeel U+064B–U+0652 and U+0670, preserves tatweel U+0640 and labelled/free-text date wording, and normalizes numeric alphabets. Date compaction is scoped to RTL document locales. Historical fixture gold, strict/v2 comparators and sealed H6 results remain unchanged; current runs use a separate closing directory. The Chromium trial/HTML translator, trial pins and sampler are retired; their historical evidence remains documentation only. Re-rendering opened H6 sources for the owner pack does not extract, compare or regrade H6. No further holdout is required by D33.

## Ship regression classification — 2026-11-08

The blocking tooling suite retains every previously passing historical regression. English display expectations use upstream's spaced en dash; Arabic/mixed display follows D33(4), and D32 extraction checks require complete endpoints and owner association without endpoint order. Phone, website, skill and education guards remain blocking.

`regression-status.ts` lists the exact 32 reader-only cases and their individual reasons. Each was checked in a rendered PDF and with `pdftotext -bbox`: the facts are fully present and correctly placed, while reader text splits email/URL/month tokens or interleaves date columns. `DOCUMENT_REGRESSIONS=1` runs those cases as diagnostics; the normal tooling suite skips only that explicit list. Smoke, pilot and matrix remain informational; no release gate or historical comparator is changed.

Regression inputs are committed under `fixtures/regressions/`, with original-artifact and subset hashes in `provenance.json`. They contain only the source cases, saved reader control or template-support fields required by the tests. Generated evidence directories are excluded.
