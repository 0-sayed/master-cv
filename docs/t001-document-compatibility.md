# T001 final delivery — 2026-11-08

Status: **complete**, owner-reviewed visually across all 18 templates (Arabic, English and mixed). This does not approve beta or release gates (A01/A04 unpassed; A05 deferred).

## What T001 delivers

- Arabic, English and mixed CVs export through the existing Reactive Resume Forme PDF engine with a pinned, self-hosted Noto Sans Arabic 2.009 (2.012 splits words in PDF.js).
- D31: exported PDFs display Western digits. D33: tashkeel (U+064B–U+0652, U+0670) is removed at export and import; tatweel (ـ) and the Hijri suffix (هـ) are kept. Saved CV content is never changed.
- D33 point 4 (final owner decision): in Arabic/mixed documents every date range reads in natural Arabic order, start on the right, spaced dash (e.g. `2016 - 2019`, `2015 - حتى الآن`, year-month as `08/1999 - 12/2003`), on the role line. English keeps the upstream `2015 – 2017`. Labelled free-text dates are shown as typed.
- RTL layout: centred headers, mirrored timelines, accent bars, icons and ratings; contact line matches upstream, with phone numbers kept left-to-right and readable by PDF.js and Poppler.
- English renders are pixel- and bbox-identical to base `b617646fa` across all 18 templates / 75 pages using the same installed Forme 0.31.0 engine. This comparison does not compare engine versions.
- The qualification harness (`tooling/document-qualification/`) is retained. Smoke/pilot/matrix CI stays report-only; passing historical regressions stay blocking. Only the 32 individually rendered and bbox-verified reader limitations listed in `regression-status.ts` are report-only.

## Known limitations

- Screening readability: because of the owner-accepted natural date order, PDF readers often extract Arabic ranges reordered. Informational v2.1 scores: smoke 4/12, pilot 15/50, matrix 14/54 (compact `2020-2024` scored 10/12, 48/50, 47/54 but read backwards to Arabic readers and was rejected).
- Poppler loses spacing around `هـ` and in `من … إلى …`; values and labels survive (fact-level tests per D32).
- No Hijri conversion; free-text dates have no fidelity guarantee. Word export unavailable pending A05.

## Follow-ups

- Run the PDF package unit tests in pull-request CI (currently only browser tests run there).
- Replace report-only qualification with a score floor that fails below current numbers.
- Three upstream Forme bug-report drafts (Arabic digits, spacing, marks) are kept in the design archive (`t001/font-probe/forme-issue-draft*.md`); not posted.

Evidence and per-round reports: `/mnt/storage/master-cv-design-archive/t001/` (`font-probe/report*.md`, `visual-round16/`, `review/`). The dated sections below are historical.

---

# T001 execution evidence — 2026-11-07

## Round 9 — beta decision — 2026-11-07

**Recommendation: no public beta yet.** Sealed holdout-5 ran once: fact-level v2 **4/20** (AR 2/8, EN 1/6, mixed 1/6), strict **1/20**. All 40 required reader outputs preserve the source numeric multiset and have no non-date missing critical-field findings. This does not establish association: Poppler still detaches raw project dates, including a date after Skills in v2-passing H5-EN-14. Keep that pass and both policies unchanged; it is an acceptance limitation, not permission to rescore. Human Arabic acceptance remains 0.

Round 9 canonicalizes conservative free-text numeric ranges at PDF display only, as documented beside D31. Hijri year ranges retain one `هـ` suffix; Gregorian labels remain separate. Changed ranges occupy separate lines, increasing height. Full Hijri calendar dates, descending/mismatched endpoints, links, phones and identified non-date contexts are left alone. Website labels fit their actual existing box on one line; export fails with a request to shorten the label if it would need less than 7 pt. The three opened NEW-C1 one-column skill cases now recover separate words in both readers; two-column mixed-skill limitations remain. No saved content changes.

The 14-template constant below is **conditional diagnostic support with the documented limitations excepted**, not 14 unconditional v2 passes or public beta approval. Raw-date punctuation/label assertions and displaced associations, marked-name/shadda recovery, two-column mixed skills and the already documented initial Arabic prose-letter loss must be disclosed. Extreme websites require a shorter display label. Source, gold, policies, tests and the constant were frozen before holdout-5; no post-result repair or rerun occurred.

