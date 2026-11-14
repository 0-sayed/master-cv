# T006 Model Benchmark — History, Costs and Lessons

Durable record of the paid model benchmark run for T006 (reviewable AI) on 2026-11-12/13. It answers: what was run, what it cost, what broke and why, what was decided, and how to re-run. Raw journals stay out of git (`tooling/evaluations/results/` is ignored); the compressed archive is `/mnt/storage/master-cv-design-archive/benchmark-results/` with an off-machine copy kept by the owner. Harness code: `tooling/evaluations/review` (see its README). Detailed evidence: [t006-evidence.md](t006-evidence.md).

## Purpose

Pick, per AI task, the cheapest model + reasoning effort that passes every safety gate and is within noise of the best quality, on Saudi Arabic/English/mixed CV fixtures, with a cross-family verifier. Synthetic data only; Luna/Terra were measured through the owner's OpenAI key via OpenRouter BYOK (non-ZDR, benchmark only); production routes use Azure ZDR.

## Pipeline under test

1. Writer model proposes changes (claims cite CV evidence IDs).
2. Deterministic hard-fact guard (names, employers, dates, numbers, negation, responsibility level).
3. Cross-family verifier: DeepSeek V4.1 Flash (low, Together) checks OpenAI writers; Luna (low) checks DeepSeek writers.
4. User approval in the product. Only SAFETY (supported claims, no lost/flipped facts, guard pass) withholds a proposal; QUALITY is advisory.

## Grid

Core study: Luna none/low/medium/high/xhigh, Terra none/low/medium/high (OpenAI BYOK), DeepSeek V4.1 Flash none/low (Together). Gemini 4 Hydrogen was tested on 2026-11-13 and dropped by owner decision (≈20× DeepSeek cost, Vertex concurrency 1, 3 injection failures, 90-day safety retention needing legal sign-off). Earlier candidates dropped before paid runs: Gemini 3.5 Flash Lite, Gemini 4 Carbon, Gemini 3.8 Flash.

## Run log

| Run folder (`tooling/evaluations/results/`) | Type                            | Spend (OpenRouter / OpenAI) | Outcome                                                                                 | Bug found → fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-12T17-23-39                         | smoke 1                         | ~$0.04 / –                  | failed                                                                                  | Gemini 400 INVALID_ARGUMENT → json_object path; 7 honest edits falsely rejected; 3 truncations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-12T17-46-52                         | smoke 2                         | ~$0.09 / –                  | SMOKE_FAILED                                                                            | DeepSeek low truncation; safety hole, inconsistent usefulness scorer, verifier faults charged to writer, overfit aliases (Fable + Astra review)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-12T19-13-26                         | smoke 3                         | ~$0.01 / –                  | PROVIDER_MISMATCH                                                                       | 429 inside a 200 body → pinned transient retries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-11-12T19-49-25                         | smoke 4                         | ~$0.11 / $0.04              | passed                                                                                  | BYOK verified (OpenRouter charge $0, upstream billed to OpenAI)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| —                                           | full attempt                    | $0                          | CALIBRATED_FORECAST_LIMIT                                                               | forecast $10.96 > $9 budget → owner topped up $3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-11-13T06-30-48                         | full (resumed several times)    | ~$2.62 / $0.07              | VERIFIER_PROVIDER_MISMATCH, then VERIFIER_FAULT, then OpenAI variants silently disabled | (a) Together 429/timeout mislabelled mismatch → transient + cooldown; (b) single verifier truncation stopped run → retry once, systemic-rate stop only; (c) dispatch was sequential (~20 h) → bounded parallel dispatch + atomic two-payer reservations; (d) OpenAI strict schema rejected `z.unknown()` extraction field, HTTP 400 mislabelled "unsupported" → typed schema + REQUEST_SCHEMA_ERROR; (e) prompts did not disclose validator rules → extraction 100% invalid; (f) verifier never saw questions → unfair missing-info judging; (g) scorer conflated invalid/empty/no-change |
| 2026-11-13T12-06-45                         | smoke (v6)                      | ~$0.06 / $0.02              | BILLING_UNKNOWN                                                                         | adapter swallowed a pre-response exception → journal every failure, transient retry, unknown-hold bound                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| — (offline)                                 | Fable pre-mortem + fault matrix | $0                          | 16 latent failure modes                                                                 | 492-scenario fault-injection matrix, chaos smoke, SIGINT drain/resume, account-error stops, loud smoke gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-13T13-29-43                         | smoke (v8)                      | $0.39 / $0.13               | SMOKE_VARIANT_FAILED (loud gate worked)                                                 | verifier truncation on extraction (cap 5,120 → 12,288); acceptance conflated SAFETY with appropriateness → split SAFETY/QUALITY                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-13T14-12-20                         | smoke (v9)                      | $0.18 / $0.09               | passed, 0 verifier faults                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-13T14-18-44                         | **full (v9), 2,772 sessions**   | **$3.67 / $1.48**           | **completed, stopReason null, ~2 h**                                                    | hard-fact guard false positives (212) → morphology/labels/negation-span fix (lane 23, re-scored offline, $0); lexical lost-fact scorer false positives (attached و, dates) → normalisation fix (lane 23b, $0)                                                                                                                                                                                                                                                                                                                                                                             |

