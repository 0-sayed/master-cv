# T009 — Complete account settings and data-rights workflows

**Task:** T009 · **PR size:** L · **Branch:** `feat/t009-account-data-controls`
**Depends on:** T005 · **Priority:** 80
**Status:** Implementation approved for PR delivery, 2026-11-15. Release and external-service gates remain open.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; tick the T009 row and update its Mermaid class when the task PR is first shipped, per AGENTS.md (owner decision 2026-11-14).

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
- Make implicit data state explicit (audit 2026-11-10, ui-audit/implicit-state.md #25,27,28,41): uploaded pictures get
  explicit owner/visibility with revocable delivery (no public-by-path, no long public cache for private CVs);
  restoring from trash keeps sharing off unless the owner turns it back on; trash purge is scheduled and recorded;
  security settings show unknown/error instead of "not enrolled". Prove each with a failing test first.

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

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

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
- When the task PR is first shipped, tick its row in tasks.md and update its class in dependencies.mmd, preserving all 16 large PRs (AGENTS.md; owner decision 2026-11-14).

## Delivery evidence - 2026-11-15

Requirements: B-C12, B-O01 and B-O05; implementation, recovery inventory and exact S28–S31/S36 master/state/dialog IDs are recorded in [account/data evidence](../../../docs/t009-account-data-controls-evidence.md) and [browser verification](../../../docs/t009-browser-verification.md). This delivery uses the owner-approved implemented UI as the D36 layout reference; no new live Figma verification is claimed.

- Recorded host validation: `pnpm validate:static` PASS; `pnpm test:ci` completed all 20 package tasks successfully. Subsequent focused web/tooling runs passed after UI changes. A later root attempt failed because its selected disposable OAuth database was absent; this does not replace the earlier completed package run.
- Recorded browser acceptance: 51 spec files, 340 cases with four workers. The full run passed 338 and failed two real-zoom cases; the subsequent 56-case recovery run passed, covering both failures after restoring shared mobile navigation typography. All 340 cases therefore have passing evidence across the full and recovery runs, not one clean full rerun.
- Browser review ledger: 89 decisions, **80 fixture/assertion updates** to follow approved UI while preserving contracts, and **9 product-fix decisions**. The nine are: visible paste clipping (1), equal mobile navigation height (1), profile-photo session refresh in AR/EN (2), wrapping the Arabic device-timezone action in light/dark (2), sidebar brand flex alignment in AR/EN (2), and measured mobile-navigation toast clearance (1). These correspond to six distinct fixes; the later zoom typography correction is recorded separately above. Evidence source: owner browser-fixes decision ledger, 2026-11-15.
- The root schema dependency is required by root-owned Playwright specs/fixtures importing `@reactive-resume/schema/resume/*`; tooling's own dependency does not provide root resolution.

D36 owner-approved deviations (2026-11-15):

- Center all settings headings, tabs, dividers and stacked cards in the same 720px column to prevent tab shifts; let fields fill the owning card and align stacked actions to the label start.
- Move New CV to the sidebar top, group Trash with main destinations and consolidate account actions at the bottom; place the shared sidebar-panel toggle by the logo and use capped count badges for stable, discoverable navigation.
- Keep signed-in Help in the app shell and signed-out Help public; use a growing seven-line textarea and localized inline errors for reachable, consistent recovery.
- Use dashed EmptyState only for empty collections, separate failed/filtered/status outcomes, and center decorative empty-CV previews to communicate first use without implying an operation succeeded.
- Replace upload prose with validator-derived PDF/size/page chips and LTR size isolation for readable Arabic limits; retain warnings at the point they apply.
- Offer language/fluency/skill presets plus custom text while preserving saved facts and document-language independence.
- Split CSV import into choose/match/review steps and job saving into Link/Paste tabs to make input and explicit approval clear.
- Apply the shared subtle Sadu tile, once-only logo check and confirmed-success celebration to add character while keeping document paper unchanged and respecting reduced motion.
- Remove repeated trust footnotes, the Help/Privacy publication promise and Help draft notice to reduce noise and avoid unapproved promises; legal/retention gates remain open.

Final pre-commit verification: `pnpm validate:static` PASS (format, token lint, 22 workspace typechecks, Knip and boundaries); roadmap checker PASS with 0 errors. Production build PASS through the isolated browser runner. Four affected upload/first-use/import specs have 16 passing cases across the initial 12 passes and the four-case recovery run, with four workers and no skips. No spec was modified after the recorded 51-file run until this final validation exposed ambiguous import fixture selectors; the two changed specs were rerun. Upload component tests: 7 passed. Focused locale-binding/cache tests: 15 passed, zero binding diagnostics.

The final checks exposed a static PO module import without a declaration and import fixtures matching both sidebar/page creation actions, both hidden file inputs, or a celebration toast as a task dialog. Reuse the app's typed catalog loader and scope fixture selectors to the main action/task dialog; preserve CV persistence, approval, cancel and document-language assertions. The initial static invocation also used a relative isolation preload; rerun with its absolute repository path passed. Commit scanning identified two synthetic credential literals; replace them with repeated fixture values. API configuration checks passed 12 inventory/support tests and 8 passkey integration tests against a disposable database after these changes. No product behavior changed in these fixes.

No production activation, paid inference, real-CV processing, SMS, payment, or backup-restore qualification is asserted.
