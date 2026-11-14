## Snapshot cleanup — 2026-11-14

Historical seal and receipt metadata lives in [freeze-history.json](freeze-history.json), one row per seal.
`sha256` binds the original file bytes; `studyHash` binds its parsed JSON serialized compactly,
as used by the harness. Dates and reasons are copied from source fields; null means not recorded.
Archived bytes were moved unchanged to `/mnt/storage/master-cv-design-archive/ui-audit/t006-grid/freeze-snapshots/`.
Historical seal-preservation tests use the compact receipt chain; numerical forecast regression still
reads `forecast-historical-effort-grid.json`. Current core identity and receipts remain historical and stale;
cleanup does not qualify them. Current tasks bytes are resealed only where this cleanup changes them,
with reason `snapshot cleanup`; no inference, environment reads, staging, commits or approval.

## Slim tasks decision lane — owner decision 2026-11-14

This is a rough decision with a smaller budget; a larger, properly funded benchmark follows later.
Tasks-v1 defaults to **two full-stage repetitions**; explicit `--runs` overrides remain supported.
Core retains three repetitions. Smoke stays one AR, one EN and one mixed case per category and
variant (18 sessions per variant; 126 for seven, 72 for four).

Canary calibration runs **72 initial verifier calls**: every category × language cell has its
honest gold, invented metric, dropped negation and one priority defect: summary invented skill
(the existing job-only SAP mutant), job-evidence unsupported `supported` verdict,
tailoring/cover-letter job-only keyword, translation wrong Hijri year, interview escalation.
Summary omission stays advisory required-key-fact coverage; LOST_FACT remains off for summary.
The production safety pipeline combines the deterministic contract/hard-fact guard and tasks
verifier. Full requires **100% pipeline planted-defect recall and zero pipeline honest false
rejects**. Verifier-alone recall and false rejects are advisory, with no threshold. Protocol
faults cannot establish a semantic catch or false reject. A faulty attributable verdict gets
**one identical pinned retry**, without a writer call; both verdicts and charges are retained.
The final protocol-fault gate is **at most 10%**. Unavailable/unattributable probes still block.
Ceilings include both verifier attempts, each with up to five transport attempts. Luna judging
quality remains unmeasured; DeepSeek low/Together is the sole calibrated judge; no pins changed.

The v2 tasks verifier prompt clarifies verbatim full claim/premise/segment IDs, closed inventories,
every full question, unsafe-response coverage and compact reasons, with a strict JSON example.
The strict wire schema and audit checks are unchanged. Replaying the 72 saved verdicts still
flags all 44 protocol faults; improved live behavior is unmeasured. The two training-receipt
golds (`judge-canary-translation-ar`, `judge-canary-translation-mixed`) omitted receipt of training;
their English targets and mutant baselines now preserve it. These two fixture hashes require
lead re-approval; generated templates remain UNAPPROVED.

Historical diagnostics exclude three summary omissions from safety and two unfaithful golds
from honest denominators: pipeline 49/51, verifier 48/51, both 0/16 false rejects. Original labels
remain reported (pipeline 49/54, verifier 48/54, both 2/18 false rejects). They cannot qualify the
repaired study: eleven probe outputs changed, the prompt changed, and post-retry fault rates are
unmeasured. The two remaining misses concern interview question premises.

`node --import tsx evaluations/review/safety-replay-cli.ts` (from tooling) requires `--source`,
`--historical-fixtures`, `--diagnosis` and explicit `-o`, all under `/tmp`. It re-scores immutable
saved canaries and latest smoke sessions, writing per-variant/category acceptance, faults and
independent guard rejects. No inference or environment-file reads; historical artifacts cannot
qualify a new study. Fake results are scripted controls.

After tuning, use `--study tasks-v1 --variants <model@effort,...>` to remove finalists.
With this flag, only the seven existing model/provider/effort/scope tuples are allowed; unknown, duplicate,
empty or expanded selections fail. Canonical ordering is retained. Manifest `variants` records
actual membership, and the study hash binds the selected models, repetitions and freeze.
A subset requires **fresh smoke with that same subset and repetition setting**; a seven-variant
smoke cannot qualify a four-variant full run. Keep all categories, partitions and languages.
Existing custom tuning-only configs remain usable without this flag; full still requires
the existing Terra reference. No pruning winners are selected here; the four-variant forecast is an illustrative subset,
not an evidence-backed recommendation.

