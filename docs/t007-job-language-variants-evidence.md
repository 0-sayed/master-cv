# Job evidence and language variants — execution evidence

Uncommitted implementation on `feat/t007-job-language-variants`, baseline
`97ac330678d90682b51327b7f1dec1dbb1d4495c`. No staging, commit, push, deployment,
paid inference, live canary, credential loading or catalog refresh was performed.
T007 stays unchecked/pending until a separately authorized first PR ship. Delivery
bookkeeping does not close A03 or any processing/release gate.

## Execution status

| Plan task | Result                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Explicit synthetic preload, credential/egress guard and disposable database baseline implemented and tested. Isolation incidents disclosed below.       |
| 2         | Immutable exact jobs, strict schemas, composite ownership/RLS, provenance and migration implemented.                                                    |
| 3         | Versioned literal matching, original UTF-16 spans, eligible CV passages and independent readiness implemented.                                          |
| 4         | Protected job APIs, intentional private copies, shared allowances and independent freshness implemented.                                                |
| 5         | Four production contracts, bounded source inventory, guards and complete closed-ID verifier implemented.                                                |
| 6         | Runtime preparation/execution/delivery fencing, semantic report and reviewed tailoring implemented.                                                     |
| 7         | Per-copy terminology, reviewed segments, final atomic language apply/undo/history and selected-fact summary implemented.                                |
| 8         | S19/S20, explicit semantic preflight, literal coverage, cited editor navigation and third readiness result implemented; focused lifecycle races tested. |
| 9         | S21, shared proposal review, term dialog/mobile sheet, clarification recovery and editor copy banner implemented.                                       |
| 10        | Unapproved scoped benchmark package sealed; offline controls/export/preflight/fake/forecasts executed. Paid qualification intentionally unrun.          |
| 11        | API/DB/web/contract/browser and clean-source checks executed. Deep failed; full recovery visual matrix remains incomplete.                              |
| 12        | Shipping timing reconciled; task graph left pending; evidence and benchmark handoff written.                                                            |

Implementation was inline without delegated implementation/review/browser agents.
TDD was used for isolation, schemas, matching, DB/service/runtime contracts,
decisions and the cited-target navigation helper; final card/lifecycle coverage
was added against the completed integration. No assertion that every planned test
was authored before its implementation, or that every matrix cell passed.

## Requirements, code and exact design references

B-C06 exact selected-job evidence and deliberate copies:
`packages/schema/src/job-evidence.ts`, `packages/db/src/schema/`,
`packages/api/src/features/career/{jobs,job-targets,job-router}.ts`,
`packages/api/src/features/resume/{variants,variant-router}.ts`,
`packages/resume/src/ats/job-evidence.ts`, `apps/web/src/features/career/`.
Protected API and DB suites exercise ownership, immutable revisions, optimistic
selection, allowance races, unchanged copy creation, stale source fences and purge.
Matcher tests exercise Arabic/Latin normalization, repeated passages, offsets,
ranked selection and hidden-term denominator stability. Readiness lifecycle tests
exercise no job/checking, independent dimensions, delayed A versus B and owner/CV
switch; the merge regression preserves a newer job result when PDF work completes.

B-C09 independent language copies and reviewed changes:
`packages/schema/src/resume/{variants,variant-outputs}.ts`,
`packages/api/src/features/ai/variant-*.ts`,
`apps/web/src/features/resume/variants/`, existing history/decision services.
Database-backed tests cover term/segment pending state, final apply/undo, rollback,
source/target revisions, historical locale/provenance restoration and unchanged
source. Summary uses selected confirmed evidence for the existing summary field.
Existing T005 usage/copy allowances and T006 proposals/history are reused; no
second facts store, standalone AI result ledger or automatic job-skill insertion.

A03 safety and approval:
production guards/verifier, scripted runtime transports and benchmark parity are
implemented; semantic quality, repeat-run disagreement, Arabic terminology and
paid provider/ZDR qualification remain owner work. See
[t007-benchmark-handoff.md](t007-benchmark-handoff.md).

