# T009 — Complete account settings and data-rights workflows

**Task:** T009 · **PR size:** L · **Branch:** `feat/t009-account-data-controls`
**Depends on:** T005 · **Priority:** 80
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Deliver email account settings, active-data deletion and a durable deletion record with fresh proof.
T012 consumes that record for backup restore and deletion replay; mobile settings/recovery belongs to later T014.

## Scope (in)

- Own B-C12 access/correction/export/deletion/privacy and B-O01/B-O05 support/data-rights workflows.
- Adapt email/password settings; retain the old email until verified replacement commits and preserve enrolled MFA.
- Enforce fresh independent, purpose-bound server proof for export/deletion, with separate deletion confirmation.
- Delete active personal data/files/artifacts/reports and cancel queued work; propagate approved processor deletion.
- T009 owns the account-deletion flow; T010 adds the paid-account renewal-stop step before deletion completes.
- Persist a durable minimal deletion record for replay after backup restoration, with approved retention/access rules.
  T012 consumes it and owns restore/replay evidence; backup evidence is not a T009 merge prerequisite.
- Keep mobile settings, SMS recovery, codes and S37-S39 disabled for T014.

## Explicit exclusions

- No instant deletion-everywhere claim, invented retention deadline, support bypass or employer/public-profile controls.
- No mobile settings/recovery implementation or supplier activation; T014 owns B-C17/B-C18 and A14-A16.
- No backup restore/replay evidence here; T012 owns that follow-on acceptance.

## Requirement IDs

**Owns:** B-C12, B-O01, B-O05.
**Consumes / contributes:** B-C01, B-O02, A06, A07, A08, A11, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S28/S29/S30/S31/S36 for email settings, data export, deletion request/pending confirmation and help.
- Inspect email-change pending, fresh-proof expiry/failure, export pending/ready/failed, deletion review, request pending, failure/retry and completion.
- Resolve current masters and dialogs in [figma-map.json](../../context/design/figma-map.json) during implementation.
  Verify current names/renders using authorized access; do not hard-code node IDs or implement Popup Simulator/Note frames.
- T014 later consumes these settings/proof contracts for mobile instances; they are disabled at launch.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/settings/`
- `apps/web/src/dialogs/auth/`
- `apps/web/src/routes/dashboard/`
- `packages/auth/src/`
- `packages/api/src/features/auth/`
- `packages/api/src/features/storage/`
- `packages/db/src/schema/auth.ts`
- `packages/email/src/templates/`
- `apps/server/src/http/`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Reuse current account/session/data services. Fresh proof is independently checked, short-lived,
  action-bound and single-use; never accept an arbitrary timestamp as proof.
- Define the durable deletion-record interface for T012 before integration: scope, affected identities,
  completion/version markers and minimal replay metadata without retaining raw CV content.
- Apply active-data deletion and queued-work cancellation idempotently; preserve lawful retention exceptions honestly.
- Email recovery remains available with enrolled MFA; mobile-specific recovery is outside this task.
- Reuse existing React/Vite/TanStack Router, Hono, Better Auth, schema and service conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` and existing runtime catalogs for interface strings.
  Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test persisted email settings, old-address preservation, stale sessions, fresh-proof expiry/replay/purpose mismatch,
  owner isolation and MFA continuation across account recovery.
- Test access/export/correction/deletion across active tables, private objects, derived artifacts and queued work.
- Verify durable deletion records survive retries/restarts without raw CV content and are available to T012 replay.
- Test completion and retained exceptions honestly; T012 owns backup restore/replay evidence after this task.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  Record unavailable browser/visual evidence as blocked rather than claiming it ran.
- Record actual checks, fixtures and unresolved gates; distinguish synthetic, sandbox and production evidence.
  This brief passes no gate and authorizes no activation.

## Open approvals/blockers affecting the task

- Company registration, legal entity/controller contact, approved retention policies, AR/EN notices/lawyer review
  and applicable real-data gates remain open; synthetic work does not approve them.
- D20/D21 and SMS company/sender requirements belong to T014 and do not gate email/data-rights completion.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
