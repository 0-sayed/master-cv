# T001 — Prove and harden Arabic document compatibility

**Task:** T001 · **PR size:** L · **Branch:** `feat/t001-arabic-document-engine`
**Depends on:** T000 · **Priority:** 10
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

Reproducible evidence that the selected document engine can support a bounded Arabic/English launch set, plus focused
fixes and regression fixtures, rather than another source-only suitability opinion.

## Scope (in)

- Run the real importer and PDF/DOCX packages on synthetic CVs with renderer/template/font/extractor versions pinned;
  verify the actual checked-out source baseline.
- Reproduce import-alias/digit and export-ordering defects before patching existing packages; preserve field values
  and saved-schema compatibility without visual-order string reversal.
- Cover native PDF/DOCX, Arabic/English/mixed content, headings, digits, punctuation, contacts/URLs, precise/ambiguous
  dates, long names, diacritics and multipage output. Unsupported scans/corrupt files need clear manual recovery.
- Own A01/A04/A05 document qualification, including the D22 A04 ATS extraction extension. Publish
  supported-input/template/font/format limits and artifacts for T004/T007.
- Compare actual generated PDF appearance and critical extraction. Retain DOCX code and validate affected shared packages; actual Word viewer qualification is future A05 reconsideration, not a PDF-launch prerequisite.

## Explicit exclusions

- No full editor UI, AI-provider selection, RAG, paid OCR, new rendering service or framework replacement.
- No universal/named-ATS certification. Launch is PDF only; Word unavailable. Future A05 targets Microsoft 365 Word Windows/Mac plus Google Docs with single-column/default-font templates.

## Requirement IDs

**Owns:** A01, A04, A05.
**Consumes / contributes:** B-C02, B-C07, B-C08, B-C09, A07, A08, A11, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- Consume S06 unsupported file/reading, S09 Design, S10 Review overview, S12 Export failed/preparing and S13 Export
  ready for document-related browser evidence.
- Inspect adjacent export/recovery states. T004 owns those screens; this task owns document engines and qualification,
  not screen implementation.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

## Source references

- [business/requirements.md](../../context/business/requirements.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/ai.md](../../context/technical/ai.md)
- [technical/security.md](../../context/technical/security.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)
- [decisions.md](../../context/decisions.md)

## Ownership boundaries

- `packages/import/`
- `packages/pdf/`
- `packages/docx/`
- `packages/resume/src/ats/`
- `packages/resume/src/ats-pdf/`
- `packages/schema/`
- `packages/fonts/`
- `apps/web/src/features/resume/editor/check/`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Reuse the existing Reactive Resume importer/normalizer, PDF/Forme and DOCX path. Coordinate schema/package-export
  changes before consumers adopt them; do not redesign profile persistence.
- Begin with 12 synthetic smoke cases, then a 50-case labelled pilot: 20 Arabic, 15 English, 15 mixed. Use bilingual
  human-reviewed gold records including native Arabic review and held-out cases.
- Test every default release template/font across applicable languages using pinned PDF.js plus independent pinned
  Poppler pdftotext in CI; record options and adjudicate disagreements against gold/visual output.
- Cover RTL reading order, role/date/section associations, missing glyphs/Unicode, columns/tables, Latin and
  Arabic-Indic digits, Hijri/Gregorian/ambiguous dates, bilingual duplication, mixed-script skills and
  broken/adversarial files.
- Require 100% included critical-field preservation and correct associations in applicable release cases, intelligible
  order and zero unresolved critical loss/clipping/corruption; report exact/normalized field precision/recall and
  character/word/order errors.
- Measure per-rule false/true findings, severity and precision/recall by language/template/engine; require zero known
  false blocker/high-severity findings in the pilot. Downgrade weak rules; engine agreement alone is insufficient.
- Keep smoke checks in normal CI and rerun the held-out matrix after renderer/font/template/extractor/rule changes.
  Measure page-adjusted latency, memory, retries/timeouts and duplicate-call cost against agreed limits.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- Imports preserve names, dates, employers and numerical claims or flag uncertainty; scan/corrupt/unsupported cases
  recover clearly without implicit OCR.
- Actual exported bytes match selected confirmed facts and preserve headings, links, direction, role/date associations
  and page breaks in visual and both extraction-engine checks.
- Preserve existing regression assertions. Publish reproducible artifacts, corpus labels, pinned options and a dated
  compatibility record with measured limitations.
- DOCX structure/artifacts and actual agreed Word version results are separate evidence; missing Word access leaves
  A05 pending, not passed or silently removed.
- A01/A04/A05 are owning gates and remain unpassed until evidence exists; blocking PDF/factual defects keep acceptance
  unresolved unless supported scope is explicitly revised.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- D04 launches PDF only; Word stays unavailable. If reconsidered, A05 covers Microsoft 365 Word Windows/Mac plus Google Docs, single-column templates/default fonts. D03/D19 input/OCR scope and font/template licenses still need evidence.
- D22 specifies ATS checks, not completed qualification. D23 requires authenticated owner-scoped POST /pdf-checks only at launch; a later browser-only free checker needs a separate decision.
- A11 real-CV processing and A13 availability decisions remain independent; synthetic evidence cannot approve every
  retained format/template.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.

## Execution record

Recovered from the surviving T001 fragment and updated for the current v0.8 design baseline and D22/D23. No runtime
tests, branch, PR or release activation are asserted by this brief.