Forecasts remain offline estimates, separated by OpenRouter (5.5% fee once) and OpenAI
(no credit fee). Gold-token/core-judge proxies are not measured tasks usage. Report cap-based
conservative totals separately, including five-attempt exposure. Smoke includes canaries;
tuning and full are standalone costs, not cumulative or pooled quality evidence. No inference,
key-file reads, staging, commits or approval are authorized. Only unchanged fixture envelopes retain
prior review; the two corrected canaries require re-approval. Templates stay UNAPPROVED for lead re-stamp.
Historical core freeze and receipts stay unchanged; shared byte drift is disclosed without
claiming current core freeze qualification.

# Lane 22: safety and advisory quality

Current freeze: `t006-review-fairness-v9-lane22`. Owner-directed repair after inspecting the completed v8 smoke journal (132 latest sessions, 145 scored events). This is previously inspected evidence, not unseen validation. Prior freeze and control receipt: [`fairness-study-before-lane22.json` (archived)](freeze-history.json), [`guard-controls-before-lane22.json` (archived)](freeze-history.json). No fixture, gold, model grid or verifier-pin change; fixture-bound owner Arabic approval is checked offline, never inferred.

Production display requires supported complete cited claims, retained/not-applicable retention and the existing hard-fact guard. Lost/unclear retention or unavailable/invalid verification withholds. Each question has a separate `question:<id>` safety verdict for its factual premises; redundant questions remain advisory. Saved question responses without these verdicts require re-verification. Response appropriateness, usefulness and requested scope are advisory quality. Benchmark safety eligibility no longer uses question correctness, empty-answer quality or the 0.3 human-quality gap. Human review and factual/fabrication gates remain; quality and usefulness are separately reported for ranking.

The verifier now receives full minimized proposals and every candidate, including nulls, in non-evidence response metadata. Previously claims were supplied but the response contained only questions/notes. The 11 wording and 8 injection appropriate/N/A rejected sessions actually contained proposals; the edit-retention check caused rejection. Offline re-score explicitly flags incomplete-response judgments, including all extraction and proposed edits, rather than treating absent response judgments as qualification. The extraction writer also receives the existing authored intent, formerly omitted. This changes request identity without changing fixtures.

Extraction benchmark verifiers receive 12,288 total completion tokens; other categories retain 5,120 and writer caps are unchanged. Reasons are prompted to be compact, without dropping claims. Reservations use the scaled cap. Saved-input and conditional compact-output capacity checks are offline diagnostics, not proof of live non-truncation. Two genuine writer failures have no valid verifier input. A fresh 132-session owner-run smoke is required; v8 cannot qualify or resume into v9.

Smoke checks infrastructure, accounting, provider identity, coverage and systemic verifier health. Writer schema/truncation/refusal/provenance failures remain data with per-variant counts; unknown writer sources are rejected before judge dispatch. Isolated verifier faults are health exclusions, not writer errors. A variant without a complete attributable pair has no measured calibration and retains catalog reservation bounds; this alone does not block smoke. Existing systemic health thresholds and billing/coverage gates remain.

Offline report (must supply `-o`; no network or environment-file reads): `pnpm --filter @reactive-resume/tooling eval:review:rescore --source evaluations/results/2026-11-13T13-29-43.354Z-27e0cb13 --approval-file <owner-approval.json> -o /tmp/t006-offline-rescore`. The 44 variant/category rows contain historical joint proxies, provisional saved-verdict re-scores, trusted rates and re-verification counts. Historical journal/results stay immutable. Cost is a token-price proxy, not new calibration. No inference, release approval or real-CV processing authorized.

The following sections describe historical studies; lane 22 supersedes conflicting acceptance and smoke-gate descriptions.

# Lane 21: current study grid