Live authorized Figma context was read from file
[K3UTevGCFBhsoSLXH7BDni](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni).
Desktop/mobile pairs: S19 `33:1857` / `47:1365`; S20 `33:1997` / `47:1425`;
S21 `33:2204` / `47:1531`; terminology `259:22024` / `259:39545`;
translation review `80:30744` / `80:30897`; all requirements `258:33447` /
`259:14999`; clarification `260:70035` / `260:70224`.
Adjacent terminology/recovery states inspected: `259:52969`, `259:53203`,
`259:53435`, `259:31823`, `263:48859`, `263:49006`. Editor/entry observations:
`79:4140`, `79:4332`, S10 `30:1291`, S12 `31:1468`, S22 `34:2253`.
Mobile editor frames `79:4563` / `79:4608` were not visually inspected this run.
Render artifacts: `/tmp/figma-<node-id-with-hyphen>.png`.

## Inventory and deliberate layout/UX choices (D36)

- S19: existing source picker, role, optional employer, exact paste, privacy note,
  literal Compare, neutral Cancel, missing-input disabling and retained failure draft.
- S20: selected exact job, stable literal denominator, selection/truncation disclosure,
  original quotes and cited editor navigation, separate verified semantic findings,
  all requirement rows, explicit consent/cost/preflight, clarification, unchanged
  intentional copy and reviewed tailoring/undo with source-conflict recovery.
- S21: original/language cards, actual saved document locale, pending/accepted state,
  saved-text preview, independent source warning, included-copy admission and review.
- Shared proposal UI: source/target comparison, stable target patches/order proposals,
  accept/edit/reject/undo, unresolved terms and per-segment confirmation, disabled
  final approval until complete/current, explicit stale/error/reload recovery.
- Term dialog/sheet: visible source and existing value, required/maximum/plain-text
  validation, pending/error, one primary Confirm and neutral Cancel, keyboard focus
  return; clarification answer/dismiss reuses the same task overlay and existing
  explicit fact confirmation path. No global glossary or implicit master mutation.
- Existing summary entry gains selected-confirmed-fact review. Existing editor gains
  a truthful copy/source banner and job readiness; no new builder screen.
- Dynamic terminology replaces prototype's fixed three terms: actual source inventory
  determines confirmation count. All eligible segments replace prototype sample rows
  so required visible content cannot silently disappear. Saved-text preview replaces
  a PDF thumbnail because this task does not qualify rendering/export. Literal
  coverage selects up to 35 ranked distinct terms, never an ATS/hiring-success score.
- Existing shared controls/layout/type/tokens govern appearance. Generated translated
  rich prose is escaped into paragraphs: words retained, rich formatting not promised.
  Contact/name/location/profile/reference/link/date values remain unchanged/local;
  employer/institution/official qualification terminology is per-copy reviewed.
  Hidden/unplaced/reference/contact/cover-letter content is excluded from evidence;
  unsupported required visible translation content blocks full completion.

## Verification isolation and incidents

Node 24.22.1 / pnpm 12.14.0. `tooling/local/test-isolation.mjs` disables native
loading before transitive imports, retains actual runtime NODE_ENV, restricts fetch
to synthetic/loopback transports and rejects presence of inference credentials.
Browser child environment is explicitly allowlisted; isolated Vite uses envDir false.
The final isolation pair passes 20/0/0 (`/tmp/job-language-isolation-final.log`).

All successful database qualification used the supplied localhost:55432 Postgres.
Both mandatory DB variables target its postgres database; helpers create disposable
migrated databases and NOBYPASSRLS runtime roles. OAuth uses migrated
`job_language_oauth_current` on the same instance. No production database authorized.
Before the preload explicitly pinned transitive DATABASE_URL to the supplied
COVER_LETTER_TEST_DATABASE_URL, broad auth startup emitted failed authentication
attempts against an inherited localhost:5432 default. No successful connection was
observed; this was corrected and regression-tested. The initial browser command
also inherited a Turbo build whose configured `.env*` hashing prevents certifying
that no indirect environment-file read occurred. No direct environment-file read
or value disclosure occurred; the runner now builds direct workspaces without
Turbo hashing. These incidents prevent an unqualified claim of perfect isolation.

