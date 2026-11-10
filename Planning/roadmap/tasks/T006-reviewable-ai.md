# T006 — Deliver reviewed AI extraction and CV improvement

**Task:** T006 · **PR size:** L · **Branch:** `feat/t006-reviewable-ai`
**Depends on:** T005 · **Priority:** 60
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Deliver source-supported extraction review and explicit reversible AI wording improvements through the bounded
runtime.

## Scope (in)

- Own B-C04 original/proposed comparison, reason, fact evidence, edit/accept/reject/undo and stale-base handling.
- Add reviewed AI extraction only where the agreed native import path needs it, preserving T004 confirmation and T001
  limitations.
- Ask for missing facts; keep unknowns unknown instead of inventing employers, qualifications, dates, metrics, tools
  or proficiency.
- Validate typed versioned patches and preserve user work through unavailable/failed/over-limit operations.
- Own A02 factual-fidelity evaluation and repeated-run regressions; consume T005 routing/jobs/usage rather than
  duplicating them.
- Integrate optional semantic writing findings into T004's separate-result panel as reviewable proposals.

## Explicit exclusions

- No silent edits, cross-language propagation, autonomous applications or employer matching.
- No new provider foundation, broad scan/OCR promise or CV-triggered tools.

## Requirement IDs

**Owns:** B-C04, A02.
**Consumes / contributes:** B-C02, B-C03, B-C05, B-C07, B-O02, B-O03, A01, A03, A06, A07, A08, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S11 Review a suggestion: assistant not enabled, assistant unavailable, usage limit reached, accepted, editing
  and stale.
- Consume S07 confirmation and S08/S10/S12 return paths; inspect missing-information questions and failed/partial
  proposal recovery.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/ai.md](../../context/technical/ai.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/security.md](../../context/technical/security.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/resume/editor/proposals/`
- `apps/web/src/features/resume/editor/check/`
- `apps/web/src/features/assistant/`
- `packages/ai/src/`
- `packages/api/src/features/ai/`
- `packages/resume/src/patch.ts`
- `packages/schema/src/resume/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Reuse existing proposal/patch/schema interfaces with target, base revision, previous/proposed text, reason and
  supporting fact IDs; validate semantics as well as shape.
- CV/job text is untrusted: embedded instructions cannot authorize tools or secrets. Exclude contacts/photos/unrelated
  history before approved calls.
- Apply only explicit accepted changes against the current base; reject stale patches, preserve manual edits and make
  undo a real revision operation.
- Extraction confidence is a review signal, not truth. Preserve provenance, year-only precision and ambiguous original
  date/calendar text.
- Use versioned prompts/models/schema and T005 failed-work accounting; no hidden unbounded repair/retry loop.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Test accept/reject/edit/undo, stale races, missing information, unavailable routes, exhausted limits and
  schema/provider recovery.
- Use labelled AR/EN/mixed fixtures for invented metrics/credentials, prompt injection, contradictions and uncertain
  dates; block unsupported claims.
- For optional semantic review run 3-5 identical-input evaluations, recording disagreement, source mapping and
  unsupported claims rather than zero-error promises.
- A02 is the owning gate. A01/A03/A06/A07/A08/A11/A13 remain applicable contributions; corpus success is bounded
  evidence.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D16 overseas OpenRouter direction is decided; A11 route/contract/transfer/consent and model-quality evidence remain required. Never send contact fields; prove payload minimization with synthetic fixtures before real-CV AI.
- D03/D19 gate broader input/OCR scope. Unresolved A02 factual failures block affected release capabilities.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