Current freeze: `t006-review-fairness-v8-lane21`. Eleven variants: Luna none/low/medium/high/xhigh and Terra none/low/medium/high (OpenAI BYOK), DeepSeek V4.1 Flash none/low (Together). Hydrogen/Vertex excluded by owner decision 2026-11-13 on cost/latency/legal grounds; JSON object adapter and Vertex fault/journal unit tests retained using an explicit fixture outside the active grid. Verifier pins unchanged. Default smoke: 132 sessions; full: 2,772. Prior studies cannot qualify or resume this freeze; fixture-bound Arabic approval remains valid after offline checking. Current payer forecasts and the 168–239-minute offline duration projection are in [the evaluation guide](../README.md) and `forecast.json`. The sections below retain historical study context.

# Verifier fault recovery

## Lane 18: new study freeze

`fairness-study.json` now identifies `t006-review-fairness-v6-lane18`. This is a new
study, not an amendment. The 2026-11-13T12-06-45.140Z-72dba5bf smoke (28 scored
sessions, approximately $0.08) is abandoned and cannot qualify or be resumed into
this study. Its raw outputs, charges and journal remain unchanged. The preceding
freeze and control receipt are preserved in [`fairness-study-before-lane18.json` (archived)](freeze-history.json)
and [`guard-controls-before-lane18.json` (archived)](freeze-history.json). The active control receipt is now `guard-controls-core.json`; original receipt names and hashes remain in history.
Prompts, output schemas, fixtures, scoring and `models.json` are unchanged; Arabic
approval still binds the same fixture hashes. A fresh owner-run paid smoke is required.

Every non-valid adapter attempt is durably journalled as `attempt`, before retry,
with error class, HTTP status (or null), sanitized message and nested causes, response-byte flag and
generation ID (or null). Exceptions before any response are transient and release
both payer reservations when no other attempt was billed. Writer and verifier use
the same bounded pinned retry policy. Failed 2xx body reads remain ambiguous even
with zero bytes; stream cleanup cannot replace the original exception. A returned
generation ID with missing/error billing triggers a bounded GET to `/generation`;
failed or incomplete lookup retains each unknown payer's reservation independently.
Only more than three unknown sessions or more than $0.05 of unknown payer holds
stops new dispatch with `BILLING_UNKNOWN`. Known payer charges do not count toward
the hold amount. Ambiguous generations are not repurchased on restart; connection
transients are retryable. In-flight work is drained when a stop is reached.

The abandoned smoke's Luna medium/high r2-t11-wording verifier errors cannot be
reconstructed: neither has a verifier raw record or exception record. Both were
classified transient; synthetic transport regressions verify their recovery path.
No claim about their original exception type is possible.

The automatic live-start preflight still serializes writer and verifier requests
through an injected offline transport before credentials or paid dispatch. It
sends no network requests and writes `preflight.json` under the explicit `-o` path.
It checks request readiness, not live provider availability or permission to spend.

The runner retries an attributable verifier fault once with the identical pinned
request and the cached writer output. This covers truncation, invalid schema,
unknown source/claim/evidence IDs and unsupplied quotations. It never regenerates
the writer. An attributable supported/unsupported judgment is final and is never
retried for quality. Provider unavailability keeps its existing transient recovery
and cooldown behavior.

`MAX_VERIFIER_FAULT_RETRIES = 1` is persisted as `verifierFaultRetries` on each
scored session. The first faulty judgment is journalled before retry dispatch;
a second fault is final `verifier-fault`, excluded from writer metrics and listed
for human adjudication after reveal. A finalized faulty session counts as completed
coverage. Smoke validation still rejects verifier faults. Prompts, models, token caps,
schemas, fixtures and scoring are unchanged; lane18 uses the new identity above.

## Systemic stop thresholds

`verifier-health.ts` defines independent stop conditions:

- `MIN_OVERALL_VERIFICATIONS = 50` and `MAX_OVERALL_VERIFIER_FAULT_RATE = 0.10`:
  stop when more than 10% of completed verifications are faulty after retry.
- `MIN_VARIANT_VERIFICATIONS = 10` and `MAX_VARIANT_VERIFIER_FAULT_RATE = 0.25`:
  stop when more than 25% for any writer model/provider/reasoning variant are
  faulty after retry, independently of the overall 50-verification floor.

