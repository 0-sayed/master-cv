# T006 implementation evidence

Local implementation on `feat/t006-reviewable-ai`, based on `9c6d5fca2f65a75ef9f4d4a33716ce19ae123846`, updated 2026-11-14. Changes remain uncommitted. T006 remains unchecked in the task graph; this document grants no release approval.

## Requirements and implementation

Owns B-C04 and A02 evidence, per the roadmap responsibility map. Contributes to B-C02/B-C03/B-C05/B-C07/B-O02/B-O03 and A01/A03/A06/A07/A08/A11/A13.

- Versioned review envelopes bind opaque evidence IDs to owner-scoped CV revisions, targets, accepted fact revisions or immutable selected import text. Answers retain their original CV and target binding. Contacts and markup are minimized before payload construction.
- Deterministic validation precedes delivery and usage settlement. Recognized facts, citations, negation, date precision and curated claim-strength terms fail closed; general wording and order may change. Token and lexicon checks do not establish semantic entailment, causality or role associations.
- Accept, edited acceptance, rejection and Undo use owner locks, optimistic document revisions and idempotency keys. Accepted CV changes, history and decision provenance commit atomically. Untouched siblings rebase only across this review's acknowledged changes after reconstructing the original full-field hash; manual edits remain stale. Undo survives reload and preserves unrelated manual work; changed or ambiguous inverse passages conflict.
- Writing, Improve and assistant use one review service and save coordinator. Draft flush is required before starting/applying; responses cannot overwrite newer typing. Add information saves explicit user-supplied evidence without changing master facts or the CV.
- Native extraction assistance sends only selected text recovered by the existing importer. Candidates remain uncertain and local until the existing T004 confirmation. Applying a candidate invalidates prior confirmation and cannot race final submission. Original files stay local; OCR and DOCX support are unchanged.
- Expired staged sources are deleted in bounded owner-scoped maintenance. Restricted runtime roles cannot modify decision history or staged source contents. Generated results remain immutable.

## Design inventory and D35/D36 decisions

Authorized live Figma renders were inspected on 2026-11-12 in [Master CV: Design (v1)](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni).

| Inventory                                                  | Desktop                                                                            | Mobile                                                                         | Implementation evidence                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| S11 original/proposed, reason, evidence, actions, question | [30:1445](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=30-1445)     | [44:1084](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=44-1084) | Existing editor shell, ChangeSet, source disclosure and field selection                                       |
| Editing                                                    | 51:155                                                                             | 120:10393                                                                      | Shared dialog, editable wording, explicit save and neutral Cancel                                             |
| Accepted / own wording                                     | 51:459 / 258:30445                                                                 | 52:7892 / 259:14793                                                            | Saved state, provenance and durable Undo                                                                      |
| Stale                                                      | 51:601                                                                             | 120:10498                                                                      | Disabled application, request-again launcher and Keep original dismissal                                      |
| Unavailable / exhausted / not enabled                      | 52:1255 / 52:1391 / 80:31018                                                       | 120:10735 / 120:10787 / 120:10839                                              | Shared warning/recovery, retained manual editing and PDF access                                               |
| Add information                                            | [259:22002](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=259-22002) | 259:39520                                                                      | Shared direction-aware dialog, labelled input, Save and Cancel                                                |
| S07 native confirmation                                    | [28:875](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=28-875)       | [43:755](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=43-755)   | Selected-text assistance, local candidates, real final confirmation                                           |
| S08 / S10 / S12 return paths                               | 22:560 / 30:1291 / 31:1468                                                         | 41:412 / 44:1018 / 44:1149                                                     | Existing editor/check/export consumers retained; desktop renders inspected, mobile return frames map-resolved |

Layout decisions: reuse the existing editor preview and ChangeSet rather than duplicating the Figma split preview (D35/D36); use existing shared dialog components for desktop/mobile; require explicit field selection to minimize payloads rather than silently reviewing the first ten fields; preserve deterministic Writing findings alongside optional semantic review. Shared tokens and semantic variants govern controls; no new call-site control-size overrides.

AR/EN interface checks use the opposite saved CV language to verify language isolation. Browser assertions check loaded Noto Sans/Noto Sans Arabic, direction and overflow at 1440/390, plus 320 reflow. Visual inspection covered comparison, edit/Add information dialogs, accepted/stale states and native assistance/consent. Shell widths and existing layout remain shared. Generated synthetic questions/reasons remain source content and are not interface translations.

## Payload minimisation fix

