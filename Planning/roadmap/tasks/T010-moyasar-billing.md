# T010 — Deliver Moyasar billing and entitlement lifecycle

**Task:** T010 · **PR size:** L · **Branch:** `feat/t010-moyasar-billing`
**Depends on:** T005, T013 · **Priority:** 136
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Implement the selected Moyasar adapter and paid entitlement lifecycle in the existing backend with server-verified
outcomes and sandbox evidence.

## Scope (in)

- S24-S27 are post-beta. Add the public pricing section with T010 using actual approved server-owned offer data;
  T011 can finish its truthful landing page before this task.

- Consume B-C11 free enforcement from T005; add only paid grants/purchase/renewal/cancellation and B-O04 billing support.
- Own the post-beta Focus exhausted message (`billing.usage.operationsLimitHint`) and any plans action;
  T005 owns the Start S11 exhaustion message without a plans action.
- Add the billing step to the T009 account-deletion flow: stop future renewals before deletion completes.
  Retry a failed stop and make it visible to operations; never leave renewal charging a deleted account.
- Version server-owned plans, SAR minor units, currency/amounts, offer/tax/renewal/refund policy and entitlement
  transitions; never promote fixtures into production config.
- Integrate documented supported Moyasar checkout/tokenization through Hono; raw PAN/CVV never enters our
  backend/database/logs.
- Persist an authenticated durable webhook inbox, deduplicate events and retrieve/verify provider payment details
  before grants/reversals.
- Connect T005 ledger to approved grants/reversals without duplicate consumption or redirect-based success.
- Qualify one-off/tokenized/recurring support per payment method; cancellation/renewal-off/card updates reflect actual
  provider state.

## Explicit exclusions

- No real charges, merchant activation, approved fees, production offer or paid purchase authorized by this brief.
- No browser redirect as authority, invented webhook-signature scheme, CV-to-gateway payload or
  tokenization-implies-recurring claim.

## Requirement IDs

**Owns:** B-O04, A09.
**Consumes / contributes:** B-C11, B-O06, A06, A07, A08, A11, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S24/S25/S26/S27; inspect Start plan before upgrade, limit reached, pending, failed, renewal failed, renewal off
  and card updated.
- Use Cancel renewal and gateway-mediated payment updates; prototype Moyasar payment simulators never become product
  controls.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

## Source references

- [business/product.md](../../context/business/product.md)
- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `packages/api/src/features/`
- `apps/server/src/http/`
- `packages/db/src/schema/`
- `packages/env/src/server.ts`
- `packages/api/src/features/flags/`
- `apps/web/src/features/settings/`
- `apps/web/src/routes/dashboard/`
- `packages/email/src/templates/`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Use the [usage contract](../../context/business/requirements.md#usage-contract): Focus has 10 base CVs,
  100 operations resetting each billing month without rollover; proposed per-base fixture is 20 combined language versions/job-tailored copies.
- After downgrade/failed renewal, retain reading/editing/PDF export for every CV; block only new base creation above limit.
  Free enforcement and task accounting already belong to T005; do not defer them to billing.

- Add focused modules inside existing Hono/oRPC conventions, coordinating new payment files/migrations with T005
  ledger ownership; no separate backend.
- Authenticate documented secret_token, distinguish test/live, durably acknowledge receipt and reconcile
  provider-retrieved ID/status/amount/currency/ownership.
- Do not assume HMAC if the documented API uses secret_token; verify exact version/events in an authorized
  implementation session.
- Handle duplicates/out-of-order/late success, retries, partial/full refunds and idempotent entitlement reversals,
  including a closed browser.
- UI says neutral Saudi payment gateway until naming permission; use accessible riyal vector and approved
  total/billing interval.
- D05/D18: enforce server-side AI operations and CV count; PDF export is free in Start and Focus. Cover concurrent CV creation and durable AI ledger reservations; never add a PDF entitlement gate.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test monthly boundaries/no rollover, idempotent paid grants and renewal failures/cancellation/downgrade:
  all saved CVs remain readable, editable and PDF-exportable, with only above-limit new base creation blocked.
- Verify T011's landing page remains truthful with paid UI disabled, and pricing appears only with T010's approved offer.
- Test paid-account deletion through T009: renewal stops before completion; a failed stop is retried and
  visible to operations, with no renewal charging a deleted account.

- Sandbox tests cover success/failure/pending, bad secret, test/live mismatch, duplicate/out-of-order/late events and
  provider-read disagreement.
- Check grants/reversals/limits/refunds/cancellation/renewal/card changes after reload/relogin, with no duplicate
  credit or card/CV logging.
- Publish method-specific recurrence support and explicit unsupported states instead of promising every method renews.
- A09 is the owning gate; A07/A08/A11/A12/A13 still apply. Sandbox success cannot approve merchant activation, legal
  offer or live charging.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D05/D18 use the usage contract; Focus 49 SAR/month remains subject to Moyasar written rate card/activation, approved tax/refund/grace/settlement policies and A09. No paid gate applies to existing-CV editing or PDF export.
- D18 enforcement direction is resolved; test server-owned AI/CV entitlements. D09 payment processing/notices still need applicable evidence; UI keeps neutral Saudi payment-gateway copy.
- Moyasar is selected, but public naming, production credentials and customer charging are not approved.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
