# T004 — Deliver the complete native CV workspace

**Task:** T004 · **PR size:** L · **Branch:** `feat/t004-cv-workspace`
**Depends on:** T001, T003 · **Priority:** 40
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Complete import/manual -> confirm -> edit -> save/reopen -> export, with version-bound ATS readiness in the existing
CV workspace.

## Scope (in)

- Own native readable-PDF text extraction and contact separation before optional AI normalization.
  Disable inherited original PDF/attachment-to-model paths at server and UI boundaries; optional AI gets minimized text only.
- Native DOCX input may be deferred if costly; PDF/manual entry remains the launch import path.

- Own B-C02 import/manual confirmation, B-C03 repeatable editing/live preview, B-C05 revisions/restoration/conflicts
  and B-C08 export integration.
- Consume T001 document capabilities and T003 private facts/documents; preserve facts, selected variant and honest
  saved/unsaved state.
- Own B-C07 in S10/S12 and the editor check panel: three separate results for PDF readability, writing and content
  findings, and evidence for a selected job.
- Reuse structured ATS rules, the existing 76-rule ats-pdf engine and PDF.js actual-export deep check. T007 supplies
  job evidence; without a job show not checked.
- Show independent not checked/checking/complete/skipped-partial/stale/failed states and versioned issues with
  blocker/warning/tip, reason, evidence/location and safe fix/review.
- Bind reports to exact downloaded bytes, CV revision, font/template/renderer and checker/extractor options;
  invalidate only affected results.
- Make implicit editor state explicit (audit 2026-11-10, ui-audit/implicit-state.md #1,2,5,8,10,18,21,22,33,34,35,37):
  autosave always sends the expected revision and shows a conflict instead of overwriting another tab/device; browser
  recovery copies carry owner and base revision and need an explicit restore/merge decision; pending imports are
  flow-bound, expiring and claimed atomically; preview, fit, undo and check results are bound to document + revision.
  Prove each with a failing test first.
- Re-run the PDF readability check automatically after editing pauses (debounced, cancellable); show stale while
  pending. Remove the inherited single editor score badge (D22).
- Explain results in plain AR/EN: one sentence per result (e.g. "Can a company's hiring system read your PDF?"),
  a "what this means" explanation per result and issue, and a short first-use intro to the check panel. Never say
  "passes ATS" or imply hiring outcomes; copy comes from the copy deck and needs owner review (A13).

## Explicit exclusions

- No universal ATS score, hiring probability, keyword stuffing, paid parser per action or new ATS/AI foundation.
- No OCR promise, parallel editor, auto-applied fixes or public PDF-check exposure inferred from retained code. DOCX
  stays not available before A05.

## Requirement IDs

**Owns:** B-C02, B-C03, B-C05, B-C07, B-C08, A06.
**Consumes / contributes:** B-C04, B-C06, B-C09, B-O02, A01, A02, A03, A04, A05, A07, A08, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Own S05/S06/S07/S08/S08b/S09/S10/S12/S13/S22/S23. S08b is the mobile preview pane, not another editor app.
- Inspect CV limit reached, reading, unsupported file, English document, tailored copy, new draft, restored, local
  copy, failed and preparing.
- Use Basic information, Add information, Edit experience, Entry editor and Add section; connect suggestion review to
  T006 and selected-job evidence to T007.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

Implement this inventory with existing shared components, the appropriate shared shell/container and T002 type/spacing/radius/control APIs; use AppShell/PageHeader for dashboard pages. Use Figma for elements, icons, content, order, dialogs and states; do not copy pixel geometry or create per-screen styles. Apply the D35 verification record to every changed target.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/ai.md](../../context/technical/ai.md)
- [technical/security.md](../../context/technical/security.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)

## Ownership boundaries

- `apps/web/src/features/resume/editor/`
- `apps/web/src/features/ats-checker/`
- `apps/web/src/dialogs/resume/`
- `apps/web/src/routes/builder/`
- `packages/api/src/features/resume/`
- `packages/api/src/features/documents/`
- `packages/api/src/features/career/`
- `packages/resume/src/ats/`
- `packages/resume/src/ats-pdf/`
- `packages/schema/src/resume/`
- `packages/db/src/schema/resume.ts`
- `packages/pdf/`
- `packages/docx/`
- `packages/import/`
- `migrations/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Consume T003's [career-data mapping](../../context/technical/architecture.md#career-data-mapping).
  CV edits change only that CV; explicit reviewed master updates preserve stable links/revisions and mark variants stale.
- Inspect `apps/web/src/features/resume/import/read-file.ts` and `packages/api/src/features/ai/service.ts`:
  remove/deny direct attachment parsing and DOCX contact leaks before any optional AI path is usable.

- Extend existing stores/services/schema and T001 fixtures. Keep career facts, presentation revisions and job versions
  distinct; restoration is intentional and concurrent saves cannot silently discard edits.
- Analyze the actual download Blob/artifact, not editor DOM or an equivalent re-render. Private cache keys include
  owner/hash/checker/extractor; timeout/truncation never means whole-file completion.
- A blocker requires demonstrated extraction/content failure or a known destination constraint. Layout/writing advice
  alone cannot disable downloads or predict rejection.
- Recognize Arabic/English headings, RTL order, role/date/bullet association, glyph/Unicode loss, digit/calendar
  precision, mixed scripts and bilingual duplication without rewriting facts.
- Minimize contact-bearing optional semantic payloads and use T005/T006 routes/patches. Job changes stale job
  evidence, not an unchanged PDF result. Destination Arabic-parser support is unknown unless verified.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Verify native PDF/manual import with AI disabled; if DOCX is withheld, state it before file selection.
- Inspect model-bound payloads and direct API attempts: no original attachments or contacts; approved minimized text only.
- Verify local CV edits never mutate master/other variants; master updates require explicit acceptance.

- Test real creation/import/confirmation, repeatable sections, save/reload/relogin, history restore and conflict
  recovery against persisted state.
- Assert preview/download identity, exact-byte hashes and CV/template/font versus job-only invalidation; exercise all
  independent result states and retry/manual recovery.
- Test missing evidence, corruption, partial extraction, timeout, stale caches, safe fix preview, accept/reject/undo
  and language/owner isolation.
- A06 is the owning persistence gate. A01/A04/A05 gate document capabilities; A02/A03/A11/A13 gate optional
  semantics/exposure and A07/A08 interaction/access.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D03 still requires supported-input/template evidence. D04 is PDF-only launch; Word unavailable. D18 requires server-side AI/CV-count enforcement with PDF never paywalled; use server-owned quotas, not renderer/button blocking.
- D22 is a working approach, not qualification. D23 is authenticated owner-scoped /pdf-checks only at launch; no public exposure. Test authorization and response/artifact ownership under A08/A11/A13.
- T007 arrives later: selected-job evidence stays honestly not checked until supplied, with no fake successful
  placeholder.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.
