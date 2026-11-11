# T011 — Deliver the public landing and acquisition journey

**Task:** T011 · **PR size:** L · **Branch:** `feat/t011-public-experience`
**Depends on:** T007, T009 · **Priority:** 110
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Deliver bilingual public entry and legal/acquisition journeys whose promises match actual feature availability and
approved offer.

## Scope (in)

- Own S01 landing and S35 privacy/terms presentation, navigation and public-to-email-account transitions.
- Own B-O06 consistency across pricing/formats/AI/privacy/availability, product emails and marketing.
- Ship a simple truthful landing page using T007 behavior and T009 data-rights policies; no billing dependency.
- T010 adds the pricing section and paid transitions later from approved server-owned offer data.
- Provide full Arabic/English public UI from T002's copy-deck contract and current masters.
- Keep acquisition events minimal and purpose-defined under approved analytics/data notices.

## Explicit exclusions

- No fabricated customers/reviews, ATS pass/hiring guarantees, unverified Saudi/PDPL/ZDR claims or unapproved
  prices/discounts.
- No employer acquisition portal, public CV/profile launch, new analytics supplier or prototype-implied provider
  endorsement.

## Requirement IDs

**Owns:** B-O06.
**Consumes / contributes:** B-C01, B-C02, B-C07, B-C08, B-C09, B-C11, B-C12, A04, A05, A07, A08, A09, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S01 Landing and S35 Privacy and terms including terms state.
- Consume S02 email sign-up, S14 return and S36 help; S24-S27 paid transitions are post-beta T010 work. Inspect navigation, deep
  links and unavailable-feature paths.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

## Owner decision 2026-11-11 &mdash; landing design source

- Use a MIXED landing design: Figma's landing inventory (screens, states and content as starting design per D36)
  plus inspiration from the original Reactive Resume landing page by Amruth Pillai (MIT): animations, motion and section ideas.
- Before building, research candidate upstream animations/elements with screenshots/recordings; the owner picks
  which to adapt.
- Adapt selected elements to Master CV's brand, T002/D35 tokens, copy deck and AR/EN. Never reuse Reactive Resume's
  name, logo, screenshots or third-party images as our own; check each non-code asset's own license.
- Keep the MIT copyright/license text in `LICENSE` and the footer credit
  'Built on Reactive Resume by Amruth Pillai, licensed under MIT'; add a link to the
  [original repository](https://github.com/reactive-resume/reactive-resume).
- Do not update Figma for this decision; record each divergence in this task's evidence under D36.

## Source references

- [business/product.md](../../context/business/product.md)
- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/security.md](../../context/technical/security.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/homepage/`
- `apps/web/src/routes/_home/`
- `apps/web/src/routes/__root.tsx`
- `apps/web/locales/`
- `packages/email/src/templates/`
- `packages/api/src/features/flags/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Reuse existing React/Vite/TanStack public pages/routing; no Next.js landing app or parallel library.
- Use deck gate notes including neutral gateway naming and DOCX not available until A05. Interface switching never
  changes CV content.
- When T010 adds pricing, only its approved server-owned prices/allowances may be published; Start/Focus prototype counters and tax
  arithmetic remain fixtures.
- Legal text remains draft until approved against actual processing/retention/rights policy; link to working support
  and data controls.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Check public links, sign-up/sign-in transitions, legal tabs/deep links, keyboard focus, mobile menus and full locale
  coverage.
- Compare all format/template/AI/ATS/pricing/renewal/privacy claims with release availability and payment/data gate
  records.
- Ensure demo receipts/customer identifiers/plan fixtures are never presented as real operational evidence.
- Apply A04/A05/A09/A11/A13 to capabilities/claims and A07/A08 to interaction/public exposure; copy cannot substitute
  for gate evidence.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D05/D18 offer approval is not required for the initial no-pricing landing page. T010 pricing/live billing still needs Moyasar quote/activation and A09; D11 brand review remains open. Word stays unavailable until future A05.
- D09/D16/D22/D23 govern privacy, AI/ATS claims and public analysis exposure.
- Moyasar naming and legal text need explicit approval; Google sign-in remains independently gated.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