Approximate total paid spend for the core study: OpenRouter ≈ $6.6 (key usage 2026-11-13 evening), OpenAI ≈ $1.8.

## Core results (holdout, after offline guard + scorer fixes)

| Task                   | Recommended                        | Holdout safety                              | Cost / 1,000 ops | p50    |
| ---------------------- | ---------------------------------- | ------------------------------------------- | ---------------- | ------ |
| Wording                | Luna low                           | 36/36                                       | $1.23            | 7.6 s  |
| Extraction             | Luna none                          | 36/36                                       | $0.78            | 6.1 s  |
| Missing-info questions | Terra medium                       | 36/36                                       | $1.53            | 7.7 s  |
| Injection resistance   | Luna low                           | 36/36                                       | $1.78            | 12.7 s |
| Verifier               | DeepSeek V4.1 Flash low (Together) | 0 invented facts accepted in 2,772 sessions | —                | —      |

Observations: DeepSeek as writer is cheapest but loses facts when rewriting and is weak at questions; higher Luna effort barely improves quality; Terra ≈ 2× Luna cost, slightly safer. These are provisional until the unified decision table (all 10 tasks, owner blind rating for ties) is produced.

## Lessons (apply to every future benchmark)

1. Test the harness against a messy fake world first (fault injection: 429s, timeouts, non-JSON bodies, missing usage/cost, refusals, SIGINT). A clean fake hides every live failure.
2. Non-systemic problems must be session-level and retryable; only systemic causes stop a paid run. The smoke gate must fail loudly, never silently drop a variant.
3. Smoke must cover every task category × variant × language; a one-category smoke hid the extraction schema bug.
4. Prompts must state every rule the validator enforces; preflight the strict schema offline for every provider.
5. Separate SAFETY (gates) from QUALITY (ranking). Lexical checks are signals, not gates, unless they handle Arabic clitics, diacritics and date forms.
6. Record every failure with its exact cause; never let an adapter swallow an exception.
7. Calibrate cost from a live smoke; real costs came in ~45% below the smoke-based forecast.
8. Shortlist models by hard requirements (Arabic, strict JSON, ZDR/no training, Saudi law, price) and public evidence before paying to test.
9. Use dated model IDs (e.g. `deepseek-v4.1-flash-1017`), never "latest".
10. Every paid run needs the owner's explicit yes; agents never start paid runs.

## Re-test rules

- Same model, lower price: no re-run; update the cost table.
- New model version: single-variant run on the tasks it could win (~$1–3, < 1 h) against the frozen fixtures.
- Prompt, schema, fixture, guard, verifier or scorer change: re-run the affected task(s) under a new study hash.

## Future tooling: migrate the plumbing to an existing eval framework

Most harness bugs were in plumbing that mature open-source eval tools already provide. Researched 2026-11-13 (owner request); not yet trialled:

| Need                     | Inspect AI (UK AISI, Python)                     | promptfoo (Node/TS, MIT, being acquired by OpenAI)                         |
| ------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Retries / backoff        | eval-set retry strategy                          | provider scheduler, backoff, configurable per provider                     |
| Concurrency              | `--adaptive-connections`                         | adaptive per provider and key                                              |
| Resume without re-paying | eval-set re-run resumes, keeps completed samples | response cache (cached calls cost 0)                                       |
| Cost                     | priced at the serving model                      | OpenRouter `usage.cost`; **wrong under BYOK** (upstream billed separately) |
| Judge                    | custom scorers                                   | `llm-rubric` and custom JS assertions                                      |

Stays custom in either tool: production hard-fact guard and cross-family verifier as scorers, Arabic fixtures and per-language gates, two-payer (OpenRouter + OpenAI BYOK) budgets, owner blind rating.

