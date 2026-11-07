# T002 — Implement the native design system and bilingual shell

**Task:** T002 · **PR size:** L · **Branch:** `feat/t002-design-system-shell`
**Depends on:** T000 · **Priority:** 20
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Extend Desk & Paper into one Arabic-first, fully English-capable interface foundation shared by every enabled personal
journey.

## Scope (in)

- Map current semantic tokens, Base UI components and Phosphor icons to the design system; preserve APIs and
  light/dark behavior.
- Implement root interface locale/direction/persistence using the existing locale and Lingui setup; every enabled
  route needs full Arabic and English UI.
- Own Planning/context/design/copy-deck.json as the English UI copy contract. Reconcile parallel delivery; each
  feature task adds its keys there and in existing runtime catalogs.
- Provide navigation, forms, alerts, status/loading/empty/error patterns, dialogs/sheets and accessible locale
  switching.
- Provide shared phone/OTP fields and result-severity/status primitives; auth policy belongs to T003/T009 and ATS
  behavior to T004.
- Keep interface locale independent of document language, fonts, facts and revisions.

## Explicit exclusions

- No new editor, auth protocol, AI executor, billing service or parallel UI library.
- No mass component replacement or invented English copy where the deck is incomplete.

## Requirement IDs

**Owns:** A07.
**Consumes / contributes:** B-C01, B-C03, B-C07, B-C09, B-C11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Foundations, Components, English (LTR) and Dark showcase are foundation references, not application routes.
- Consume S01-S39 and S08b through screen owners; inspect default/focus/invalid/disabled, long labels, Dialog/Sheet,
  Phone field, OTP field, Resend status and ATS severity/status patterns.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)
- [design/inventory.json](../../context/design/inventory.json)
- [design/figma-map.json](../../context/design/figma-map.json)

## Ownership boundaries

- `apps/web/src/features/locale/`
- `apps/web/src/features/theme/`
- `apps/web/src/routes/__root.tsx`
- `apps/web/src/index.css`
- `apps/web/locales/`
- `packages/ui/src/components/`
- `packages/ui/src/styles/globals.css`
- `packages/fonts/`
- `Planning/context/design/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Use Noto Sans Arabic for Arabic functional/display UI, Noto Sans for English functional UI and Noto Serif for
  English editorial headings, subject to D11/licensing.
- Apply logical CSS and semantic dir/lang; isolate email, URL, phone and OTP values with LTR behavior. Latin display
  digits must not damage accepted input or stored facts.
- Preserve Type Arabic/English mode semantics; English-interface masters and English-document states are separate.
- Reuse the approved Saudi riyal vector and accessible currency label; keep prices/allowances as fixtures outside
  production configuration.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test locale switching on representative public/account/editor/billing/privacy routes without changing any CV
  content.
- Verify keyboard order, focus restoration, labels/errors, contrast, zoom/reflow, reduced motion, dialogs/sheets and
  touch targets against the WCAG 2.2 AA project target.
- Check actual font faces, mixed-direction text, long labels and responsive light/dark navigation.
- A07 is the owning interaction/accessibility gate; feature owners contribute real journeys. A13 independently gates
  inherited feature exposure.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D11: visual/font direction needs owner review and licensed assets; unavailable authorized Figma access blocks visual
  verification.
- The parallel copy deck must exist with reconciled keys before release of English UI; missing entries remain explicit
  integration blockers.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
