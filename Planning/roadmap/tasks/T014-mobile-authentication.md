# T014 — Activate mobile authentication

**Task:** T014 · **PR size:** L · **Branch:** `feat/t014-mobile-authentication`
**Depends on:** T003, T009 · **Priority:** 140
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Activate the later mobile authentication increment under D20/D21 without blocking free beta or paid release.
Mobile signup, SMS verification/reset, recovery codes and S37-S39 stay off at launch.

## Scope (in)

- Own B-C17/B-C18 mobile + password signup, optional real email, SMS verification, mobile/email + password login,
  verified-mobile SMS reset and account recovery; preserve enrolled MFA and existing email login.
- Implement the shared purpose-bound intent/challenge/SMS adapter coordinator in existing auth/Hono,
  plus S28 mobile add/change/remove and fresh existing-account proof. T009 supplies data-rights/fresh-proof contracts.
- Deliver S37-S39, S15 mobile/code recovery, S38 reset -> S16 -> S14 password changed, S39 one-time codes,
  S28 persistent add-email prompt and Account recovery regeneration; preserve the full OTP specification.
- Own A14/A15/A16 evidence: company registration, approved sender, Taqnyat primary/Unifonic fallback,
  each route's DPA/processing/templates/domain/cost caps and shared atomic abuse controls.
- Start with synthetic supplier doubles. No live send before A15; activation also requires A14/A16.
- Keep SMS-only sign-in Phase 2 server-denied. Beta T013 and paid T015 never depend on T014.

## Explicit exclusions

- No employer identity, public profiles, automatic merges, national ID/Absher/Nafath, voice/WhatsApp, marketing SMS or
  SMS second factor.
- No new identity store, assumed Google approval or SMS-only sign-in under Phase 1.

## Requirement IDs

**Owns:** B-C17, B-C18, A14, A15, A16.
**Consumes / contributes:** B-C01, B-C12, B-O01, B-O02, B-O05, A06, A07, A08, A11, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own reusable S37 Mobile number, S38 Verify mobile and S39 Mobile verified desktop/mobile masters.
- Consume S02/S14/S15/S16 and S28/S29/S30/S36 for mobile creation, reset, recovery and fresh-proof integration.
- Inspect invalid/expired/wrong codes, consent, resend/attempt limits, locks, delayed/not-arriving,
  service unavailable and additional-verification recovery states.
- Resolve names/states/dialogs in [figma-map.json](../../context/design/figma-map.json) using authorized access
  during implementation. Do not hard-code node IDs or implement Popup Simulator/Note frames.
- Published masters do not authorize mobile activation; preserve D20/D21 and A14-A16.

## Source references

- [OTP specification](../../context/design/specs/otp-spec.md)

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

- Recovery uses OTP-01..OTP-12. Reset never grants a session; enrolled MFA remains required at next sign-in. A number not verified for 12 months (proposed) needs re-verification with independent account proof; changed/removed numbers cannot reset. Notify all verified contacts and revoke all other sessions. Lost number/no codes/no email has no self-service recovery; support never resets on claims alone.

- Inspect pinned Better Auth phone-number behavior and unique/non-null email/username schema assumptions. Support
  optional email through a reviewed migration; do not fabricate email identities or duplicate users.
- Normalize accepted Saudi formats/Arabic-Indic digits to +9665xxxxxxxx on the server; keep auth mobile separate from
  CV contacts. Password plus required factors establish sessions, never verification alone.
- Bind single-use OTP challenges to browser/session, number, purpose and provider request; enforce expiry, cumulative
  attempt budgets, atomic shared limits and concurrency/idempotency per Security.
- Fail closed on unavailable abuse controls, preserving approved existing login methods. No codes, secrets, full
  numbers or SMS bodies in logs.
- T014 owns mobile settings/recovery and supplier evidence; T009 supplies general fresh-proof contracts. Publish interfaces and
  coordinate migrations before consumers integrate.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test real auth/database registration, wrong password, verification, reset, sign-ups disabled, MFA, logout and
  expired sessions; test cross-user API/RLS/file denials.
- Cover leading-zero OTP paste/autofill, digit normalization, resend/expiry/exhaustion, redemption/uniqueness races,
  safe pre-verification responses, outages and direct endpoint bypass.
- Assert password-bearing sign-up, optional email and no email-link dependency; login requires password/MFA and
  unknown numbers never create or merge accounts.
- A14/A15/A16 are owning gates; A08 remains a consumer obligation. Collect A07/A11/A12/A13/A15/A16 contributions. Test stale-number re-proof (12 months proposed), changed/removed-number denial, reset MFA preservation, enumeration/rate/purpose/replay/concurrency, hashed-code one-time display/redemption and atomic old-set invalidation; D20 direction is not a gate pass.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D20 recovery/risk direction is resolved: issue 8 hashed single-use recovery codes once at phone-only creation (S39), require save acknowledgment, support atomic S15 redemption, purpose-bound reset, enumeration safety, all-contact notices and other-session revocation. Own regeneration/S28 integration with T009 contracts; A14-A16 still need implementation evidence.
- D21 selects Taqnyat primary, Unifonic fallback and MasterCV sender. Simulator only until A15; commercial registration, sender papers and written quotes from both remain company inputs. D09 processor evidence and Google availability remain separate.
- S37-S39 desktop/mobile masters are published in the 40-record inventory/map baseline. Their publication does not
  authorize release, real-number SMS or bypass A14-A16, D20 recovery or D21 supplier restrictions.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
