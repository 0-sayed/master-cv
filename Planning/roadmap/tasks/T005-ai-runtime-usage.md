# T005 — Deliver bounded AI operations and usage accounting

**Task:** T005 · **PR size:** L · **Branch:** `feat/t005-ai-runtime-usage`
**Depends on:** T004 · **Priority:** 50
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Provide one bounded durable AI-operation and usage-accounting foundation, keeping unapproved real-data processing
disabled.

## Scope (in)

- Inspect existing persistence before adding jobs: reuse an equivalent mechanism or use the proposed PostgreSQL-backed
  worker only where missing.
- Persist operations/attempts, revisions, idempotency, leases/recovery, cancellation and truthful state; authorize
  requests, workers, results and artifacts.
- Add a server-only approved-route adapter with validated structured output, bounded retries/repairs/timeouts, refusal
  and truncation handling.
- Own B-C11 Start/free base-CV/copy limits, reservation/settlement/release ledger, concurrency/cost controls
  and redacted diagnostics. T010 only adds paid grants and billing lifecycle.
- Own `billing.usage.startOperationsLimitHint` in S11: Start operations never replenish; manual editing and PDF
  download remain available. No View plans action at beta; T010 owns Focus exhaustion and any plans action.
- Own A11 approved processing/data-flow evidence: exact endpoint/model, suppliers/locations/contracts, data
  classes/retention/notices and fail-closed behavior.
- Publish durable-operation/ledger interfaces and synthetic doubles to consumers; no feature creates a second queue or
  credit counter.

## Explicit exclusions

- No provider purchase, real-CV call, production model certification or automatic provider/jurisdiction fallback.
- No unconstrained agent tools, shell access, RAG platform or model-based billing/permissions/persistence.

## Requirement IDs

**Owns:** B-C11, A11.
**Consumes / contributes:** B-C04, B-C06, B-C07, B-C10, B-O02, B-O04, A02, A03, A06, A07, A08, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- No owned screen. Consume S11 assistant not enabled/unavailable/Start usage limit reached and notices in
  S04/S11/S19/S29. S24 limits and Focus exhaustion belong to post-beta T010.
- Feature owners render actual queued/running/review/succeeded/failed/cancelled states, never synthetic progress or
  elapsed-time success.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/ai.md](../../context/technical/ai.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)

## Ownership boundaries

- `packages/api/src/features/ai/`
- `packages/api/src/features/ai-providers/`
- `packages/api/src/features/flags/`
- `packages/ai/src/`
- `packages/db/src/`
- `packages/env/src/server.ts`
- `apps/server/src/`
- `apps/web/src/features/assistant/`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Implement the [usage contract](../../context/business/requirements.md#usage-contract) before paid billing:
  a slot is a base CV; Start includes 1 language version, 1 tailored copy and 5 once-only operations, no replenishment.
- One delivered user task costs one operation across all internal calls; failure/cancellation costs zero,
  automatic retries add no cost. Show cost, preflight all limits and reserve before AI; settle at most once.
- Keep all existing CVs readable/editable/PDF-exportable after downgrade/failed renewal;
  only new base creation above the plan limit is blocked.

- Use existing Hono/oRPC/schema/storage conventions. The worker is a process of this product and database, not a new
  service product or identity store.
- Scope idempotency by owner/operation/input revisions/config; enqueue/reserve transactionally, settle once and
  release reservations under an approved failed/cancelled-work policy.
- Recovered workers check completed side effects before retry. Distinguish cancellation request from confirmed
  cancellation and late external outcomes.
- Allowlist reviewed endpoints and deny unapproved fallbacks; OpenRouter preference/ZDR does not resolve CV-data DPA
  coverage or Saudi-location policy.
- Minimize prompts/logs; count all retries/repairs/token categories in internal costs without logging CVs or treating
  every failed attempt as user-billable.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test the complete free flow without T010: included language/tailored copies save, revisions consume no slots,
  racing base creation cannot exceed limits, five once-only operations do not replenish, and preflight prevents wasted AI.
- Verify S11 uses the Start exhaustion message with no plans action and preserves manual editing/PDF download.
- Test multi-call task settlement, failed/cancelled work, duplicate delivery and automatic retries without extra charge.

- Test racing/duplicate requests and reservations, quota exhaustion, retries/refusals/schema failure/truncation,
  timeout, cancellation and crashed-worker recovery.
- Prove at-most-once settlement/release and cross-user isolation, including late results and recovered jobs.
- Denied/unavailable routes fail closed and configuration cannot bypass policy; logs/telemetry contain no content or
  secrets.
- A11 is the owning gate; A02/A03/A08/A12/A13 and A09 consumers need separate evidence. Synthetic doubles cannot
  approve real routes.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D09/D16 require overseas OpenRouter opt-in/explicit first-use consent, PDPL transfer contract safeguards, minimized CV text and no contact fields. Saudi core/database/backups remain fixed; exact route/retention/quality and A11 evidence still gate real CVs.
- D05/D18 and the usage contract resolve units/periods/free enforcement; tax/refund/grace policies and Moyasar quote/activation remain required only for paid charging.
- Technical decision T15 governs durable-operation guidance; it is not an additional roadmap task.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
