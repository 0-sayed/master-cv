# T013 — Qualify the free beta

**Task:** T013 · **PR size:** L · **Branch:** `test/t013-integrated-release-qualification`
**Depends on:** T007, T009, T011, T012 · **Priority:** 130
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Qualify the free email-based CV beta with a bounded go/no-go and availability record.
No automatic deployment, real-data activation or gate approval follows from task completion.

## Scope (in)

- Qualify email account -> import or manual entry -> reviewed edits -> one job-tailored version ->
  Arabic and English PDF, with saving, privacy, deletion and email recovery intact.
- Own A13 enabled/withheld/deferred capability decisions; retain B-C14-B-C16, B-E01-B-E08 and A10
  as deferred-disposition ownership only, without implementing employer or other future features.
- Own B-O03 candidate-outcome evidence using synthetic fixtures until real-user authorization.
- Reconcile A01-A04, A06-A08 and A11-A13 evidence for this scope; T012 owns backup restore/deletion replay.
- S32-S34 retained tools and S24-S27 paid billing are post-beta. T008 may withhold either tool.
- Mobile signup, SMS verification/reset, recovery codes and S37-S39 remain off and outside beta acceptance.
- Real users require company registration and applicable real-data gates; before then qualification stays synthetic.

## Explicit exclusions

- No paid release/charging, production activation, mobile implementation or mandatory S24-S27/S32-S34 delivery.
- No DOCX availability, employer B2B, human review, public profiles or unreviewed integrations.
- T015 owns paid-release qualification; T014 independently owns later mobile activation.

## Requirement IDs

**Owns:** B-C14, B-C15, B-C16, B-E01, B-E02, B-E03, B-E04, B-E05, B-E06, B-E07, B-E08, B-O03, A10, A13.
**Consumes / contributes:** B-C01, B-C02, B-C03, B-C04, B-C05, B-C06, B-C07, B-C08, B-C09, B-C11, B-C12, B-O01, B-O02, B-O05, B-O06, A01, A02, A03, A04, A06, A07, A08, A11, A12.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Consume launch S01-S23 plus S28-S31/S35/S36 and mobile pane S08b for the core email CV journey.
- Verify unsupported import, review/undo, stale proposals, conflicts, translation review, download,
  email verification/reset, deletion and recovery states across the responsible task owners.
- S24-S27/S32-S34 are post-beta; S37-S39 mobile is a separately gated later increment.
- Resolve current masters/states in [figma-map.json](../../context/design/figma-map.json) during implementation.
  Use authorized access, record unavailable renders honestly, never hard-code node IDs or implement Popup Simulator/Note frames.

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

## Source references

- [business/product.md](../../context/business/product.md)
- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/ai.md](../../context/technical/ai.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)
- [design/inventory.json](../../context/design/inventory.json)
- [design/figma-map.json](../../context/design/figma-map.json)

## Ownership boundaries

- `Planning/roadmap/`
- `apps/web/`
- `apps/server/`
- `apps/mobile/`
- `packages/`
- `docs/t000-evidence.md`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Reuse existing test/fixture/browser/document tools; no new qualification framework or production shortcuts.
- Bind evidence to actual source/configuration and final PDF bytes; document limitations and independent gate status.
- Verify Start's included language and tailored copies without extra base slots; review changes before acceptance.
- Test durable saving, owner isolation, deletion and recovery through interrupted/reopened journeys.
- Expose only evidenced features; keep paid, mobile, public sharing and withheld tools denied on the server.
- Reuse existing React/Vite/TanStack Router, Hono, Better Auth, schema and service conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` and existing runtime catalogs for interface strings.
  Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Run the complete synthetic email-account -> PDF beta journey with one reviewed job-tailored copy
  and independent Arabic/English output, including saving/reopen, privacy/deletion and email recovery.
- Verify T012 restore/deletion-replay evidence and cross-user/unauthorized-file denial.
- Reconcile applicable beta gates and requirement/screen ownership; no untested item is a pass.
- Confirm paid/mobile/withheld features remain disabled and do not gate this beta's completion.
- Real-user beta remains blocked until company registration and applicable real-data evidence pass.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  Record unavailable browser/visual evidence as blocked rather than claiming it ran.
- Record actual checks, fixtures and unresolved gates; distinguish synthetic, sandbox and production evidence.
  This brief passes no gate and authorizes no activation.

## Open approvals/blockers affecting the task

- Final owner go/no-go, company registration and real-data/hosting/AI approvals remain independent of merge.
- D03 input evidence, D11 brand and D15 resources remain scoped blockers where applicable.
- A05 DOCX, A09 paid, A10 employer and A14-A16 mobile gates are not free-beta prerequisites
  while their features remain disabled; applicable privacy/operations gates still apply.
- Owner deferred to this release pass (2026-11-10): the owner's mobile 390 review of the T003 workspace
  and the D25 Google sign-in wording decision.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