D09/D16 require selected CV text without contact fields. `packages/api/src/features/ai/payload.ts` now identifies the contract as `t006-payload-v2`: it separates chronology and percentages before phone matching and requires URL structure or an explicit contact label rather than treating every dotted token as a contact. Gregorian/Hijri dates, Arabic/Persian digits, numeric achievements, currency amounts and dotted technology names such as Node.js and ASP.NET remain factual input. Known contact values, emails, phone/identity patterns, handles and URL forms are redacted; markup is removed and entity-encoded bypass input is rejected. Original attachments, unrelated history and contact objects do not enter the model contract.

This is bounded heuristic minimisation, not proof of anonymisation or universal contact detection. The adjacent payload regressions cover preserved facts and redacted contact forms; final check results belong in the pending record below.

## Benchmark summary and default models

The [benchmark history](t006-benchmark-history.md) owns run identities, costs, model/effort comparisons, failures, repairs and re-test rules. It supersedes the earlier fake-only forecasts, blocked-control counts, provisional grids and statements that no paid inference occurred. The core paid full run `2026-11-13T14-18-44` completed **2,772 sessions**, with no stop reason, in approximately two hours: **$3.67 OpenRouter + $1.48 OpenAI**. Approximate cumulative core-study spending was **$6.6 OpenRouter + $1.8 OpenAI**, including earlier attempts.

Luna/Terra were measured through owner OpenAI BYOK via OpenRouter, non-ZDR and synthetic-only; the planned product route is Azure ZDR and remains subject to A11. DeepSeek used Together. Benchmark latency does not establish Azure latency.

| Core operation                | Provisional holdout recommendation | Safety | Cost / 1,000 operations | p50    |
| ----------------------------- | ---------------------------------- | ------ | ----------------------- | ------ |
| Wording                       | Luna low                           | 36/36  | $1.23                   | 7.6 s  |
| Extraction                    | Luna none                          | 36/36  | $0.78                   | 6.1 s  |
| Missing-information questions | Terra medium                       | 36/36  | $1.53                   | 7.7 s  |
| Injection resistance          | Luna low                           | 36/36  | $1.78                   | 12.7 s |

The history records zero invented facts accepted in the 2,772-session core study with the DeepSeek low verifier. These finite-corpus observations follow offline guard/scorer corrections; they do not establish zero future errors or production qualification.

The latest owner build defaults differ from the cheapest extraction holdout recommendation:

| Operation                                        | Default writer / effort             | Verifier                          |
| ------------------------------------------------ | ----------------------------------- | --------------------------------- |
| Wording / injection resistance                   | Luna low                            | DeepSeek V4.1 Flash low, Together |
| Extraction assistance                            | Luna high; Luna none acceptable     | DeepSeek V4.1 Flash low, Together |
| Missing-information questions                    | Terra medium                        | DeepSeek V4.1 Flash low, Together |
| Summary / job-evidence / tailoring / translation | Luna low; upgrade path Terra medium | DeepSeek V4.1 Flash low, Together |
| Cover-letter / interview-prep                    | Luna low; upgrade path Terra medium | DeepSeek V4.1 Flash low, Together |

These defaults are the recorded owner decision, not a claim that the concurrent model-configuration lane has passed verification. A DeepSeek writer uses Luna low as the cross-family verifier. Product delivery remains deterministic guard → independently pinned cross-family verifier → explicit user approval; quality ranking is advisory, while unsupported/lost/contradicted facts withhold proposals. Benchmark adjudication also examines guard-rejected outputs to measure false rejects without delivering them.

## Known limitations and follow-up ownership