Complete suite tables, all 16 sealed failures, saved-text audit, three resolved Important review findings and verification are in [report8](/mnt/storage/master-cv-design-archive/t001/font-probe/report8.md). The [18-PDF owner pack](/mnt/storage/master-cv-design-archive/t001/review/index.html) uses preselected holdout-5 IDs; [review-round8](/mnt/storage/master-cv-design-archive/t001/review-round8/index.html) preserves the previous pack. No owner answers or launch approval are inferred.

## Round 7 export display rule — 2026-11-07

Owner-authorized Round 7 scope: B-C02/B-C07/B-C08/B-C09, A01/A04. Numeric-only exported date ranges use Western digits joined by ASCII hyphen-minus without spaces (`2020-2021`, `03/2020-05/2021`). Ongoing numeric ranges use a numeric prefix (`2020-`) plus the existing localized ongoing label in a separate run. Labelled Hijri, named-month and unparsed dates retain their wording/calendar; no calendar conversion. Saved CV data, legacy periods and link destinations remain unchanged. This is a PDF display rule under D31's display-only boundary, not a new decision about saved content.

Horizontal experience/education headers now form a logical paragraph in English as well as RTL documents, including nested roles. Nested paragraph direction follows the role title's first letter; document alignment and intentionally stacked sidebar headers remain. Dates sit next to the corresponding title instead of a detached right-edge column; this visible composition change and separator change are recorded in [all-template before/after gallery](../test-results/document-qualification/round7-2026-11-07/visuals/index.html). No mapped product screen or Figma frame is implemented or visually approved here.

The opened holdout-2 is explicitly development data. Original gold/seal/results stay as evidence; the Round 7 development copy changes only split and source-derived `gold.text`, with per-case hashes and unchanged data/critical assertions proved in [gold regeneration](../test-results/document-qualification/round7-2026-11-07/gold-regeneration.json). This repairs our numeric inventory, not reader output. No comparator changes.

Development evidence: year-range/nested checks improve from 0/20 to 18/20; the two numbered Meowth employers remain red (Round 6 NEW-R3). Raw Arabic Hijri dates in English remain red (NEW-R4); Arabic numeric-month and ongoing ranges still split/reorder in PDF.js despite correct display tokens. These are tested limitations, not successful general range qualification. A01/A04 remain unpassed and A05 remains deferred. Final scores and human-review status are in archive/font-probe/report6.md and the top Round 7 handoff.

## Round 6 — final evaluation — 2026-11-07

**Current evidence: holdout-2 0/20 (AR 0/8, EN 0/6, mixed 0/6); browser export suite 9/9; human accepted 0.** The sealed holdout was run exactly once on the default path after its Round 5 hash matched. Its expected numeric inventory omits visible source facts, so 0/20 is not a pure renderer-reliability measure; independent text/order/association failures also remain. No source, fixtures, gold, thresholds or comparator changed. All results stay red; no more engine/workaround attempts this round.

[Final report and per-case categories](/mnt/storage/master-cv-design-archive/t001/font-probe/report5.md), [holdout summary](../test-results/document-qualification/round6-2026-11-07/holdout-2/summary.json), [browser results](../test-results/document-qualification/round6-2026-11-07/browser-results.json), [18-PDF offline owner review](/mnt/storage/master-cv-design-archive/t001/review/index.html). A01/A04 remain unpassed; A05/DOCX remains deferred. Recommendation: synthetic internal review only, with no general Arabic/mixed/English launch approval. Historical measurements and old experiment recommendations below are superseded by this section and the manager's stop decision.

## Known limitations — 2026-11-07

These remain failures under unchanged rules. Drafts are local and **not posted**. A draft names a triage candidate, not a proved upstream engine defect.

