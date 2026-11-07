# T003 — Deliver accounts and the private career workspace

**Task:** T003 · **PR size:** L · **Branch:** `feat/t003-private-career-workspace`
**Depends on:** T002 · **Priority:** 30
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Deliver AR/EN email accounts, the private career workspace and the career-data mapping consumed by T004.
Mobile authentication is a separate later T014 increment and cannot block this task.

## Scope (in)

- Deliver email + password sign-up, email verification, sign-in, email password recovery, sign-out,
  session expiry and enrolled MFA in Arabic and English.
- Deliver S04 first visit, S17 document list and S18 career information with persisted owner-scoped state,
  including empty, limit and error recovery.
- Own the [career-data mapping](../../context/technical/architecture.md#career-data-mapping): preserve preferences,
  extend existing facts/records with structured values, confirmation, stable fact IDs and revisions.
- Publish base-CV/fact-revision link contracts for T004; CV edits stay local, and master updates require explicit choice.
- Enforce API/worker ownership and database RLS; test privileged-role bypass and object/download authorization.
- Keep mobile signup, SMS verification/reset, recovery codes and S37-S39 disabled and outside T003 completion.
- Follow the D30 temporary setup: send email through the existing `SMTP_*` settings, so changing supplier is
  configuration only. Without them the fork logs email to the console, which is for local development only.
- Keep Google sign-in off under D25: leave `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` empty and show no Google button.

## Explicit exclusions

- No mobile implementation, optional-email migration, SMS coordinator/supplier work or S37-S39 acceptance.
  T014 owns that later increment under unchanged D20/D21 and A14-A16.
- No employer identity, public profiles, new identity store or assumed Google approval.

## Requirement IDs

**Owns:** B-C01, A08.
**Consumes / contributes:** B-C05, B-C12, B-O01, A06, A07, A11, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S02/S03/S04/S14/S15/S16/S17/S18 for the email launch journey.
- Inspect email link expired/sent, password changed, session expired, empty and Start-plan states.
- Resolve current masters/states/dialogs in [figma-map.json](../../context/design/figma-map.json).
  Verify names and current renders through authorized access during implementation; do not hard-code node IDs.
- Use Account details/Sign out patterns; S37-S39 and mobile-only states belong to T014.
- Never implement Popup Simulator/Note frames or infer application routes from prototype navigation.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/auth/`
- `apps/web/src/features/user/`
- `apps/web/src/features/documents/`
- `apps/web/src/features/career/`
- `apps/web/src/routes/auth/`
- `apps/web/src/dialogs/auth/`
- `packages/auth/src/`
- `packages/api/src/features/auth/`
- `packages/api/src/features/career/`
- `packages/api/src/features/documents/`
- `apps/server/src/http/`
- `packages/db/src/schema/auth.ts`
- `packages/db/src/schema/career.ts`
- `packages/email/src/templates/`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Preserve the existing email identity model and verification/recovery hooks; reset never grants a session
  or bypasses enrolled MFA. Do not introduce phone-only compatibility for launch.
- Inspect existing career profile, text-fact and resume schemas before adding migrations.
  Extend existing records where practical; no second career database or competing source of truth.
- T004 consumes stable fact/revision links; an explicitly reviewed master update marks dependents stale
  without rewriting their independently accepted content.
- Reuse existing React/Vite/TanStack Router, Hono, Better Auth, schema and service conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` and existing runtime catalogs for interface strings.
  Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test persisted email signup, verification/link expiry/resend, login, recovery, wrong password, signup restrictions,
  MFA continuation, logout and expired sessions in both languages.
- Test cross-user API/RLS/file denial and privileged-role behavior using actual data boundaries.
- Test preference preservation, stable fact IDs, confirmation/revisions, local CV edits versus explicit master updates,
  and independent variants without silent propagation.
- A08 is the owning gate. Mobile endpoints remain disabled; T003 does not require A14-A16 implementation.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  Record unavailable browser/visual evidence as blocked rather than claiming it ran.
- Record actual checks, fixtures and unresolved gates; distinguish synthetic, sandbox and production evidence.
  This brief passes no gate and authorizes no activation.

## Open approvals/blockers affecting the task

- Email delivery configuration, D09 processing/notices, company registration and real-data gates remain required
  before real users; use synthetic identities and test transport beforehand.
- D20/D21 mobile direction is retained for T014 only. Company/sender inputs and A14-A16 do not block email work.
- No implementation, visual verification or gate pass is asserted by this plan.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