## Actual checks and limits

Counts are pass/fail/skip, not fabricated aggregate unique coverage. Full baseline
API: 970/0/0 with all three DB variables; initial named DB integrations 176/0/0.
Final full API: 989/1/0, with its stale history-service test mock corrected and the
affected history/service pair rerun **24/0/0**. Named `.integration.test` assertions
in that run: **191/0/0**, nonzero; other DB-backed assertions have different names.
No applicable API DB suite was skipped. Clean-source API gave the same result and
its affected corrected tests passed 24/0/0.

Direct Deep workspace equivalents were used to avoid Turbo `.env*` hashing. Passed
workspaces: utils 123, fonts 9, schema 127, UI 81, resume 266, AI 7, DOCX 22,
import 125, ODT 22, env 45, DB 31, email 8, auth 41, MCP 20, dsh 6, web **890/0/0**.
PDF **600/84/0** failed (fonts/text loss and related rendering assertions).
Server **166/1/0** failed required route metadata; the new private routes now have
Internal-tagged explicit metadata and its affected generator suite passed **8/0/0**.
Four empty/no-test server files are not four skipped test assertions.
Tooling **2678/46/32**: 44 document/font assertions and two freeze assertions;
the final freeze/parity/scope/key-file suite passes **15/0/0** after the final seal.
Mobile **10/1/0**: Linux Hermes lacks the installed iOS pod binary. Native source
was retained and tested. These are actual failures, not an established clean-baseline
comparison or a claim they are all unrelated regressions. No PDF/native fix was made.
Tooling's 32 skipped assertions include inherited gated document qualification;
they are not counted as passes. Deep is **FAIL**, not readiness to commit.

Latest focused web coverage after card/navigation/lifecycle additions: **16/0/0**
across seven files (`/tmp/job-language-final-web-focused.log`). Selected production
contract/replay tests: 39/0/0; clean-source contract groups: 96/0/0. The complete
web 890-test run preceded these additions; focused reruns cover changed consumers.

Logs: `/tmp/job-language-deep-tests.log`, `/tmp/job-language-deep-remaining.log`,
`/tmp/job-language-consumers-ci-final.log`, `/tmp/job-language-tooling-ci-final.log`,
`/tmp/job-language-mobile-final.log`, `/tmp/job-language-openapi-fixed.log`,
`/tmp/job-language-final-seal-tests.log`. JSON/JUnit are workspace report outputs.
Final static, clean-source fingerprint and fixture audit are recorded below after
execution; no root wrapper pass is inferred from constituent results.

## Browser functional and visual evidence

Synthetic Chromium transport uses the complete closed-ID verifier and real server,
authenticated APIs, Postgres ownership and transactions. No production test-only
real-CV processing route exists. Translation identity echoes test atomic review and
locale independence; they do not measure translation quality.

Added specs: `reviewable-ai-job-evidence.spec.ts` (2),
`reviewable-ai-language-variants.spec.ts` (3),
`reviewable-ai-variants-visual.spec.ts` (4). Together with existing reviewable-ai (5):
**14/0/0** (`/tmp/job-language-browser-final.log`). Existing improve (4) and visual (8)
regressions: **12/0/0** (`/tmp/job-language-browser-regression.log`). After correcting
the missing English Pending catalog entry, language specs passed **3/0/0** again
(`/tmp/job-language-browser-label-final.log`); cited-section navigation then passed
job specs **2/0/0** (`/tmp/job-language-browser-navigation-final.log`). Do not sum
reruns into unique test coverage. Artifacts respectively under
`/tmp/master-cv-ci-browser-IvWQfD/`, `/tmp/master-cv-ci-browser-tGTegA/` and
`/tmp/master-cv-ci-browser-iTUkCy/`.