Recommendation: keep the current hardened harness for T006. For the next evaluation (model re-tests, T007/T008 tasks), pilot **promptfoo** first (same language as the app; guard/verifier plug in as custom assertions; keep our dual-payer ledger). Consider Inspect AI only if a Python-side harness is acceptable. Sources: [Inspect eval sets](https://inspect.aisi.org.uk/eval-sets.html), [Inspect concurrency](https://inspect.aisi.org.uk/models-concurrency.html), [Inspect limits](https://inspect.aisi.org.uk/setting-limits.html), [promptfoo rate limits](https://www.promptfoo.dev/docs/configuration/rate-limits/), [promptfoo OpenRouter](https://www.promptfoo.dev/docs/providers/openrouter/).

## Budget decision for the new tasks (2026-11-14)

Owner decision: the tasks-v1 study (summary, job-evidence, tailoring, translation, cover-letter, interview-prep) runs **slimmed** for a rough, provisional decision: 72 verifier canaries instead of 216, 2 repetitions instead of 3, and the full run limited to the best 3–4 variants after the tuning pass. Inputs are ~10× larger than core (CV + job ad), so the unslimmed full run was estimated at ~$20–25 OpenRouter + ~$15–20 OpenAI. A larger, properly funded benchmark (more cases per language for CI-qualified winners, all variants, 3 repetitions) is planned before the paid launch (T015). First tasks-v1 smoke attempt (2026-11-13 23:42, folder `2026-11-13T21-42-41.005Z-5803bc77`) was stopped by the owner after 56 canaries (~$0.3–0.5): DeepSeek verifier truncated at the 4,096-token cap on job-evidence and tailoring → cap raised to 12,288. Earlier that night a live start failed with Node `fetch failed` (ETIMEDOUT): Node's 250 ms happy-eyeballs attempt timeout on a slow connection; fixed by a router restart and `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`.

## tasks-v1 status at pause (2026-11-14, ~01:30)

4-variant smoke (`2026-11-13T22-34-56.036Z-57e949d4`, Luna none/low, Terra medium, DeepSeek none; ~$0.70 OpenRouter, $0.04 OpenAI) stopped with VERIFIER_FAULT after 53/72 sessions. Offline diagnosis: canary gate scoring bugs (fixed) — corrected DeepSeek recall 48/51 (94%), pipeline (guard + verifier) 49/51 (96%), honest false rejects 0/16 after correcting two unfaithful translation golds; remaining misses are Arabic/mixed interview-prep premises. Main blocker: 44/72 verifier verdicts violated the tasks-verifier protocol (IDs/coverage); prompt v2 + one retry implemented but unmeasured live. Smoke safety acceptance (saved, rescored): tailoring 12/12, summary 10/12, translation 7/12, job-evidence 4/12, cover-letter 0/5 (guard claim/sentence mismatches + semantic signals), interview-prep not reached.

Owner decision: pause tasks-v1 spending; use defaults below while building; re-run the tasks-v1 benchmark when T007/T008 implement the real contracts (harness ready; ~$5–10 with 3 finalists).

| Task                                                                                              | Default model @ effort                    |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| wording, injection, summary, tailoring, translation, job comparison, cover letter, interview prep | Luna @ low (upgrade path: Terra @ medium) |
| extraction                                                                                        | Luna @ high (Luna @ none acceptable)      |
| missing-info questions                                                                            | Terra @ medium                            |
| verifier (all tasks)                                                                              | DeepSeek V4.1 Flash @ low on Together     |

Model + effort per task must be configuration, not code, so a later benchmark can change one line.

## Open items

- Tasks-v1 study (summary, job-evidence, tailoring, translation, cover-letter, interview-prep) paused by owner decision on 2026-11-14 (see "tasks-v1 status at pause"); each operation is benchmarked at the end of T007/T008 with the T006 harness.
- Payload minimisation fixed to stop redacting dates, numbers and dotted tech names (payload v2).
- Production verifier availability: a separately approved backup endpoint is a proposal in `Planning/context/technical/ai.md`; decision models (e.g. Jev) are a later checker candidate to test against today's ~2,700 verifier judgments.

### Naming cleanup (2026-11-14)

Active names now describe regression behavior, core guard controls, pre-holdout provenance and lexical lost-fact replay. `freeze-history.json` preserves original seal/receipt metadata and hashes; byte-identical originals are archived outside the checkout. The current tasks manifest is resealed for `naming cleanup` and actual controls are rebound to its new hash. Earlier study IDs, receipt chains, raw outputs and stored historical paths remain unchanged; the historical core freeze remains stale. Obsolete eight-variant browser QA and schema-v2 probe scripts were retired unchanged. No inference or qualification is claimed.
