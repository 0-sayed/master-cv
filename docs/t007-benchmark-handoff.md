# Job evidence, tailoring, translation and summary benchmark handoff

Status: **UNAPPROVED; offline package only. Paid run deferred to the combined T008 benchmark (owner decision 2026-11-14).** No model winner, semantic qualification,
paid run, live canary or catalog refresh was performed. Production routes stay closed
and runtime defaults stay Luna low. A03 remains open. Cover-letter and interview
qualification belong to T008 and are excluded from this scope.

## Final identity and reproducible inputs

- Study: `tasks-v1-job-language-v29`, metadata version 28, dated 2026-11-14.
- Parsed freeze hash: `f09a6017b1e859897825864422526222f365ece9097b15966aef9f30d13c2271`.
- Previous parsed study hash: `a87539f48d077499af4d768824fc5550a0e84f67343a12e8174190492ba2fa8f`.
- Exact dependency byte hashes, prior identities and reasons are in
  `tooling/evaluations/review/freeze-history.json`. The latest row has reason
  `Arabic fixture review corrections` and records four changed source fixture files.
  The full dependency map is `tasks-study.json`; prompts, schemas, runtime source
  preparation and complete verifier contracts are sealed there. Historical core
  seals remain historical/stale. Original bytes are outside this repository at
  `/tmp/job-language-original-seal/`.
- Scope is canonical `summary,job-evidence,tailoring,translation`. The CLI accepts
  `--categories job-evidence,tailoring,translation,summary` and rejects duplicate,
  empty, unknown or incompatible scopes. Omitting it preserves the six-category study.
- Independent Arabic review findings 1–7 were verified against the actual sources,
  production v2 prompts and benchmark adapter; all were valid. Corrected the English-source
  canary's impersonal training wording throughout its gold/controls; replaced negated
  sentences and matching claims in all three translation canaries. The Arabic/mixed
  canary golds retain their approved wording. The other 15 dropped-negation canaries
  and four summary negation-flip controls do not retain the negative sentence; no shared
  fixture mutant generator exists in the active tooling.
- Added explicit per-fixture employer aliases to AR/EN translation holdouts 04 and 10;
  the adapter passes them to the production snapshot. Historical glossary entries alone
  do not authorize employer translation. Added SAP as a preferred job-only requirement
  to the nine reported job-evidence cases, including honest no-evidence requirements in
  their golds and derived controls; the CV pool stays unchanged. Corrected the mixed h1
  second explanation and every derived baseline to Arabic with ASP.NET retained.
- Current owner materials: `/mnt/storage/master-cv-design-archive/ui-audit/t007-bench/owner-review-v29/`.
  Of 120 exported items, 16 hashes changed versus v28; 111 items remain script-gated.
  Every review flag is false; reviewer/time are empty. Prior exports and approvals cannot
  authorize changed hashes. Holdout fixtures have prior exposure; no unseen holdout claim.

## Observed offline checks

Regression checks reproduce the reported defects before correction and pass afterward
(5 tests). The review suite passed 2,356 tests across 80 files
(`/tmp/arabic-fixture-review-tests.log`); three startup tests are excluded because
they invoke the forbidden environment-file option. Production-versus-benchmark parity,
scope/freeze and key-file checks passed in that suite and in separate focused runs
(8 tests; `/tmp/arabic-fixture-{gate,parity}-tests.log`). Changed-file lint and format
checks passed. Exact new SHA-256 file:line candidates for lead review are recorded
in `/mnt/storage/master-cv-design-archive/ui-audit/t007-bench/gitleaks-sha256-locations-v29.txt`;
`.gitleaksignore` is unchanged.
Fresh deterministic/scripted scans checked 1,056 all-category controls, 699 scoped controls
and 72 scoped canary controls: all passed with zero failures. Their scan time and current
parsed freeze binding are in `guard-controls-tasks-v1.json`. Scripted controls do not
qualify semantic quality.

Current v29 isolated outputs: `/tmp/arabic-fixture-v29/{fake-smoke,preflight,smoke-forecast,full-forecast}/`.
Fake smoke completed 36 writer sessions and 48 verifier-only probes using scripted
transports, with empty approval provenance and dirty-source provenance. Preflight passed
with zero network requests. Both forecasts completed without inference. Direct Node + tsx
imports avoid the sandbox's forbidden tsx CLI IPC socket. Historical v27/v28 artifacts
are superseded and cannot authorize this study or supply a qualifying live smoke receipt.

## Counts and dated cost estimates

The exact finalists are Luna none, Luna low and Terra medium, retaining existing
benchmark provider tuples. Both recommended commands explicitly use three runs;
global task defaults remain two and core defaults remain three.