S19/S21 AR/EN × 1440/390 screenshots and English terminology at both widths were
actually opened and inspected: direction/fonts, shell/card edges, readable saved
content, no horizontal overflow, neutral Cancel, primary action and focus return.
Native mobile select visually clips a long source title; full selected title is
also visible in the form. These are observations, not pixel-parity qualification.
No separate browser-testing agent was spawned. Remaining matrix: S20 semantic
supported/partial/absent/unclear + all-requirement expansion, clarification
save/skip/error/stale, term save/error/stale in AR and both widths, source/target
stale conflicts, two tabs, summary source selection, history/reload/undo,
readiness races, copy allowance denials, editor banner and shared proposal states
in all four language/width cells. Existing automated checks cover subsets; the
complete visual recovery matrix is **unverified**.

Host reproduction, from repository root with Node 24 on PATH (no environment file):

```sh
NODE_OPTIONS=--import=$PWD/tooling/local/test-isolation.mjs \
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres \
node tooling/local/ci-browser.mjs --config tests/e2e/reviewable-ai-runtime.config.ts \
 tests/e2e/specs/reviewable-ai-job-evidence.spec.ts \
 tests/e2e/specs/reviewable-ai-language-variants.spec.ts \
 tests/e2e/specs/reviewable-ai-variants-visual.spec.ts
```

Existing affected reviewable-ai, reviewable-ai-improve and reviewable-ai-visual specs
use the same config/runner. Reuse builds only for unchanged production source.
Default non-review history/readiness/document browser suites were not run here;
full browser/document qualification remains authoritative PR CI work.

## Open gates and handoff

No actual port/server sandbox blocker occurred. Deep document/font and native host
failures remain; broader recovery visual qualification remains open. Owner-paid
semantic/repeat/Arabic review, refreshed price/budget authorization, provider/ZDR
and release approvals remain open. No model selected from fake output. DOCX,
paid processing, deployment, sharing/B2B and integrations retain their existing gates.

Changed screens for the browser-testing session: S10 document entry/menu, S12 source picker, S19 job target, S20 literal/verified job evidence and
copy/tailoring review, S21 language cards/review, S22 existing editor summary,
job readiness and variant banner; shared proposal comparison/accept/edit/reject/
undo; all-requirement rows; clarification dialog/sheet; term correction dialog/sheet;
pending/failed/partial/stale/source-unavailable/allowance-denied/atomic-approved/
history-restored states. This list identifies changed surfaces, not all verified cells.

## Final static and clean-source receipt

Static constituent checks: **5 pass / 0 fail / 0 skip** after corrections:
`pnpm exec vp fmt --check`, `pnpm lint`, direct
`pnpm -r --workspace-concurrency=2 run typecheck`, `pnpm knip`, and
`pnpm exec turbo boundaries`. Commands were run with Node 24, explicit synthetic
preload and `--config.verifyDepsBeforeRun=false`; typecheck used direct workspaces
to avoid root Turbo environment-file hashing. Boundaries checked 2,086 source
files in 23 packages, zero issues. The last added component test separately passes
lint and web typecheck. Copy bindings: zero diagnostics across ten surfaces;
roadmap: zero errors (589 planning links); `git diff --check` passed.
Logs: `/tmp/job-language-static-{format-check,lint,types,knip,boundaries}-final.log`,
`/tmp/job-language-copy-final.log`, `/tmp/job-language-roadmap-final.log`.
No root `validate:static` or `test:ci` wrapper pass is claimed.

Clean source: `/tmp/master-cv-job-language-source/`, 3,411 captured source files,
SHA-256 `5535092c801b703722f85813dbe438d1b20e17feb84fea8e7303c397b7d19d68`.
The manifest is `/tmp/job-language-source-manifest.json`; private `.env*` and ignored
inputs are excluded, workspace package links do not point back to the dirty tree.
The offline frozen-lockfile install with scripts disabled passed using the existing
local package store and an explicitly writable temporary runtime/cache directory.
After initial clean-source full API/web/contract runs, final affected reruns pass:
API/DB/history **35/0/0**, contract/isolation **35/0/0**, web **16/0/0**, server route
metadata **8/0/0**. The additional S20 semantic-versus-literal component assertions
pass **2/0/0** in both checkouts. Those assert unavailable semantic processing and
all four verified verdicts cannot change the literal denominator. Auth under the
corrected pinned DB preload passes **41/0/0**. New tests added after the full web
890-test run are reported separately rather than silently changing its count.
Logs: `/tmp/job-language-clean-{install,web,db,contracts,routes}-final.log`,
`/tmp/job-language-clean-evidence-component.log`, `/tmp/job-language-auth-final.log`.

