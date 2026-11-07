# T012 — Prepare Saudi deployment and operational recovery

**Task:** T012 · **PR size:** L · **Branch:** `chore/t012-saudi-deployment-operations`
**Depends on:** T005, T009 · **Priority:** 75
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Prepare owner-controlled Saudi deployment, restoration and operational controls with evidence, without procuring or
activating production resources.

## Scope (in)

- Own B-O02 operational diagnosis and A12 backup/restore/deletion/support/alert evidence.
- Prepare owner-controlled Saudi core/database/backups with isolated synthetic deployments and rollback procedures.
- Consume T009's active-data deletion and durable deletion record; own real backup restore and deletion replay evidence.
  Replay every applicable deletion before restored data can be served; test retries and failure recovery.
- Qualify worker/queue/database/private-object failure recovery, redacted diagnostics, alerts and processor disablement.
- Keep mobile routes/flags off; T014 owns SMS supplier/configuration/abuse-cost qualification and A15.
- No paid resources or real-data deployment is activated merely by merging this task.

## Explicit exclusions

- No paid provisioning, production deployment/publication, real CV/SMS processing, domain purchase or
  production-secret use authorized here.
- Hostinger stays a synthetic-data test server under D30, never a real-data target. No assumption a reported gateway is
  Saudi/approved/available; no new queue/cloud/telemetry product by habit.

## Requirement IDs

**Owns:** B-O02, A12.
**Consumes / contributes:** B-O01, B-O04, B-O05, B-O06, B-C12, A08, A09, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own no product screens. Exercise affected saved-work, service-unavailable and account deletion/export consumers.
- Use the current [figma-map.json](../../context/design/figma-map.json) for consumer states during implementation.
  Verify names/renders using authorized access; do not hard-code node IDs or implement Popup Simulator/Note frames.
- Mobile S37-S39 supplier/outage acceptance is later T014 work, off the beta and paid critical paths.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/ai.md](../../context/technical/ai.md)

## Ownership boundaries

- `.github/workflows/`
- `compose.dev.yml`
- `apps/server/`
- `packages/env/src/`
- `packages/config/`
- `packages/db/src/`
- `packages/email/src/`
- `packages/api/src/features/storage/`
- `packages/api/src/features/flags/`
- `docs/development.md`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Extend current deployment/configuration and persistent job mechanisms; avoid a second scheduler.
- Core app, database and backups stay in Saudi Arabia under D09/D16; overseas AI remains separately consented/gated.
- Encrypted consistent DB/private-object backups need approved finite retention and RPO/RTO.
  Replay T009 durable deletion records before restored data is served; stop serving on replay failure.
- Alert on health, queue age, database/disk, failures and spend; budgets are alerts, not hard enforcement.
- Keep both mobile flags false. Company registration and real-data gates precede real users;
  SMS company/sender/contracts and A14-A16 belong to T014.
- Reuse existing React/Vite/TanStack Router, Hono, Better Auth, schema and service conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` and existing runtime catalogs for interface strings.
  Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test isolated synthetic deploy/rollback, migration compatibility, actual DB/object restore, worker recovery,
  deletion replay, restricted service access and redacted logs/alerts.
- Delete active data via T009, restore a pre-deletion backup, replay the durable record and verify the user's
  data/artifacts cannot reappear. Exercise failed/repeated replay and enforce the no-serving boundary.
- A12 is the owning gate; applicable A08/A11/A13 evidence and real-data approvals remain independent.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  Record unavailable browser/visual evidence as blocked rather than claiming it ran.
- Record actual checks, fixtures and unresolved gates; distinguish synthetic, sandbox and production evidence.
  This brief passes no gate and authorizes no activation.

## Open approvals/blockers affecting the task

- Company registration, Saudi cloud ownership/region/budget, legal entity/controller contact,
  retention/RPO/RTO, AR/EN notice review and real-data gates remain required; no provisioning is authorized.
- D09/D16 AI consent/contract evidence remains separate. T014 owns SMS company/sender/supplier evidence.
- Payment activation is not a free-beta prerequisite; A09 still precedes any paid release.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