- **Some Arabic names with vowel marks, and invisible joining characters, copy incorrectly.** The Layla cluster fragments in PDF.js; ZWNJ changes logical order in both readers. Other marked names can pass. [Retained probe evidence](../test-results/document-qualification/round5-2026-11-07/marks-probe/summary.json); [upstream draft](/mnt/storage/master-cv-design-archive/t001/font-probe/forme-issue-draft-marks.md).
- **Hijri and labelled dates can lose spaces or reorder words in Poppler.** The three strict spacing cases remain red. [Evidence](../test-results/document-qualification/round5-2026-11-07/spacing-before/hijri.json); [upstream draft](/mnt/storage/master-cv-design-archive/t001/font-probe/forme-issue-draft-spacing.md). Arabic raw project dates inside English CVs also fail PDF.js token order in five new holdout cases: [evidence](../test-results/document-qualification/round6-2026-11-07/holdout-2/H2-EN-09.json), [new upstream-triage draft](../.superpowers/t001-round6-2026-11-07/issue-draft-holdout-reader-cases.md#new-r4-arabic-raw-project-dates-in-english-documents).
- **Kakuna can read its header after the body.** Keep the original regression red and exclude it from the diagnostic-safe list. [Evidence](../test-results/document-qualification/round5-2026-11-07/qualified-final/matrix/AR01-kakuna.json); [template/importer draft](../.superpowers/t001-round6-2026-11-07/issue-draft-template-reading-order.md#kakuna-header-reads-after-body).
- **English Persian/Smeargle styling disagrees with exact-text rules.** Persian uppercases names; Smeargle uppercases/spaces its headline so the expected exact role occurrence/associations fail. This alone does not prove missing name letters or a missing body job. [Persian evidence](../test-results/document-qualification/round5-2026-11-07/qualified-final/matrix/EN01-persian.json), [Smeargle English](../test-results/document-qualification/round5-2026-11-07/qualified-final/matrix/EN01-smeargle.json), [Smeargle mixed](../test-results/document-qualification/round5-2026-11-07/qualified-final/matrix/MX01-smeargle.json); [template/policy draft](../.superpowers/t001-round6-2026-11-07/issue-draft-template-reading-order.md).
- **New: several roles under one employer expose date-order and column-association failures.** All 20 new cases fail an order/association rule in at least one required reader; intact year digits do not prove that a date is beside the right role. This extends earlier layout failures and is not automatically the Kakuna cause. [Evidence/categories](../test-results/document-qualification/round6-2026-11-07/failure-categories.json); [upstream-triage draft](../.superpowers/t001-round6-2026-11-07/issue-draft-holdout-reader-cases.md#new-r1-nested-jobs-and-separated-date-columns).
- **New: mixed Arabic/English phrases and numbered employer names can read in a different order.** All six mixed skill phrases fail exact order in both readers; Poppler moves the employer-number suffix beside dates in two Meowth cases. Component words can survive despite the failure. [Mixed evidence](../test-results/document-qualification/round6-2026-11-07/holdout-2/H2-MIXED-15.json); [upstream-triage draft](../.superpowers/t001-round6-2026-11-07/issue-draft-holdout-reader-cases.md).
- **Evaluation limitation: the sealed holdout expects too few numeric tokens.** Its source websites and role descriptions include numbers omitted from expected prose, so faithful source numbers are flagged as unexpected in all 20 cases. Do not call them fabricated output, infer a clean engine failure rate or silently correct the seal. [Source and all classifications](../test-results/document-qualification/round6-2026-11-07/failure-categories.json); [local harness issue draft](../.superpowers/t001-round6-2026-11-07/issue-draft-holdout-gold.md). This is our evaluation defect, not an upstream library defect.

The retained Round 5 report also records dropped initial prose letters in PDF.js; isolated passing mark controls and complete critical-field recall do not prove all Arabic prose is faithful. [Evidence](/mnt/storage/master-cv-design-archive/t001/font-probe/report4.md#2-arabic-diacritics-cause-and-disposition), [related upstream marked-text draft](/mnt/storage/master-cv-design-archive/t001/font-probe/forme-issue-draft-marks.md). No new prose workaround attempted.

## Conditional beta diagnostic template list — Round 9

**14 conditional templates:** azurill, bronzor, chikorita, ditgar, ditto, gengar, glalie, lapras, leafish, onyx, pikachu, porygon, rhyhorn, scizor. **0 unconditional templates.** The single source remains [arabicMixedDiagnosticTemplates](../packages/schema/src/templates.ts), with matrix support checked by its existing evidence test. [Round 9 eligibility evidence](../test-results/document-qualification/round9-2026-11-07/beta-template-evidence.json) inventories every failed case without changing any automated score. The Round 5 intersection contained 16; Round 9 additionally excludes Meowth (numbered employer recovery) and Persian (English name changes). Kakuna (header/body associations) and Smeargle (role recovery) remain excluded. This list does not override the no-beta recommendation above or the content limitations.

“Diagnostic-safe” does not mean every Arabic name, multi-role history, raw date or mixed phrase works. The new holdout failures apply even inside this list. No UI exposure or general ATS/Arabic/launch qualification follows. The review pack uses 12 of these templates. Native Arabic owner review is pending.

## Historical evidence (before Round 6)

**Verdict: NO-GO for an Arabic launch on the current renderer configuration.** Reactive Resume is a usable application foundation and the focused importer fixes work, but the current Forme PDFs do not meet A01/A04 across independent readers. T001 is not acceptance-complete. Nothing is committed, pushed, deployed or release-approved.

**Follow-up attribution:** the harness join defect is fixed, but fresh smoke remains 4/12. Direct Forme probes reproduce the Arabic extraction problem without application templates. See [the attribution follow-up](#attribution-follow-up--2026-11-07) before choosing the next engine experiment.

## Actual document results

| Evaluation                                         | Arabic | English | Mixed | Human accepted |
| -------------------------------------------------- | ------ | ------- | ----- | -------------- |
| 12-case smoke                                      | 0/4    | 4/4     | 0/4   | 0/12           |
| 50 draft cases                                     | 0/20   | 15/15   | 0/15  | 0/50           |
| 18 templates × 3 diagnostic cases                  | 0/18   | 16/18   | 0/18  | 0/54           |
| Independent native PDF import + factual assertions | 1/1    | 1/1     | 1/1   | 0/3            |

These are automated candidate results, not a labelled human-reviewed pilot. The 50 drafts include repeated scenario variants. Ten IDs are reserved as held-out drafts (4 Arabic, 3 English, 3 mixed), but the diagnostic run exposed them; no blind evaluation is claimed. Native Arabic/bilingual review, independent held-out gold and the approved release matrix remain missing.

The default Poppler output preserves many Arabic words that PDF.js splits internally, for example `شركة الأفق` becomes `ش ركة الأف ق`. Poppler's default reading order can move dates after unrelated sections, so having every word does not preserve employer/role/date associations. Its `-layout` mode is saved as a diagnostic, never substituted to turn a default-reader failure into a pass. Raw Hijri/ambiguous date export also remains unqualified. Persian and Smeargle failed English diagnostic field/occurrence checks; these need adjudication rather than an automatic declaration that those templates are supported.

The browser suite ran against a production build using synthetic authenticated resumes, widths 1440/390 and both UI locales for both document languages. All eight T001 downloads completed and saved facts/document locale survived the UI switches. Both English cases passed both readers; both Arabic cases failed qualification. The inherited browser shaped-script test also passed: **7 tests passed, 2 failed** (including four AR/EN desktop/mobile failed-analysis checks). Browser/server bytes are separately hashed. PDF.js logged font-subset `loca` table repair warnings; a passing text check does not certify those fonts or visual fidelity.

## Changes and verification

- Arabic aliases, multiword ongoing values, Arabic-Indic/Persian phone/date recognition, explicit document locale and preserved uncertainty were added to the actual importer. Gregorian Arabic month parsing now explicitly uses the Gregorian calendar. Year-only values remain year-only; Hijri and ambiguous inputs retain raw text.
- Reader direction is retained. Import and checker share RTL run ordering while retaining LTR islands and unmodified raw extraction. Numeric/contact length no longer determines row direction; source language determines default column order. Geometry alone cannot reliably determine the base of a paragraph containing competing lexical scripts, so mixed-script paragraph layouts remain unqualified. Shaped Arabic presentation forms are decoded at import/heading-recognition boundaries. Three independent Chromium PDF inputs now recover asserted names, contacts, roles, schools and date associations and produce no false section blockers.
- Arabic heading checks were added without enabling English role/writing heuristics for Arabic documents. Unknown structured headings produce warnings. Coverage is independent of score: failed/missing/truncated pages or text/annotation/operator passes and thrown checks remain partial/failed. The API schema preserves coverage and execution-failure reasons. Browser checker and builder report withhold the overall score for partial, failed or legacy-unknown coverage, with AR/EN copy. Declared PDF language reaches both API and browser import; interface language is never used as document language. Arabic sources without reliable language metadata remain outside the demonstrated month-date import coverage.
- Real PDF regressions reproduced reversed RTL numeric ranges and phone groups. Purely numeric date roots now use LTR direction. Phone output uses equivalent Latin digits in an LTR container; the saved phone remains untouched and exact versus normalized recall exposes that presentation difference. Arabic textual/raw dates are not globally forced LTR.
- DOCX ZIP/XML tests preserve Arabic/mixed text, direction flags and role/date order. They do not certify Word or Google Docs rendering. A05 remains pending and Word is not release-approved; inherited format exposure still needs T004 reconciliation.
- A separate CI qualification job and the browser job use verified Poppler package, executable and linked-library checksums, preserves failed qualification artifacts, and runs smoke, draft pilot and template diagnostics. Qualification is a separate failing gate; ordinary unit tests do not turn known Arabic failures into a green release result. Hosted CI has not run on these uncommitted changes.

Final focused verification: PDF **391/391**, importer **83/83**, schema **91/91**, resume/ATS **212/212**, DOCX **22/22**, utils **95/95**, qualification tooling **20/20** (including the three native imports), affected web tests **13/13**, API coverage wire **1/1**: **928 passed**. Repository typechecks **22/22**, lint, Knip and package boundaries passed. Frozen offline installation and production build passed. Task-file formatting passed; the full repository format check fails on the pre-existing untracked `.archon/.state/review-bots.json`, which was left untouched. This is not an all-green repository or release result.

The retained mobile checker has not received this web coverage-presentation change and remains outside qualification. Mobile validation retained all targets: seven tests passed; Hermes compatibility failed because `apps/mobile/ios/Pods/hermes-engine/destroot/bin/hermesc` is absent. This matches the recorded native prerequisite and is not a native green result.

## Reproduction and evidence

Baseline is `b617646fa50be15c8ea83275182eff60a08051b9`, with the uncommitted working-tree changes on `feat/t001-arabic-document-engine`. Node 24.22.1, pnpm 12.14.0, Forme core/react 0.28.0, HarfBuzz 1.6.3, PDF.js 6.4.299; Linux x64, kernel 6.8.0-90-generic, Intel i5-12500H. Poppler's qualification build is Ubuntu **22.02.0-2ubuntu0.15**, extracted without modifying the host installation; both package checksums are in [versions.json](../tooling/document-qualification/versions.json). Earlier exploratory runs used the host's `.12` build and are not the final pin.

Use [the harness instructions](../tooling/document-qualification/README.md). Ignored local outputs retain actual PDFs, hashes, original text for both readers plus layout diagnostics, manifest/gold, field recalls, missing facts, association/order failures, numeric differences, CER/WER, actual downloaded font source URLs/hashes, environment and timings. `test-results/document-qualification/{smoke,pilot,matrix,native}` contains document evidence; `test-results/browser-t001-final` contains browser PDFs/screenshots/traces and comparisons. The execution ledger and full logs are under `.superpowers/sdd/2026-11-07-t001-arabic-document-engine/`. No real CVs, provider calls or paid services were used.

Final run durations and peak RSS are in the raw summaries; they include two PDF.js parses per document, real ATS analysis and the independent readers. These are descriptive local compute observations, not approved performance targets. Peak process RSS includes Vitest; font caching and duplicate PDF.js parses are disclosed in the raw evidence. Font license/embedding provenance and browser-subset hashes remain open.

Live Figma read-only verification inspected the current [S09 Editor: design master](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=30-962) and [export failed state](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=51-1115). The name/render of S09 was confirmed. The reference explicitly treats template candidates as unapproved and Word as unavailable. Local output rasters and Arabic mobile UI were inspected; no pixel match or native Arabic visual acceptance is claimed. Remaining S06/S10/S12/S13 desktop/mobile/recovery comparisons are outstanding, and T004 owns their implementation.

## Open acceptance work and decision

A01/A04 remain failed/pending: critical Arabic word extraction, role/date/section ordering, visual clipping review, full input/template/font coverage, complete rule TP/FP/FN calibration, native Arabic/bilingual gold approval and a new blind held-out evaluation. Browser failed-font/import recovery journeys are not claimed; engine recovery tests cover malformed bytes, reader failure isolation, failed page passes, truncation and thrown checks. Native DOCX input requires the inherited AI path and was not exercised or treated as native support. A05 viewer qualification remains deferred.

The next engineering decision is a focused PDF renderer/text-layer spike before dependent product work relies on Arabic export. Options are (1) repair the existing Forme text layer against these exact failing bytes, (2) measure an alternative renderer behind the current export contract, or (3) reduce/stop the Arabic launch scope. **Recommend (1) first**, with a bounded success criterion: both readers recover every included critical field and association, then native Arabic visual/gold review passes. A renderer replacement or reduced product scope needs an explicit owner decision; this run authorizes neither.

## Execution rulings

The implementation used the existing in-place feature branch, retained dependencies/history and did not stage or commit. User implementation authorization superseded the plan's former planning-only sentence. T000's merged prerequisite was used for local work without rewriting the scheduler. Uncommitted logs/ledger are retained so evidence is not lost. Wrong branch/prerequisite assumptions would invalidate the baseline; no release authority is inferred.

Only already-resolved dependencies were added to the lockfile importers after offline metadata resolution failed; frozen installation verified the graph. The planned `tsx` entry point could not resolve an inherited `.node` reexport, so the installed Vitest resolver runs one explicit qualification command instead. Qualification has its own config/CI job to accommodate the independent reader pin and retain a failing release gate. The original application's rolling reader remains a regression dependency, not accepted qualification evidence. Both CI jobs now use Ubuntu 22.04 because the pinned reader requires its runtime libraries; this removes the existing optional Ubuntu 24.04 Blacksmith runner choice for this workflow. Hosted compatibility and timing remain unverified. Wrong resolver/pin assumptions would invalidate reproducibility; actual raw outputs and checksums remain available.

Arbitrary prose precision is not invented: field recall, numeric additions and text/order errors are reported, while full structured precision and human truth adjudication remain pending. Reader bidi wrappers are comparison-only; source controls require exact retention. Numeric phone glyph presentation uses equivalent Latin digits without changing the saved fact. A wrong equivalence policy could overstate fidelity, so exact results and raw output are retained and human approval remains mandatory.

The original full-width fixture omitted its sidebar skills; the fixture was corrected before grading. Rejected LibreOffice-generated native input omitted facts; independently authored Chromium inputs replaced it before use. These corrections change test inputs, not gold derived from observed Forme output. The corpus remains draft and unreviewed. An invalid fixture would invalidate its result rather than qualify a release.

The initial reader-recovery and DOCX characterization tests passed before implementation and are not claimed as red-to-green work. Other measured fixes keep failing and passing logs. Missing product/release/visual/human gates are recorded as incomplete, not silently implemented as simulator screens or accepted because a score is high.

## Final review and limits

One fresh Terra 6.1 high review identified five Important findings and no Critical or Minor findings. One fix pass reproduced each finding before the fix: source-language propagation, incomplete-result presentation, numeric/contact direction weighting, acceptance of a reader sharing only an upstream version banner, and invalid resolved annotation evidence. Focused regressions now pass. The pin test uses an executable with a plausible version banner and incorrect bytes, so it is independent of which Poppler happens to be installed on the host. The harness resolves the private pinned executable itself and hashes the actual linked Poppler SONAME target; PATH cannot substitute a reader.

Actual PDF diagnostics also exposed false blocking severity for long unknown headings (AR02), a recoverable full-width layout (EN03) and dates adjacent to company text (English Meowth). Employment-heading, date-recognition and geometric reading-order signals now warn without hard score caps. This is a deliberate tradeoff: these heuristics cannot prove factual loss. It can reduce severity for a genuinely poor file, so both reader comparisons, actual critical-fact/association checks, no known blocking findings, human review and the separate qualification gate remain required. A high ATS score or complete processing coverage does not prove faithful recovery; Arabic outputs still fail the strict gate.

A late browser assertion found an inconsistent synthetic fixture: the second role had structured 2011–2013 dates but retained its cloned 2020–2022 legacy period view. The fixture factory now canonicalizes after scenario mutations, matching the schema already applied by the server qualification harness. The authored facts and gold dates did not change. A failing canonicalization regression preceded the correction. Initial public-upload automation also needed to wait for hydration and distinguish the result message from the viewer's loading status; those locator fixes do not relax document assertions. Local browser rate limits were disabled for synthetic tests only, matching CI.

The reviewer declined to judge Arabic launch/visual/human/matrix acceptance, DOCX viewer fidelity, inherited checker authorization, hosted CI and native delivery. Those remain failed, pending or outside this web change; no declined area is treated as approved. No second review or user study is claimed. The uncommitted branch, planning artifact, logs and evidence remain available for the next renderer decision.

Final measured runs: smoke 9.41 s / 701 MiB peak process RSS; draft corpus 13.38 s / 786 MiB; template diagnostics 7.55 s / 736 MiB. Every requested processing pass completed in these runs, with no remaining blocking findings; the Arabic critical-text and association comparisons still failed. Browser diagnostics recorded no page exceptions, console errors or failed requests in the four download cases; reader font warnings remain. File hashes and the final check inventory are retained beside the execution ledger.

## Attribution follow-up — 2026-11-07

### Finding and repair

Claude's proposed join bug is real, but it does not explain the retained Forme qualification failures. The old harness inserted a space after every PDF.js item. Three independent Chromium PDFs reproduced broken Arabic fragments, separated English words and `synthetic@example . test`. The harness now reuses `harvestPdfDocument` → `buildExtractedDocument` → `documentToLines`. Original item strings and geometry are retained in `rawPages`; the reader options disclose the production geometry join. Incomplete page text still fails the reader. Poppler and qualification gold/comparison rules are unchanged.

The three native-fixture join regressions failed before the repair; all six extractor tests pass afterward. Their Arabic assertions decode Chromium's presentation forms only to inspect the joining contract; that decoding is not used in the extractor or qualification comparator and does not qualify those PDFs under a new equivalence policy. The tests retain genuine name/word spaces, intact emails, logical phone groups and English phrases.

For retained `AR01.pdf`, a single original PDF.js item already contains `ش ركة الأف ق`, with transform `[10,0,0,10,536.38,659.81]`, width `55.13`, direction `rtl`, no EOL and font reference `g_d0_f3`. Other single items contain `مهندس برمج يات` and `ج امعة الملك سعود`. No inter-item join can undo those internal spaces. The same PDF's default Poppler output contains all critical fields, but relocates dates after unrelated sections; its layout output preserves their geometric associations. The default-reader failure remains a failure.

All 104 retained pilot/template PDFs were re-read through the production geometry path. Pilot PDF.js candidate passes stay **15/50**; template PDF.js candidate passes stay **16/54**. No case changes its missing-field list. This is a diagnostic re-extraction of retained bytes, not a newly rendered pilot or accepted corpus.

### Failure attribution

Counts below overlap: one file can fail both field recovery and associations. They are diagnostic counts, not human adjudication or independent scenario counts.

| Cause / contract                                                                                          | Before                                     | After / finding                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Harness adds spaces between items, three independent native join regressions                              | 3/3 fail                                   | 0/3 fail after repair; no claim of full native qualification                                                                                                                                           |
| Harness join alone explains the 35 failing Arabic/mixed pilot files                                       | Suspected by handoff                       | 0/35: every file still fails after production geometry joining                                                                                                                                         |
| A missing pilot critical field has all its non-whitespace characters inside one already-split PDF.js item | Not attributed                             | 35/35 Arabic/mixed files; all 36 Arabic/mixed template diagnostics also have this symptom                                                                                                              |
| Default Poppler association diagnostic fails                                                              | 19/20 Arabic, 11/15 mixed                  | Unchanged reader/policy; raw output shows detached dates in AR01, but interval/occurrence findings still require adjudication                                                                          |
| English Persian name comparison                                                                           | 1 template case fails                      | Source `Ada Lovelace` is exported as `ADA LOVELACE`; presentation/case-policy disagreement, not evidence of missing name letters                                                                       |
| English Smeargle role occurrence comparison                                                               | 1 template case fails                      | Headline is uppercase and letter-spaced; body contains `Software Engineer` once. Gold requests its second exact occurrence. This occurrence assumption fails, not proof that the body role disappeared |
| AR03 Hijri/ambiguous raw dates                                                                            | 1 pilot case, two fields fail both readers | Actual digit order differs: `٠١/٠٢/٢٠٢٤` reads as `٤٢٠٢/٢٠/١٠`; `١٤٤٥` reads as `٥٤٤١`. Both explicit LTR and RTL minimal renders reproduce it                                                         |

AR15/MX15 additionally wrap the name across lines and split `الشمري` internally (`الش مري`). The line break is equivalent under the existing whitespace policy; the internal split remains a reader/export interoperability defect. No missing-field list was edited, no casing/occurrence policy was relaxed, and no template is newly qualified.

### Bounded repair probes

The installed Forme 0.28.0 core was called directly with one page, one text node and the same checksum-verified Noto Sans Arabic source font used by the baseline. Input: `شركة الأفق مهندس برمجيات جامعة الملك سعود`. Six renders tested defaults, explicit RTL, tagging, PDF 2.0, greedy/manual breaking and zero letter/word spacing. All reproduce internally split PDF.js words; Poppler recovers the logical words. These bypass Reactive Resume templates, semantic conversion and the qualification join. This localizes the symptom to Forme output/PDF.js interpretation, without claiming the precise upstream code defect has been repaired.

Operator evidence shows zero-width U+200B runs and compensating text-position adjustments around shaped glyphs. PDF.js has a positional `addFakeSpaces` path in the installed reader; Poppler handles the logical text differently. This is an interoperability diagnosis, not proof that the PDF lacks the source Arabic letters. Picking a font, stripping all Arabic spaces, reversing source strings, post-processing PDF bytes or changing only the comparator would not establish faithful support.

Six further direct probes tested Arabic-Indic and Persian ambiguous dates plus the Hijri range, each under explicit LTR and RTL. Both directions retain the digit reversal. Consequently, widening the application's numeric-date regex alone is not a demonstrated repair and was not applied. No renderer swap, dependency upgrade or speculative runtime workaround was made.

### New verification and retained evidence

| Run                                                           | Previous result                          | This follow-up                                                                       |
| ------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Fresh 12-case smoke, unchanged gold                           | AR 0/4, EN 4/4, mixed 0/4                | **Unchanged: 4/12**, all page analyses complete, all raw items retained              |
| Full 50-case render                                           | 15/50                                    | Not rerun because smoke did not improve; retained PDF.js re-extraction remains 15/50 |
| Full 54-case template render                                  | 16/54                                    | Not rerun; retained PDF.js re-extraction remains 16/54                               |
| Browser suite                                                 | 7 pass, 2 Arabic failures                | Not rerun because smoke did not improve; no new browser/visual pass claimed          |
| Tooling unit tests, excluding native importer artifact writer | Prior focused qualification total was 20 | **73/73 pass** across 14 tooling test files, including the six reader tests          |
| Tooling typecheck, repository lint, package boundaries        | Previously passed                        | Pass in this follow-up                                                               |

New server artifacts are under `test-results/document-qualification/attribution-2026-11-07/smoke/`. The runner accepts `DOCUMENT_QUALIFICATION_OUTPUT` so follow-ups can retain separate output. Raw-item/operator dumps, decoded AR01 content, per-field attribution, the 104-file geometry audit, twelve minimal-probe results and PDFs for the first six probes, and verification logs are under `.superpowers/t001-attribution-2026-11-07/`. All **116 previous smoke/pilot/matrix PDF hashes** still match their saved results. Previous browser/native evidence and handoff files were not overwritten.

The full repository formatter still reports the pre-existing untracked `.archon/.state/review-bots.json`; it is outside this task and remains untouched. No new product UI or runtime-rendering code changed in this follow-up, so no new production build, Figma inspection, browser run, native validation or DOCX viewer acceptance is claimed. The current changes are limited to `extract.ts`, its regression tests, `types.ts`, `run.ts`, the harness README and this evidence report. No commits, staging, pushes, PRs, services or real CV processing were performed.

### Decision needed

**Reactive Resume remains a viable application foundation; the present Arabic PDF export/extraction path is not qualified.** A01/A04 still require faithful critical words, raw dates and associations, plus reviewed Arabic gold, visual/clipping review, approved template/font coverage and a new blind evaluation. A05 remains deferred. Fixing the test harness does not approve the engine.

No small application-side repair was demonstrated by the bounded probes. Three ways forward are (1) a bounded alternative-renderer experiment behind the same export contract, (2) a deeper upstream Forme shaping/text-encoding patch with its own regression work, or (3) an explicit reduction/deferment of Arabic export scope. **Recommend (1): a synthetic experiment against unchanged gold, not a renderer migration or product rewrite.** The handoff explicitly forbids a renderer swap; the experiment and any later replacement or scope change need an owner decision. No option has been implemented or approved here.