Exactly 10% overall or 25% for a variant does not stop. Each final session counts
once in these denominators, including verifier rejections; intermediate faults,
retry attempts, unavailable providers and unverified writer failures do not count.
The checks run after scoring and before dispatch on resume. `VERIFIER_FAULT` stops
new dispatch, drains active work and preserves incomplete sessions and reservations;
resuming unchanged systemic evidence stops again without spending.

## Resume and accounting

Legacy faults with no retry count receive one fresh verification on resume,
including `INVALID_VERIFIER_OUTPUT` with an unknown provider. Raw writer output
must exist; otherwise `CACHED_WRITER_REQUIRED` stops before buying a new writer.
Latest scored records win: a legacy fault already superseded by a successful
verification is reused, never bought again. For the November 13 incident, Luna
high's earlier unknown-provider fault was already superseded successfully; Terra
low's truncated verifier remains eligible for its one retry. The source journal
is read only during offline tests.

Each retry uses the existing two payer reservation checks and provider/session
concurrency pools. As with transient resume, a new pair ceiling is reserved
conservatively even though the writer is cached; settlement charges only new work.
Prior verifier charges remain in `priorAttemptOpenRouterMicros` and
`priorAttemptOpenaiMicros`, with the cached writer subtracted exactly once.
Interrupted retries retain their unsettled reservation and stop `PENDING_BILLING`
until reconciliation, rather than risking duplicate payment. A verifier cooldown
blocks retry dispatch just as it blocks initial verification. No budget, token cap,
provider pin or quality threshold is raised.

## Coverage and recommendation

The existing report gate requires 100% of planned session records and no stop
reason. For the accepted November 12 smoke's full plan this is **252 records per
variant** (84 cases × 3 repetitions; 144 holdout and 108 tuning), across 11 variants
and 2,772 sessions. A few finalized verifier-fault exclusions do not reduce recorded
coverage and do not block recommendation eligibility. Writer metrics use only
judged sessions; they still require positive writer samples and retained-fact
coverage. Human ratings, fabrication/fidelity thresholds, live mode and control
requirements remain in force; complete coverage alone is not a recommendation.
No scorer or recommendation rule changes are needed.

The existing human coverage gate still requires two independent reviewers for
every holdout output, including outputs with verifier faults: 144 holdout entries
per variant, of which 96 Arabic/mixed entries also require Arabic quality ratings.
Identical outputs merged across variants share their ratings. Leaving faulty
outputs unrated therefore still blocks the human gate; their ratings do not enter
writer fidelity or false-rejection metrics. These are the existing
`report-client.ts` fidelity coverage and `blind.ts` Arabic coverage rules.

Offline CLI artifacts must use explicit `-o /tmp/...`; fake transport tests and
smoke acceptance never authorize or perform inference.

## Purpose-based naming cleanup (2026-11-14)

Active regression files now describe language safety, billing/transport recovery, verifier gating, guard false positives, calibration controls, paraphrase usefulness and recorded-smoke adjudication. Fixtures are `guard-false-positive-regressions.json` and `lexical-lost-fact-regressions.json`; the core receipt is `guard-controls-core.json`. Offline lexical replay uses `eval:review:lexical-lost-fact-replay` and requires `-o`. The literal-evidence guard version label replaces its session suffix.

Historical study IDs, receipt hashes, history lookup names and saved result paths retain their original values; these identify immutable evidence, not active file names. `freeze-preholdout.json`, `holdout-authorship.json` and `forecast-historical-effort-grid.json` have purpose-based paths. Original seals and receipts are retained outside the checkout with their original hashes in `freeze-history.json`. The tasks freeze is resealed with reason **naming cleanup**; the historical core remains stale and cannot qualify current runtime. No inference, environment-file reads, staging or commits.

Obsolete `browser-qa.mjs`, its eight-variant `smoke-qa.mjs` wrapper, and the schema-v2 `final-probes.ts`/`PROBE.json` pair were moved unchanged to `/mnt/storage/master-cv-design-archive/ui-audit/t006-grid/retired-scripts/`. The obsolete probe command was removed. Current browser specs, controls and canary tests remain active. No debug statements, commented implementation blocks or unowned TODOs were found in review source; CLI output and subprocess-output fixtures are intentional.