Fixture dependency audit checked 145 new relative imports across 61 intended new
source files: zero missing clean-source inputs and zero literal temporary-file
read inputs (`/tmp/job-language-fixture-audit.json`). Existing optional historical
replay tests may read ignored prior results; they are not claimed as independent
synthetic fixture qualification.

Uncommitted implementation diff SHA-256:
`dd64b1421fec73454d1879c57af3becc5f104fcb5cef4daa3c1a2d67a838acc1`.
Exact algorithm and baseline are in `/tmp/job-language-final-source-proof.json`:
tracked binary diff plus sorted intended-new-file byte hashes, excluding private
environment files and these two evidence/handoff documents to avoid a circular
self-hash. The clean-source fingerprint includes its captured document versions;
only receipt text was appended afterward, no executable source changed. No staged
changes; HEAD remains the baseline. The task ledger records Task 11 as partial,
not fully qualified. Remaining checks/gates above are explicitly open.

## Final copy-entry reconciliation

The existing standalone source-picker entry now continues to S19 before any copy
or inference is created. An explicit existing application context retains its
application-linked copy flow and submitted-snapshot semantics; it does not silently
replace that workflow with a pasted-ad copy. Both reuse one source-picker component.
Opening the resulting CV no longer auto-opens an AI assistant. This is a D36 entry
flow distinction, preserving existing application behavior while making standalone
T007 copies use exact selected ads and reviewed proposals.

RED: two updated copy-entry assertions failed against old behavior. GREEN: source
entry, missing source, retained quota-denial draft and provider/import regressions
pass **5/0/0** in both working and final clean-source checkouts. Logs:
`/tmp/job-language-copy-entry-{red,green}.log`,
`/tmp/job-language-clean-copy-entry-final.log`. Changed-file lint, web typecheck,
full lint/design tokens, Knip and boundaries pass again after this integration.
The source/diff fingerprints above include this final source-picker implementation.
S12 AR/EN desktop/mobile visual checks remain part of the unverified matrix.

Final stable-source retained job-saving browser regression: **4/0/0**, default
runner, `/tmp/job-language-browser-copy-entry-final.log`. This covers linked blank
creation, deliberate linked copy/submitted-history preservation, unsafe URL paste
recovery and bounded posting clipping. Host command (Node 24):

```sh
NODE_OPTIONS=--import=$PWD/tooling/local/test-isolation.mjs \
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres \
node tooling/local/ci-browser.mjs tests/e2e/specs/job-saving.spec.ts
```

## Browser QA repairs — 2026-11-14

This receipt supersedes the earlier local font/static blockers for these checks.
B-C06/B-C09 and the summary contract retain the screen/state inventory above;
the live Figma clarification reference `260:70224` was rendered again, without design writes.

- Summary/job launch 400s: the shared launcher spread preparation-only `evidenceIds`/`contractVersion` into a strict operation request. Send only contract fields; new consent/Start-review unit cases validate the real schema, and browser cases use both actual launchers at AR/EN × 1440/390.
- First translation rejection 404: initialize the complete pending segment/term payload before rejection. Local rejection undo restores its prior segment without saving CV content; integration and browser regressions cover reject → undo → complete approval.
- Translation placeholders: resolve inference tokens in the owner-scoped comparison using source/confirmed terms, keeping the raw ledger intact. Integration tests check initial/edited-term display and applied text; browser approval asserts readable institution/qualification and no tokens. D36: withhold stale translation comparisons because their token registry cannot safely be reconstructed; retain recovery notice.
- Job clarification: return pinned job spans, show cited requirement text and a localized verdict, and ask the actionable Lingui question in both catalogs. API/component/browser assertions cover the exact “TypeScript and SAP required” path and exclude raw `no_evidence`.
- Clarification direction: generated prompts and requirement context use `dir="auto"`; an RTL-overlay unit regression and Arabic mobile browser assertions cover English content. Existing shared dialog/sheet controls and tokens remain in use.
- Test guard: block only the specified AI provider hosts/subdomains while retaining credential/environment-loader checks; allow font/CDN requests. Provider-block/font-allow unit cases failed before repair and pass afterward.

