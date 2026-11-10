# T008 — Deliver retained personal career tools

**Task:** T008 · **PR size:** L · **Branch:** `feat/t008-personal-career-tools`
**Depends on:** T007, T013 · **Priority:** 135
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Qualify retained cover letters and personal tracking independently, or explicitly withhold either tool.
S32-S34 are post-beta; a withheld disposition retains source and denies unavailable entry points.

## Scope (in)

- S32-S34 are post-beta. Either tool may finish this task with an explicit withheld disposition
  if adaptation is substantial: retain source, hide/deny entry points and record why and what remains.

- If enabled, deliver B-C10 fact-based, job-specific cover letters with review, editing and truthful persistence.
- If enabled, deliver B-C13 one-person application board/details and selected CV-version association, retaining suitable upstream
  implementations.
- Use shared AI execution for optional generation and existing document/data services for editing and storage.
- Record explicit enabled/withheld availability and limits for each retained tool; source retention alone is not
  release approval.
- Preserve independent language content/manual edits across retry, reopen and interface switching.

## Explicit exclusions

- No employer board, company roles, applicant ranking or employer submission snapshots.
- No new B-C14 interviews, B-C15 human-review service, B-C16 public profile or autonomous applications; T013 owns
  deferred disposition.

## Requirement IDs

**Owns:** B-C10, B-C13.
**Consumes / contributes:** B-C04, B-C05, B-C06, B-C09, B-O02, A02, A03, A06, A07, A08, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S32 Cover letter including short, S33 Applications and S34 Application details.
- Use New application/Application dialogs and sheets; inspect empty/invalid/unsaved/unavailable generation and
  failed-save recovery.
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
- [technical/ai.md](../../context/technical/ai.md)
- [technical/security.md](../../context/technical/security.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/letters/`
- `apps/web/src/features/applications/`
- `apps/web/src/dialogs/`
- `packages/api/src/features/cover-letters/`
- `packages/api/src/features/applications/`
- `packages/resume/src/cover-letter.ts`
- `packages/schema/src/cover-letter/`
- `packages/schema/src/applications/`
- `packages/db/src/schema/cover-letter.ts`
- `packages/db/src/schema/applications.ts`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Inspect existing Reactive Resume tools before writing new implementations. Preserve compatible records/schema
  validation.
- A tracker is a personal log: linking a CV does not assert real external submission or acknowledgement.
- Generation may reorganize supported facts but cannot invent achievements, employer contacts or application outcomes;
  require reviewed acceptance.
- Use T005 jobs/usage and T007 job/language evidence; isolate record ownership and exact selected versions.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- For each tool, either qualify enabled behavior below or verify the withheld UI/API boundary.
  Explicit withholding satisfies T008 completion and does not block the core beta; no fabricated implementation evidence.

- Test create/review/edit/save/reopen and short/normal cover letters, unsupported claims and stale generation versus
  manual edits.
- Test application create/update/detail/delete, real counts, CV references, validation and failed-save recovery
  against persisted state.
- For enabled tools, test owner/language isolation, locale switches, unavailable/over-limit generation and truthful completion.
- Apply A02/A03/A06/A07/A08/A11/A13 to enabled tools; retaining files is not acceptance.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D17/T12 retained-feature release needs explicit quality/privacy/support decisions; D16/A11 blocks unapproved real-CV
  generation.
- D12 defers human review/public visibility and D01 excludes employer recruitment.

## Done definition

- An explicit enabled/withheld disposition for each tool is sufficient; the behavior tests below apply only to enabled tools.

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