- **Provisional winners:** the unified ten-task decision table and owner blind ratings for ties remain open. The earlier holdout underwent disclosed owner-authorized class inspection and a responsibility-label correction; it is not pristine generalisation evidence. Lexical guards cannot establish unrestricted Arabic named-entity recognition, semantic entailment, causality or role association. The independent verifier and user review remain required.
- **tasks-v1 paused:** the latest four-variant smoke stopped with `VERIFIER_FAULT` after 53/72 sessions; 44/72 verdicts violated the tasks-verifier protocol. Corrected offline canaries measured DeepSeek recall 48/51 and guard + verifier 49/51, with 0/16 honest false rejects; remaining misses concern Arabic/mixed interview-prep premises. Prompt v2 + one retry is implemented but unmeasured live. Partial smoke acceptance is not six-task qualification. The history's final “in progress” bullet is stale relative to its explicit pause decision.
- **Task-owned paid qualification:** T007 ends with job-evidence, tailoring, translation and summary benchmarks; T008 ends with cover-letter and interview-prep benchmarks. Each uses the T006 harness and draft contracts, owner-run smoke + full with Luna none/low and Terra medium finalists and DeepSeek verifier, recording results in that task's evidence. No paid run is authorized by this documentation lane. A larger benchmark remains planned before paid launch at T015.
- **Verifier availability:** Together rate limiting/timeouts exposed an availability risk. The [backup endpoint proposal](../Planning/context/technical/ai.md#verifier-availability-2026-11-13), preferably Parasail for the same model, is unapproved. It requires exact-endpoint privacy, precision, schema and Arabic-quality verification plus consent/route-bundle approval. Until then, primary unavailable means withhold/retry; no silent provider fallback. Decision-model checker candidates remain future experiments.
- **Tooling:** keep the hardened T006 harness for this task; [pilot promptfoo next](t006-benchmark-history.md#future-tooling-migrate-the-plumbing-to-an-existing-eval-framework), retaining production guard/verifier assertions, Arabic gates, owner ratings and separate OpenRouter/OpenAI budgets. No migration is claimed.

## Recorded implementation and validation evidence

This section retains earlier recorded results; this docs-only lane did not rerun them. [The validation receipt](t006-validation.json) retains earlier rounds and failure/rerun boundaries. Final checks after all concurrent changes are pending below; earlier green checks do not certify the current combined diff.

- Review persistence, owner-scoped decisions, stale revisions, accepted/edited/rejected/Undo behavior and synthetic PostgreSQL restricted-role integration were exercised in prior API/web/schema/resume runs. A prior root `test:ci` stopped at two tooling failures; affected tooling and unreached workspace scripts were then run separately. That interrupted root run is not a passing full-suite receipt.
- Round 5 recorded aggregate static PASS (22 workspace typechecks, Knip, 23-package boundaries), API AI **273/273**, evaluation **125/125**, zero skips, and **27 distinct browser cases**: existing review/native runtime 13, platform Improve 4, shell brand/alignment 6 and shell improvements 4. Browser setup failures and an interrupted shell run were corrected/rerun only for affected cases.
- Lane 21 recorded evaluation **836/836** across the original run and corrected-file rerun, fault matrix **492/492 + unique-ID test**, journal faults **12/12**, controls **126/126**, fake smoke/chaos **132/132** each, static PASS and roadmap **0 errors**. These synthetic transport results establish harness behavior, not paid model quality.
- Local `dev:real-ai` opt-in was exercised with synthetic data and an ephemeral HTTP stub: **12 focused tooling tests**, **2 real-database usage tests**, launcher HTTP 200 and rejection of app/benchmark credentials by synthetic test entry points. Production route activation and real-CV approval are separate; no live request is claimed for that stub validation.
- Prior Check/export browser evidence recorded **5 passes**, review/native functional/visual matrix **12 passes** and later return-recovery checks. Fonts, direction, overflow and saved-language isolation were checked in AR/EN at 1440/390, plus 320 reflow where recorded above. Recovery/locked/empty/fixed unit coverage is not described as screenshot coverage.

Durable inspected visual evidence remains in the existing audit archives:

- `t006-panel/check-panel/`: summary, findings, kept, fix-preview and export-blocker captures (20 inspected); `t006-panel/review-runtime/`: comparison, editing, Add information, accepted, own wording, stale and native assistance/consent.
- `t006-motion/shell/` and `t006-motion/review/`: shared shell corners, accepted/Undo feedback, edited wording and reduced motion (27 relevant captures inspected in that follow-up).
- `t006-rebuild/round5/improve/`: platform Improve AR/EN at 1440/390. The archive base is `/mnt/storage/master-cv-design-archive/ui-audit/`; these are historical inspected artifacts, not fresh captures from this lane.

### D35/D36 follow-up decisions retained

- Use flat finding cards and shared semantic badges/accordions to improve scanning; blocker/warning groups open, tips closed, kept/fixed findings collapsed. Only safe deterministic structured fixes expose preview/accept; arbitrary PDF text is not silently edited.
- Keep S12 download available with a shared blocker warning and View issues; retain deterministic Writing findings alongside optional review. Persist introduction dismissal and PDF ignore/restore choices with honest storage recovery.
- Fix shared shell gutter/header ownership once so sidebar/header borders and body start edges align. Use shared FactChip links for named “Used in” CV references, with expansion and accessible full titles.
- Acknowledge accepted wording only after the server decision; reuse shared motion/preview highlights, preserve durable Undo and reduced-motion feedback, and defer mobile preview feedback until Page opens. Feedback never enters PDF output.
- Preserve Check scroll and restore/focus the originating finding across editor views using existing state and acknowledgement behavior.

## Final validation record — combined checks (2026-11-14)

Run on the host after the pre-commit review fixes (Astra review: 10 findings fixed with regressions), the knip/boundaries fixes and the test:ci follow-up fixes.

| Check                                 | Final result / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format/lint incl. model configuration | Covered by `pnpm validate:static` (format check, lint, typecheck, knip, turbo boundaries): PASS.                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm validate:static`                | PASS (after adding `happy-dom` to tooling devDependencies at the root's existing 21.0.4; lockfile importer entries only).                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm test:ci`                        | EXIT 0. web 881/881; api 788 passed, 179 skipped; tooling 2,712 passed, 32 skipped; server 163 passed, 4 skipped; pdf 684; db 7 passed, 23 skipped; auth 34 passed, 7 skipped; remaining packages all passed. Skips are database-integration suites without a local PostgreSQL (password auth failed locally); CI runs them.                                                                                                                                               |
| Affected browser specs                | `node --env-file=.env.test.local tooling/local/ci-browser.mjs` on the 17 changed specs (reviewable-ai, reviewable-ai-improve, reviewable-ai-visual, ai-runtime-usage-visual, alert-notices-visual, check-panel-scroll, check-panel-visual, career-information, dashboard-_, layout-scrolling, shell-_): **92 passed (7.0 min)**, ar-SA and en-US, 1440/1780/1920/390 where specified. Logged ORPC "allowance unavailable"/"Conflict" errors come from negative-path tests. |
| AR/EN at 1440/390 visual review       | Automated visual specs above PASS; owner manual review with `pnpm dev:real-ai` pending.                                                                                                                                                                                                                                                                                                                                                                                    |
| Roadmap validator                     | `python3 Planning/roadmap/check.py`: Errors 0.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Docs-only lane format / roadmap check | 2026-11-14: roadmap 0 errors; formatting PASS.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| CI                                    | PENDING — green task PR checks before the final completion commit that ticks T006.                                                                                                                                                                                                                                                                                                                                                                                         |

## Release and completion boundary

A02 factual-fidelity/human model qualification, A11 approved processor/endpoint/transfer/consent, and A13 retained-feature availability/privacy/support and copy review remain unresolved. A01 import fidelity, A03 job-evidence attribution (T007), A06 persistence, A07 accessible recovery and A08 ownership retain their own acceptance evidence; no prototype, screenshot, synthetic test or paid benchmark alone passes those gates.

Before real CVs, consent/privacy notices and the approved route bundle must name both the writer processor (planned Azure for Luna/Terra) and Together for DeepSeek, or an explicitly approved alternative chain. No real-CV processing, payment or deployment is approved here. T006 stays unchecked until its final completion commit once CI is green; this lane leaves `dependencies.mmd` unchanged and performs no staging or commits.

### Pre-commit naming cleanup (2026-11-14)

Regression files and active CLI outputs use behavior names; imports, scripts and guide links follow the new paths. Historical result-directory names, freeze IDs and receipt hashes remain evidence identifiers. Obsolete synthetic browser QA and schema-v2 probe scripts are archived unchanged under `t006-grid/retired-scripts/` outside this checkout. Current tasks bytes are resealed with reason `naming cleanup`; historical core qualification remains stale. Actual validation results are recorded in the explicit external output report, not inferred from prior runs.

### PR #20 answer provenance and runtime naming corrections

The saved-answer follow-up regression first reproduced a conflict in `assertEvidence` on the second
acceptance, while the unrelated manual-edit rejection passed. Answer provenance now follows only a
continuous chain of the current review's accept, edited-accept and undo revisions; revision gaps still
reject with `AI_SOURCE_CHANGED`. The targeted decision suites pass 23/23, including both new database
regressions. The whole API AI folder passes 462/462 across 33 files, with no skips. This preserves B-C04
source provenance and explicit acceptance; no UI or Figma frames changed.

The synthetic browser entry points are `tests/e2e/reviewable-ai-runtime.config.ts` and
`tests/e2e/reviewable-ai-runtime-server.ts`; CI, the server script and the validation receipt use these paths.
The config's existing `test:review-runtime` command resolves through the updated server script. Playwright/Vite/Knip
and local tooling had no literal references to the old paths. Task evidence document names and the existing
T005 runtime remain unchanged. Browser execution belongs to the host lead; no paid inference was used.