Each product regression was observed RED before its fix: `/tmp/t007-{launch,translation,requirement,clarification}-red.log` (the clarification log includes the RTL-overlay failure). Guard RED: `/tmp/t007-guard-red.log`. GREEN: API **17/0/0** across six affected integration suites using the mandated disposable PostgreSQL instance; full web **905/0/0**; full PDF **684/0/0**; `pnpm validate:static` **PASS**. The initial PDF run had one transient Noto Sans fetch failure; its unchanged test file passed **14/0/0**, then the full rerun passed. Logs: `/tmp/t007-{api,web,pdf-final,static-final}.log`.

Full `cd tooling && pnpm exec vp test run`: **2717 pass / 9 fail / 32 skip**, with every failure caused by the two intentionally changed sealed dependencies. After the unsigned v28 seal/receipt update, all five affected guard/freeze/CLI/startup/study files pass **35/0/0**, including all nine failures; unchanged document/font tests had no failures. The 32 skips are existing optional historical-evidence replays, not DB integration skips. Fresh scripted control scans pass **1056 / 699 / 72**; historical core seals remain unchanged and approval remains UNAPPROVED. Logs: `/tmp/t007-tooling.log`, `/tmp/t007-tooling-repaired.log`, `/tmp/t007-controls.json`.

The requested three-spec browser command built the synthetic runtime and passed job evidence **2/0/0** and visual surfaces **4/0/0**. A misplaced new test declaration and an incorrect Arabic test label were corrected; the affected language spec then passed **8/0/0** with unchanged production builds (`--skip-build`). Final distinct coverage: **14 pass / 0 fail / 0 skip**. Settled AR/EN desktop/mobile summary and clarification screenshots, plus readable translation comparison, are under `/tmp/master-cv-ci-browser-ZxQm1E/browser/`; visual surfaces are under `/tmp/master-cv-ci-browser-HdGNDH/browser/`. Logs: `/tmp/t007-browser.log`, `/tmp/t007-browser-language-final.log`.

All repairs remain unstaged/uncommitted on `feat/t007-job-language-variants`; no push, environment-file read, paid inference or other DB instance was used. A03 and existing release/processing gates remain open. Earlier clean-source fingerprints and v27 benchmark exports are historical receipts and do not qualify these changed bytes.

## Browser coverage gap closed — 2026-11-14

B-C06/B-C09 coverage now uses three evidence-bound synthetic tailoring patches, including an unchanged negation. No production inference transport changed. Live S21 metadata (`33:2204`) and the shared unavailable recovery render (`52:1255`) were checked in the design file above; S20/S21/S22 and their adjacent recovery inventory remain as recorded above.

- **1 — `reviewable-ai-job-evidence.spec.ts`:** proposals, accept, undo, edit-and-apply through Save wording, reject, reload, exact persisted summary/project text and unchanged source.
- **2 — `reviewable-ai-language-variants.spec.ts`:** name an earlier language-copy revision, edit again, restore through History, reload, and verify the source is unchanged.
- **3–5 — `reviewable-ai-review-recovery.spec.ts`:** copy/operation allowance denial without deduction; actual editor autosave makes all three proposals stale, then a fresh review recovers; partial evidence, failed delivery and unavailable processing have shared warn notices with icon, title, explanation and exercised recovery. Partial means an evidence verdict, not a new operation lifecycle state. Literal comparison and CV content remain unchanged by these recovery paths.
- **AR/EN × 1440/390 — `reviewable-ai-variants-visual.spec.ts`:** tailoring acceptance persists across reload; failed review releases its reservation; direction, fonts and horizontal overflow are asserted. Tailoring/error screenshots were captured and inspected in all four combinations. Existing visual specs capture screenshots without baseline comparisons; no pixel-comparison pass is claimed.

