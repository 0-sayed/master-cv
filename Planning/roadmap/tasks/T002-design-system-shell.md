# T002 — Implement the native design system and bilingual shell

**Task:** T002 · **PR size:** L · **Branch:** `feat/t002-design-system-shell`
**Depends on:** T000 · **Priority:** 20
**Status:** Delivery scope agreed 2026-11-08: shared theme/language foundation; screen wording follows its existing feature task (D34). No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Extend Desk & Paper into one Arabic-first, fully English-capable interface foundation shared by every enabled personal
journey.

## Scope (in)

Use one shared control-size API for buttons, inputs, selects and segmented controls; use the same size within each toolbar. Keep size, line-height, padding and label-fit behavior in shared components. Never override them with call-site classes. Fit full AR/EN select labels including chevron space; preserve avatar content insets through the shared Avatar/UserDropdown composition. Verify long labels and both pointer modes.

- Map current semantic tokens, Base UI components and Phosphor icons to the design system; preserve APIs and
  light/dark behavior.
- Implement root interface locale/direction/persistence using the existing locale and Lingui setup; every enabled
  route uses the shared locale provider. Complete screen wording is delivered by its existing feature owner.
- Maintain Planning/context/design/copy-deck.json as the shared copy contract and validate the bindings delivered
  by this task. Each feature task reconciles its screen wording, keys and runtime catalogs before release.
- Provide navigation, forms, alerts, status/loading/empty/error patterns, dialogs/sheets and accessible locale
  switching.
- Provide shared phone/OTP fields and result-severity/status primitives; auth policy belongs to T003/T009 and ATS
  behavior to T004.
- Keep interface locale independent of document language, fonts, facts and revisions.

## Explicit exclusions

- No new editor, auth protocol, AI executor, billing service or parallel UI library.
- No mass component replacement or invented English copy where the deck is incomplete.
- No requirement to finish wording across the entire inherited app in T002. This delivery boundary does not
  approve retained exposure or waive the complete bilingual release contract.

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

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

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

Reject newly added raw UI font/color/spacing/radius values and control-size overrides outside shared definitions; require semantic roles and shared variants. Verify equal header/body start edges and invariant sidebar width across dashboard routes, matching toolbar heights, full select-label fit and avatar inset. Check AR/EN, narrow/wide layouts and every changed dialog/state; record evidence separately from functional smoke.

- Test shared locale/theme behavior on existing public/account/editor consumers without changing CV content,
  pending saves, editor undo/redo or an open form. Billing/privacy and other complete journeys are qualified by their
  existing feature owners; no simulated completion is accepted.
- Verify keyboard order, focus restoration, labels/errors, contrast, zoom/reflow, reduced motion, dialogs/sheets and
  touch targets against the WCAG 2.2 AA project target.
- Check actual font faces, mixed-direction text, long labels and responsive light/dark navigation.
- A07 remains the owning full-product interaction/accessibility gate; T002 supplies foundation evidence.
  Manual assistive-technology/device and complete-journey qualification remain release work with feature owners.
  A13 independently gates inherited feature exposure.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- Keep D11 final brand approval open; apply D35 and delivered T002 tokens without reopening the foundation.
  Preserve licensed assets; unavailable authorized Figma access blocks visual verification.
- The parallel copy deck must have reconciled keys before release of English UI. Full-app copy diagnostics remain
  explicit release integration blockers with named feature owners; they do not block delivery of the agreed T002
  foundation. Use `copy:check:bindings` for delivered bindings and retain `copy:check` for the full release audit.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