| Stage | Writer sessions | Nominal writer + verifier calls | Estimated OpenRouter | Estimated OpenAI | OpenRouter ceiling | OpenAI ceiling |
| ----- | --------------: | ------------------------------: | -------------------: | ---------------: | -----------------: | -------------: |
| Smoke |              36 |                              72 |         $0.049915215 |        $0.229089 |           $2.10564 |      $2.271114 |
| Full  |             972 |                           1,944 |         $1.366294419 |       $6.6536415 |          $56.85228 |     $61.688427 |

Catalog snapshot: 2026-11-12. OpenRouter's 5.5% fee is included once. These are dated
offline estimates, not approved budgets or quotes. Smoke additionally plans 48
initial verifier-only probes and a $28.074816 OpenRouter retry ceiling; conservative
smoke payer minima are $30.180456 OpenRouter and $2.271114 OpenAI. Full minima above
assume a matching paid smoke has already passed. Do not add smoke canaries twice.
Each logical probe allows one identical pinned protocol retry without writer
regeneration; at most five transport attempts per verifier attempt, ten per probe.
Pipeline defect recall must be 100%, honest false rejects zero and final protocol
faults at most 10%; unavailable or unattributable probes block. Verifier-only recall
is advisory. The 72 offline controls and 48 planned live probes are different counts.

## Owner-only commands (not executed)

The following recipes require explicit owner authorization for each paid stage,
fresh hash-bound Arabic source/gold approvals, approved separate payer budgets and
an actual token file containing only a token. No environment file is required.
`--key-file` is mutually exclusive with the legacy environment-file option; key
loading happens only in the live branch. The implementation used only a synthetic
key-file fixture. Keep all shell variables below required, rather than substituting
unsigned templates or the fake receipt. Use Node 24 and run from the repository root.

```sh
pnpm --filter @reactive-resume/tooling eval:review \
  --study tasks-v1 --categories job-evidence,tailoring,translation,summary \
  --variants openai/gpt-6-luna@none,openai/gpt-6-luna@low,openai/gpt-6.1-terra@medium \
  --runs 3 --stage smoke --key-file "${OWNER_BENCHMARK_TOKEN_FILE:?required}" \
  --approval-file "${OWNER_ARABIC_APPROVAL_FILE:?required}" \
  --budget-usd "${OWNER_SMOKE_OPENROUTER_BUDGET_USD:?required}" \
  --openai-budget-usd "${OWNER_SMOKE_OPENAI_BUDGET_USD:?required}" \
  -o "${OWNER_NEW_SMOKE_OUTPUT_DIRECTORY:?required}"

pnpm --filter @reactive-resume/tooling eval:review \
  --study tasks-v1 --categories job-evidence,tailoring,translation,summary \
  --variants openai/gpt-6-luna@none,openai/gpt-6-luna@low,openai/gpt-6.1-terra@medium \
  --runs 3 --stage full --key-file "${OWNER_BENCHMARK_TOKEN_FILE:?required}" \
  --approval-file "${OWNER_ARABIC_APPROVAL_FILE:?required}" \
  --smoke-file "${OWNER_MATCHING_PAID_SMOKE_RESULTS_JSON:?required}" \
  --budget-usd "${OWNER_FULL_OPENROUTER_BUDGET_USD:?required}" \
  --openai-budget-usd "${OWNER_FULL_OPENAI_BUDGET_USD:?required}" \
  -o "${OWNER_DISTINCT_FULL_OUTPUT_DIRECTORY:?required}"
```

Use repeated `--approval-file` arguments if approvals are split across files.
Live outputs must follow the existing evaluation-results policy. Never run these
with the synthetic test preload: it deliberately rejects inference credentials
and inference egress. Inspect repeated-identical-input disagreement, unsupported
claims, Arabic terminology/meaning retention, quality, latency and separate payer
costs; report these independently. No ATS count or benchmark metric predicts hiring
success. Owner selection, Arabic source/gold review, provider/ZDR and release
approvals remain outstanding.

## Final artifact fingerprints

| Artifact                               | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| Exact tasks-study JSON bytes           | `d88b0eb8973c35fcb2074ffe74f56059c4b7227236435a0910be739e77a9a4de` |
| CLI config source                      | `029ed2c8fdff3de357a8f8cd7e5943e4472ea1cf2d2b86f24c03cd3e6280fbb3` |
| Complete owner-review items            | `7ccf1e7821bfe22c7f8146604d231c0519a7d378ad64e4200b25cb913823bc46` |
| Unsigned approval template (111 items) | `3e612c476890dba9de9d084ed84b96e95528f22c191d424cea8d3df3c8f079b7` |

Final fake manifest experiment hash:
`7f7733d0286c2fe79a45744769b2ffd0837bff9ee273ddc87a3b931b14a1554d`.
The CLI's experiment identity binds requested three repetitions; smoke still
executes one sentinel per language/category/variant (36 sessions, manifest runs=1).
Only full executes the three identical-input repetitions. Fake approval provenance
is empty; accepted synthetic variant statuses are not owner approval or quality.