Product bugs were tested RED before repair: terminal notices lacked a description/recovery action, and partial evidence lacked a complete recovery notice (`/tmp/review-notice-red.log`, `/tmp/partial-review-red.log`). Fixed in the shared notice and evidence-review layers with existing Alert/Button variants and localized copy. D36: separate title/explanation and expose Retry so retained work and recovery are explicit; no local layout/token overrides. The empty-patch browser failure was also reproduced before the fixture repair (`/tmp/tailoring-browser-red.log`).

Final validation, **pass/fail/skip**: full web **908/0/0** (`pnpm --filter web test`); affected API **22/0/0**, seven files; `pnpm validate:static` **PASS**; requested four-spec browser run **26/0/0**. All commands used Node 24 with `NODE_OPTIONS=--import=$PWD/tooling/local/test-isolation.mjs`. API tests used both `COVER_LETTER_TEST_DATABASE_URL` and `INTEGRATIONS_TEST_DATABASE_URL` set to `postgresql://postgres:postgres@localhost:55432/postgres`; browser used the same instance via `E2E_DATABASE_ADMIN_URL`. No integration skips.

API command: `pnpm --filter @reactive-resume/api test src/features/ai/job-evidence-review.integration.test.ts src/features/ai/translation-review.integration.test.ts src/features/ai/summary-review.integration.test.ts src/features/ai/variant-delivery.integration.test.ts src/features/ai/variant-contracts.test.ts src/features/career/job-targets.integration.test.ts src/features/resume/variants.integration.test.ts`.

Browser command: `node tooling/local/ci-browser.mjs --config tests/e2e/reviewable-ai-runtime.config.ts tests/e2e/specs/reviewable-ai-job-evidence.spec.ts tests/e2e/specs/reviewable-ai-language-variants.spec.ts tests/e2e/specs/reviewable-ai-variants-visual.spec.ts tests/e2e/specs/reviewable-ai-review-recovery.spec.ts` with the requested Node 24 PATH and isolation/database environment above. Logs: `/tmp/variants-{web-final,api,static-final,browser-final}.log`; screenshots/traces: `/tmp/master-cv-ci-browser-6pEpXM/browser/`.

This closes the five requested browser gaps only. A03 semantic-quality qualification and existing release/processing gates remain open. No commit, staging, push, environment-file read or paid inference occurred.

## PR #21 review repairs — 2026-11-14

The paginated skill GraphQL scan returned 54 unresolved Greptile/Cubic threads. Code validation combined duplicates into 37 worth-fixing items (41 threads), all implemented, and 13 not-worth-fixing items (13 threads). The ignored root `pr.md` preserves every raw body and thread ID; only the implemented section is checked. GitHub threads were neither replied to nor resolved.

B-C06/B-C09 regressions were reproduced before repair. Translation rejects incompatible source/copy structure at preparation and final apply; confirmed terminology is immutable after approval until undo. Job copies can independently replace their exact ad through one atomic save/select operation. Review views accept valid 32,000-character job segments. Summary display and saves restore protected names locally, including literal dollar-sign replacements. Rich translation retains paragraph/list blocks; undo cannot target an undo event.

D36: restore selected-job literal evidence in the editor through the existing shared evidence card, retaining matched/unmatched terms and source navigation; show a neutral Checked badge because lexical coverage is not a pass verdict. Keep translation term controls disabled after final approval until undo, show clarification dismissal/failures explicitly, and remove the stale-state Suggest again action that only refetched the same operation. These changes use existing shared controls and semantic tokens. Requirement-driven recovery refuses a structural refresh rather than silently adding/removing content in an independent copy.

