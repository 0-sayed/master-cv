# T015 — Qualify the paid release

**Task:** T015 · **PR size:** L · **Branch:** `test/t015-paid-release-qualification`
**Depends on:** T008, T010, T013 · **Priority:** 150
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Qualify the paid release after the free beta, paid-grant implementation and retained-tool dispositions.
Task completion does not authorize charging, deployment or real-data processing.

## Scope (in)

- Consume T013 core beta evidence and T010 paid grant/billing lifecycle evidence under A09.
- Qualify pricing and S24-S27 purchase/renewal/cancellation/downgrade, including retained editing/PDF access.
- Consume T008 enabled/withheld disposition for each tool; explicit withholding is sufficient.
  S32-S34 may remain unavailable; qualify them only if enabled.
- Confirm server-owned offer/usage data and truthful AR/EN claims; PDF never becomes a paid entitlement.
- Reconcile real-data, payment/merchant, recurring-method, policy and hosting gates for the proposed release.
- Mobile T014 remains independent and off unless separately activated after company/sender approval and A14-A16.

## Explicit exclusions

- No automatic charging/deployment, assumed merchant activation or gate approval.
- No mobile-authentication prerequisite, DOCX launch, employer scope, human review or public profiles.
- No mandatory enablement of a withheld T008 tool.

## Requirement IDs

**Owns:** None; integrates existing owners' release evidence.
**Consumes / contributes:** B-C01, B-C08, B-C10, B-C11, B-C12, B-C13, B-O04, B-O06, A04, A07, A08, A09, A11, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Consume S01 pricing and S24-S27 billing/recovery states; consume S32-S34 only if T008 enables them.
- Recheck the core T013 email/PDF journey and S28-S30 data-rights recovery after paid entitlement changes.
- Resolve current masters/states/dialogs in [figma-map.json](../../context/design/figma-map.json) using authorized
  access during implementation; no hard-coded node IDs or Popup Simulator/Note implementation.
- S37-S39 are outside this qualification; disabled mobile does not block paid release.

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

- Use existing repository test/document/browser tools; reuse T013 artifacts when source/configuration remains valid.
- Treat browser returns as display only; durable authenticated webhook/retrieved status controls paid grants.
- Enforce the [usage contract](../../context/business/requirements.md#usage-contract): billing-month reset,
  no rollover, one delivered user task per operation and preserved existing-CV editing/free PDF on downgrade.
- Withheld tools stay hidden/server-denied; a simulator is not live payment evidence.
- Reuse existing React/Vite/TanStack Router, Hono, Better Auth, schema and service conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` and existing runtime catalogs for interface strings.
  Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test paid lifecycle through sandbox callbacks/reloads/retries, duplicate/out-of-order events, failed renewal,
  cancellation and downgrade without duplicate grants or loss of existing CV editing/PDF access.
- Record sandbox evidence that deleting a paid account through T009 stops renewal before deletion completes;
  cover failed-stop retries and operations visibility, with no renewal charging a deleted account.
- Verify pricing/currency/interval/policies match approved server configuration in both languages.
- Verify enabled tools or withheld boundaries and repeat the core email/saved-export/privacy/recovery journey.
- Record A09 and other applicable gates honestly; no real payment or release activation is authorized here.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  Record unavailable browser/visual evidence as blocked rather than claiming it ran.
- Record actual checks, fixtures and unresolved gates; distinguish synthetic, sandbox and production evidence.
  This brief passes no gate and authorizes no activation.

## Open approvals/blockers affecting the task

- Company registration, real-data gates, Moyasar written rate card/merchant-method activation,
  approved tax/refund/renewal policies and final owner go/no-go still precede paid activation.
- T008 withholding is a valid disposition. T014 mobile activation and A14-A16 remain independent.
- A PDF/UI render or synthetic/sandbox result cannot certify a production payment or processing gate.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
