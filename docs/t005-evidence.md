# T005 implementation and evidence

Date: 2026-11-11. Branch: `feat/t005-ai-runtime-usage`. Base: `ad943613c`
(merged T004, PR #14). This records an uncommitted implementation, not a
merge, deployment or processing approval. The existing `AGENTS.md` task-tick
rule belongs to this task's PR and is preserved. T004 is being reconciled as
complete; T005 remains unchecked until its PR's last commit after CI is green.
Execution notes remain in a local, uncommitted execution workspace.

Owns **B-C11, A11**. Contributes to **B-C04, B-C06, B-C07, B-C10, B-O02, B-O04,
A02, A03, A06, A07, A08, A12, A13**. No A01–A16 gate is passed by this record.

## Delivered contracts

- `packages/schema/src/ai-operation.ts` and `ai-usage.ts`: strict immutable
  operation/source/route binding, public states, explicit resume capability,
  typed denials and nonrenewing Start usage.
- `packages/db/src/schema/ai-operation.ts` and generated migration
  `20261111193937_t005_ai_runtime`: forced owner RLS for operations, attempts,
  consent and append-only reservation/settlement/release events. Finished
  attempts and immutable bindings have database guards. Owner-safe references
  and unique terminal ledger events prevent cross-owner attachment/double charge.
- `master_cv_ai_queue_owners()` discovers bounded owner IDs only.
  `master_cv_ai_admit_budget(operation_id, request_cap_micros, day_cap_micros)`
  checks the server manifest against separately provisioned policy and serializes
  platform admission across owners/policy rows. `master_cv_ai_reconcile_budget`
  retains unknown costs. PUBLIC execution is revoked; the restricted application
  role cannot directly mutate budgets or rewrite the ledger. Migration also
  upgrades previously provisioned append-only runtime roles.
- `packages/api/src/features/ai/operations.ts`, `operation-worker.ts`, `usage.ts`:
  owner-locked reservation/enqueue/copy claims, raw-request replay fingerprint,
  validated normalized parameters, leases/fencing, cancellation, crash recovery,
  private result publication and atomic result/copy/history/settlement. Review
  results count once when durably delivered, not again when accepted/rejected.
  Unknown prior provider outcomes terminate without blindly repeating a call.
- Synthetic limits: 3 total calls, 1 repair, 30-second call timeout, 120-second
  operation deadline, 32,000 input Unicode code points, 4,096 output tokens,
  60-second lease / 15-second heartbeat, one active task per owner and two
  globally. Retry backoff/jitter is bounded and deadline-checked. Remaining
  request budget must cover the reviewed conservative cost of the next call.
- `ai/route-policy.ts`, `consent.ts`, `payload.ts`, `adapter.ts`: server-composed
  exact endpoint/model/downstream/config/notice binding, persisted purpose-bound
  consent/revocation, confirmed selected-text minimization, contact redaction,
  structured output validation, no fallback/tools/SDK retries, bounded response
  reads and error codes. Attachments/history/locators/contact objects do not
  enter the payload contract. Rich-text-split known contacts are redacted.
- The production composition is **empty routes, empty handlers, worker unavailable**.
  HTTP flags, environment credentials, custom endpoints and credential-test
  success cannot activate it. Legacy improvement, assistant generation,
  applications, cover letters, career/voice/scheduled and provider-test egress
  fail closed before model construction. PDF/DOCX AI parsing and ATS denials stay.
- `createResumeInTransaction` centralizes creation, quota and first history in
  the caller transaction. Start permits 1 retained base plus 1 language and
  1 job copy per owned root; copies of variants normalize to that root. Trash
  counts until purge. Promotion may preserve an existing over-limit inventory;
  editing, history and PDF remain independent of new-creation admission.
  Confirmed-import replay precedes quota admission.
- Existing thread/message storage is reused: start/status/stop/result adapters,
  exact provider binding and persisted result message. PostgreSQL polling recovers
  bounded results without claiming Redis resumed. Legacy generation remains denied.
  Decisions validate stored message/tool/edit identity and prior status in one
  transaction; failed writes remain visibly unconfirmed and retryable.
- Existing UI now preserves provider binding, awaits explicit switch acknowledgment,
  distinguishes Stop requested/failed/confirmed, recovers bounded results, awaits
  decision acknowledgment, displays one-operation cost and actual usage/availability.
  Start and job-copy denials stay inline and preserve input/recovery drafts.

## Recorded verification results

These are prior implementation results, not checks rerun for this documentation
edit. Runs used Node 24.22.1, migrated disposable PostgreSQL and a non-owner,
non-BYPASSRLS runtime role. Provider traffic used synthetic transports only;
no real credentials or real-CV processing.

| Check                                                                    | Recorded result                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| API workspace, including integration suites                              | 85 files / 571 tests passed                                         |
| Web workspace                                                            | 145 files / 826 tests passed                                        |
| Schema workspace                                                         | 12 files / 108 tests passed                                         |
| DB workspace checkpoint                                                  | 6 files / 22 tests passed                                           |
| Additional existing-role migration test                                  | 1 file / 1 test passed                                              |
| MCP workspace                                                            | 5 files / 20 tests passed                                           |
| Server scheduler and shutdown                                            | 2 files / 4 tests passed                                            |
| Restricted runtime-role tooling                                          | 1 file / 4 tests passed                                             |
| Static: format, tokens, lint, all 22 typechecks, Knip, boundaries        | Passed                                                              |
| Copy bindings                                                            | 0 diagnostics across 10 scoped surfaces                             |
| Roadmap validator checkpoint                                             | 0 errors                                                            |
| Production build and scoped browser checkpoint                           | Build passed; 8 browser tests passed                                |
| Connected synthetic browser journey and independent fresh-database rerun | 1/1 continuous test passed in each run                              |
| Rebuilt production bundle and affected default browser cases             | Build passed; 4 tests passed                                        |
| Provider-switch acknowledgment, after full web run                       | 2/2 tests passed                                                    |
| Changed decision/reconnect/copy components, after full web run           | 8/8 tests passed                                                    |
| Focused consent-revocation regression                                    | 2 files / 20 tests passed                                           |
| Focused review regressions                                               | 3 files / 20 tests passed                                           |
| Focused visual rerun                                                     | 4 tests passed; 20 captures inspected                               |
| Native retained package                                                  | 9 passed, 1 failed: missing iOS Pods Hermes compiler (`ENOENT`)     |
| Full browser suite and document qualification                            | Not run locally; run in CI on the PR per AGENTS.md validation tiers |

Focused counts overlap workspace coverage and must not be added as unique totals.
Skipped DB tests and the discarded deadline test that hit an immutable-binding
guard are not qualification evidence.

The API run includes five delivered tasks with 15 recorded internal calls,
blocked sixth, nonrenewal, reservation races, recovery windows, cancellation with
late expense, unknown-cost retention, revocation, stale source/configuration,
foreign-owner denial, atomic copy-save rollback and two global reservations
across separate policy rows. Contact redaction, terminal-attempt recovery,
replay normalization, remaining request cost, post-preparation deadline and
consent-revocation regressions were reproduced failing and then passed after
fixes; the final API run includes the deadline and revocation regressions.

The separate test-only composition (`tests/e2e/t005-runtime-server.ts`,
`tests/e2e/t005-runtime.config.ts`,
`tests/e2e/t005-runtime/t005-runtime-real.spec.ts`) uses authenticated browser
HTTP, the scheduler, worker and restricted PostgreSQL, replacing external
provider transport with synthetic responses. It covers missing/revoked consent,
running cancellation, terminal release, failed input preparation followed by
successful work, five delivered tasks with ten provider attempts, duplicate
submission, reload persistence, foreign-owner 404, sixth-task denial, exhaustion
copy, manual editing and actual PDF download. Administration provisions the
synthetic budget and reads revisions/attempts; it does not seed successful
operations. Default-production browser cases separately use historical-settlement
fixtures and verify the compiled production bundle's default denial.

## Independent review fixes

All fixes were reproduced with failing regression tests before implementation.
No real provider traffic or processing approval was enabled.

- **1 — Account deletion / stale global slots:** a `BEFORE DELETE` owner trigger
  reconciles admitted budgets before cascading erasure; unknown expense is booked
  conservatively. Global and route concurrency count live operations in the
  current UTC budget window. Test: two admitted owners deleted → third admitted;
  historical/orphaned counters no longer deny current admission.
- **2 — Runtime accounting tampering:** the database guard protects accounting
  fields on insert/update and operation identity; only the owning definer boundary
  changes budget bindings/reservations/settlement. Reconciliation derives actual
  expense from finished attempts. Test: restricted-role rewrites rejected,
  foreign-owner accounting untouched, measured attempt cost overrides supplied cost.
  The privileged deletion trigger also rejects runtime attachment to forged tables;
  its PUBLIC execution grant is revoked (additional failing → passing regression).
- **3 — Contact redaction:** remove Unicode format characters before matching;
  handle Unicode emails/domains, bare URLs, handles and slash/spaced international
  or local phones, preserving dates/year ranges and ordinary numeric facts.
  Test: parameterized payload regressions reproduce contact leaks and date loss,
  then pass with redaction enabled.
- **4 — Provider rejection / ambiguous expense:** definitive HTTP 4xx/5xx rejects
  settle at zero, releasing reservations after bounded retries. Interrupted/lost
  successful responses remain unknown. OpenRouter's [zero-completion billing
  policy](https://openrouter.ai/docs/guides/features/zero-completion-insurance)
  and [error contract](https://openrouter.ai/docs/api_reference/errors-and-debugging)
  were verified; both links are cited in the adapter. No auxiliary tools run.
  Unknown reservations remain conservative until five minutes after the execution
  deadline, then the bounded owner worker books the full liability as spend and
  clears the reservation. Late finished-attempt evidence corrects that booking
  once; it never assumes an ambiguous call was free. Tests: HTTP rejection table,
  partial-response disconnect, real worker release/re-admission, aged unknown
  reconciliation and idempotent late correction.
- **5 — Queue deadline:** first claim starts the frozen execution allowance;
  later lease recovery cannot restart it. Test: a queued operation older than
  its original deadline executes and delivers after claim.
- **6 — Copies after promotion:** shared creation admission denies both new
  language/job copies while retained bases exceed the plan limit. Test: promoted
  inventory remains editable while both copy kinds are rejected.
- **8 — Preflight contention:** apply the existing AI request limiter before
  admission takes its global lock. Test: production-mode repeated preflight calls
  with changing request keys receive `TOO_MANY_REQUESTS`.

Review-fix validation: `pnpm validate:static` passed (22 typecheck tasks);
`python3 Planning/roadmap/check.py` reported 0 errors. The requested AI usage and
CV persistence browser specs passed 3 tests; the synthetic worker journey passed
1 test. Storage had 2.2 GB available before the build/browser checks.

`pnpm test:ci` failed; running the remaining workspaces produced a combined
3,520 passed, 5 failed and 32 skipped reviewed report-only document regressions. No DB tests
remain skipped: Turbo initially filtered the auth DB URL, so auth was rerun
directly with the test environment loaded (41 passed, 0 skipped, including all
7 DB cases). API passed 618 tests and DB passed 23, both with 0 skipped.
Initial outstanding failures: PDF ideographic-space width,
two PDF font-loading cases, an unclassified assistant loading label, and the
missing OpenAPI input schema on `ai.processing.notices`.

Owner-authorized follow-up: the OpenAPI contract regression reproduced the
missing input schema; all three new input-free GET routes now use the existing
optional empty-object schema pattern (8 server contract tests pass). The loading
classification regression and a new component regression failed before the fix:
the writing panel now uses the shared query skeleton with a hidden status label
(2 classification and 2 component tests pass). Its existing copy-deck/Lingui
binding is retained, with the exact source path and explicit pending-A13
accessibility classification; copy binding checks report 0 diagnostics.

PDF investigation: no PDF/font source or lockfile differs from main
`ad943613c7a2d225abac8637c5636540ec62b75e`. Two isolated runs of the affected
files passed all 16 tests unchanged (39.89s and 37.78s). The corresponding
[main unit job](https://github.com/0-sayed/master-cv/actions/runs/43086851421/job/130753366200)
passed those same 2 Unicode-space and 14 export-text tests, and all 684 PDF tests.
The original font-load errors and intermittent width result did not reproduce
in either isolated run; evidence supports local font-fetch instability rather
than a T005 rendering regression. No PDF assertion or timeout was changed.
Rerunning only the three failed PDF cases also passed all 3 (11.24s; 13 unrelated
cases excluded by the name filter).
Auth's Turbo test environment now explicitly includes its DB URL, following
the existing API/DB workspace pattern, to prevent the seven initial DB skips.

Final owner-requested validation: `pnpm validate:static` passed (22 typecheck
tasks); the single final `pnpm test:ci` run passed all 20 tasks in 5m53s.
Combined reports contain **3,526 passed, 0 failed, 32 skipped**; every skip is an
existing reviewed report-only document regression, with **0 DB tests skipped**.
PDF passed 684, API 618, auth 41, DB 23, web 828 and server 167 tests.
Roadmap validation reports 0 errors. All five initial failures are green;
no assertions were weakened, no timeouts increased, and no commit was made.

## Design and visual evidence

Inventory: Figma file [Master CV: Design (v1)](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni).

| Surface                                          | Desktop                                                                                                                                                          | Mobile                                                                                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S05 start / base limit                           | [28:769](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=28-769), [80:30155](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-30155)   | [43:668](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=43-668), [80:30478](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-30478)     |
| S11 shell / not enabled                          | [30:1445](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=30-1445), [80:31018](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-31018) | [44:1084](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=44-1084), [120:10839](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=120-10839) |
| S11 unavailable                                  | [52:1255](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=52-1255)                                                                                   | [120:10735](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=120-10735)                                                                                 |
| S11 Start exhausted                              | [52:1391](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=52-1391)                                                                                   | [120:10787](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=120-10787)                                                                                 |
| S11 adjacent review inventory                    | editing `51:155`, accepted `51:459`, stale `51:601`, own wording `258:30445`                                                                                     | `120:10393`, `52:7892`, `120:10498`, `259:14793`                                                                                                                   |
| S04 / S19 / S29 notices, consumer contracts only | `25:845` / `33:1857` / `37:3088`                                                                                                                                 | `43:607` / `47:1365` / `49:1825`                                                                                                                                   |

Authorized live Figma planning inspection confirmed the desktop unavailable/limit
metadata and inspected desktop not-enabled/mobile exhausted renders. Remaining
IDs are mapped references, not claimed as newly inspected live renders. No Figma
write occurred. Saved CV language remains independent of interface locale.

The scoped visual spec covers AR/EN at 1440/390, Noto font availability and
computed family, direction, document overflow, keyboard focus and retained English
document-language selection after quota denial. Captures cover not-enabled,
unavailable, exhausted, start/import and base-limit states. RPC presentation
doubles do not activate server routes. All 20 final captures were inspected in
a contact sheet; Arabic mobile base-limit, English mobile exhaustion and Arabic
desktop unavailable were also inspected at full size. Notices and language
controls fit without horizontal overflow; long mobile dialogs use the existing
vertical scroll container. The spec scrolls the changed notice into view.
This is visual inspection, not Arabic PDF integrity evidence.

D35/D36 reasons, one per change:

- Use the existing Check panel instead of a separate S11 state route: preserves
  the shared editor and manual/PDF workflow.
- Reuse shared Alert/Button variants for unavailable/quota/decision recovery:
  exposes authoritative recovery without new local token/control overrides.
- Keep rejected creation in its existing dialog: retains locale, source, job and
  copy name instead of losing them on a toast-only error.
- Use polling for retained bounded conversation recovery: PostgreSQL is authority
  when Redis resumption is unsupported; no fake empty successful reply.
- Do not render a consent page without an approved route/notice: T007/T009 consume
  the persisted versioned contract; no invented legal approval or future UI.

## Open gates and limitations

- **7 — Accepted open item:** deleting an account and signing up again resets
  the once-only free AI allowance; unchanged pending the owner decision.

- Production routes and handlers remain empty and the worker unavailable. A11
  supplier/legal qualification and A13-reviewed consent remain open. The route
  register needs a named owner, date and linked evidence for exact endpoint,
  model/downstream supplier, configuration/notice/prompt/schema revisions,
  processors, locations, Saudi core/database/backups, contracts and transfer
  safeguards, minimization, retention/deletion/training/cache, quality and
  Arabic/English capability, finite limits, cost and worker topology.
- The adapter supports `https://openrouter.ai/api/v1` only. Recorded transport
  assertions cover exact binding and no fallback (`only`, `allow_fallbacks:false`,
  `require_parameters:true`, `data_collection:deny`, `zdr:true`). These controls
  and synthetic responses do not prove supplier contracts or real-data quality.
  Unknown expense retains the full reservation until bounded conservative
  reconciliation as described above; expense beyond the reviewed
  per-call bound blocks further calls/publication. Supplier-side invoice limits
  still need qualification.
- The continuous journey composes the source server and compiled web app. It
  does not qualify real suppliers, hidden assistant interaction, typed AI-copy
  saving, browser process-crash recovery, delivery-race cancellation, time
  advancement or the AR/mobile matrix.
- Stop requested/failed, saved-decision and provider-switch assistant views have
  no enabled product launcher (`assistantPlace = null`). Component/server tests
  cover behavior, but no AR/EN screenshot matrix is claimed. Copy-for-job and
  conflict recovery have component/functional coverage without a full visual
  matrix. Shell alignment/select-label fit beyond changed start controls remains
  unqualified. Native Hermes verification remains blocked as recorded above.
- New operational copy is spec-only/pending owner review; existing approved
  Start/unavailable copy is reused. No new legal/consent wording is approved.
  No paid service, deployment, merchant activation, DOCX gate, real-CV route or
  model-quality approval is enabled.

T006/T007 consume reviewed bounded handlers and the existing ledger/copy primitive.
T008 career consumers remain gated. T009 consumes owner-safe cancel/status/result
and consent revocation; data-rights retention/deletion remains separate. T010 adds
paid grants without resetting the five lifetime Start operations. T012 qualifies
worker topology, recovery and production controls.