Design references remain the S19/S20/S21 and recovery inventory above. Current authorized S21 desktop metadata/render (`33:2204`) was verified again; no Figma changes were made. The changed UI remains governed by existing shared code under D35/D36. A03 semantic quality, provider qualification and release approvals remain open.

Benchmark inputs were resealed through the existing freeze tooling, with an explicit history reason and fresh offline controls (1,056 all-category / 699 scoped / 72 canary, zero failures). The current unsigned seal is v30; old qualification receipts remain historical. No paid calls, environment-file reads, staging, commits or pushes were performed.

The first review-repair browser run reproduced an untranslated evidence-link label and a synthetic transport still reading the old combined writer payload. The shared evidence component now uses its existing copy-deck binding; the browser fixture reads the separated confirmed CV and untrusted job pools. The stale-review browser contract now requires the removed no-op Suggest again action to be absent while retaining Retry, a genuinely fresh review, all three recovered proposals and unchanged manual/source data. No assertions of those recovery/persistence outcomes were removed.

Final review-repair validation, **pass/fail/skip**:

- Affected API: **498/0/0** across 43 files (`pnpm --filter @reactive-resume/api test src/features/ai src/features/career/job-targets.integration.test.ts src/features/resume/variants.integration.test.ts src/features/resume/variant-router.test.ts`). The final literal-placeholder preview change also passed all 11 translation integration tests. Both mandated DB variables named only `postgresql://postgres:postgres@localhost:55432/postgres`; no DB tests were skipped.
- Full web: **922/0/0** (`pnpm --filter web test`), rerun after the shared evidence-link correction. Resume: **270/0/0**; schema: **129/0/0** (`pnpm --filter @reactive-resume/resume test`, `pnpm --filter @reactive-resume/schema test`).
- Review tooling: **2363/0/0**, 81 files (`cd tooling && pnpm exec vp test run evaluations/review`). All 135 sealed dependency hashes match current bytes. Fresh controls are recorded above.
- `pnpm validate:static`: **PASS**, rerun after the final code/fixture changes. Changed-file format/lint and `git diff --check`: **PASS**. Roadmap checker: **0 errors**.
- Requested four browser specs: **26 distinct pass / 0 fail / 0 skip** on the repaired source. The fresh complete command received SIGTERM after 23 passes, with no failing case; the remaining three visual cases then passed in a fresh disposable database using `--skip-build` and a title filter for only those unfinished cases. Port 3030 was free before each start and after completion; no unrelated process was killed. This is distinct-case coverage across two runs, not a claim of one uninterrupted 26-case run.

All commands used the requested Node 24 PATH and explicit isolation preload. The full browser command was the requested `ci-browser.mjs --config tests/e2e/reviewable-ai-runtime.config.ts` invocation with job-evidence, language-variants, review-recovery and variants-visual specs; the recovery invocation selected `tailoring decisions and failed-review notice (en-US 390|ar-SA (1440|390))` in the visual spec. Browser admin URL named the same mandated local instance. The initial pre-repair browser failures are retained in `/tmp/master-cv-browser-final.log`; final browser logs are `/tmp/master-cv-browser-repaired.log` and `/tmp/master-cv-browser-unfinished.log`. Other final logs: `/tmp/master-cv-{api,resume,schema,tooling}-final.log`, `/tmp/master-cv-web-repaired.log`, `/tmp/master-cv-static-repaired.log`.

Functional evidence includes API persistence/rollback and browser interaction assertions. Separate visual evidence: inspected AR/EN summary/clarification output at 1440/390, terminology dialog/sheet at both widths, and failed-review recovery at AR desktop/mobile and EN mobile. Screenshots are under `/tmp/master-cv-ci-browser-sPhDUF/browser/` and `/tmp/master-cv-ci-browser-ha1WV1/browser/`; tests assert direction, fonts and horizontal overflow. No pixel-baseline comparison is claimed.

No worth-fixing item remains open locally. The 13 unchecked pushbacks await the lead's GitHub replies; all 54 GitHub threads remain untouched by this work. A03 and existing processing/release approvals remain open. Nothing was staged, committed or pushed.
