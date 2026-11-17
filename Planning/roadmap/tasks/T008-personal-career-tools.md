# T008 — Deliver retained personal career tools

**Task:** T008 · **PR size:** L · **Branch:** `feat/t008-personal-career-tools`
**Depends on:** T007 · **Priority:** 74
**Status:** Planning started, 2026-11-16, per D39 (Sayed). No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the completion authority. D39 explicitly authorizes the T008 tick during this continuation.
**Release order:** Build before T012/T013 per D39; S32-S34 stay post-beta and T013 decides beta availability.
No deployment work or paid inference is authorized by this planning task.

## Goal

Deliver both retained tools completely. Enable local, development, and test use.
One owner-controlled production visibility setting defaults off. T013 decides beta availability for S32-S34.

## Scope (in)

- D39 requires both tools. A withheld disposition does not satisfy implementation scope.

- Deliver B-C10 fact-based, job-specific cover letters with review, editing and truthful persistence.
- Deliver B-C13 one-person application board/details and selected CV-version association, retaining suitable upstream
  implementations.
- Use shared AI execution for optional generation and existing document/data services for editing and storage.
- Record enabled local/dev/test availability and the owner-controlled production release boundary.
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

- Qualify both tools through the behavior below. Keep production visibility off until owner approval.

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

## Letter localization follow-up, 2026-11-16

- B-C10 / S32: [desktop 38:3184](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3184), [mobile 49:1971](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=49-1971). This copy fix follows explicit owner feedback. Live Figma frames were not inspected.
- D36 reason: remove the redundant application heading and retain its localized accessible name. Use Recipient and Sender headings because isolated prepositions obscure their meaning in Arabic.
- The copy action already used a Lingui macro but lacked an Arabic catalog entry. The guard now scans toast text and conditional action labels for raw strings and missing translations. The web-wide scan found no other untranslated toast actions.
- Fast validation passed: 11 targeted unit tests, changed-file formatting/lint, and ar-SA/en-US extraction/compilation. Headless Chromium confirmed the Arabic control at 1440 and 390 and the copy action at 1440. The recovery screenshot invokes the real toast helper with a synthetic submitted-document error.
- Visual evidence: `/tmp/letter-ar-desktop.png`, `/tmp/letter-ar-toast-desktop.png`, `/tmp/letter-ar-mobile.png`. No release gate changes.

## Benchmark route evidence, 2026-11-17

Owner Sayed applies the provisional D39 writer decision through `packages/api/src/features/ai/writer-config.json` and the shared resolver. The local approved bundle changes its configuration revision. Existing synthetic fixtures already approve Terra medium and Luna low. No call-site override or production manifest is added. T006 model/effort choices stay unchanged. Interview-prep receives configuration only, with no new handler or product availability.

Requirements: B-C03, B-C06, B-C09, B-C10 and deferred B-C14. This change affects backend route configuration only. No Figma frame or visual behavior changes.
The measurements use all 108 recorded sessions per selected task variant, across Arabic, English and mixed input. The source is the final decision document in the sibling archive, under `ui-audit/benchmark-decision-tasks-v1-final.md`. Its results also exist in the Drive package. Use the original full results and the translation/cover-letter continuation records. Deduplicate by call key. Writer `generationUsage.outputTokens` includes reasoning, so subtract `reasoningTokens` for visible output. Do not use aggregate writer-plus-verifier `outputTokens`.

| Task           | Maximum visible | Maximum reasoning | Maximum completion | maxOutputTokens | Completion allowance |
| -------------- | --------------: | ----------------: | -----------------: | --------------: | -------------------: |
| summary        |             424 |               359 |                751 |             768 |                 1536 |
| job-evidence   |             253 |               124 |                360 |             512 |                 1024 |
| tailoring      |             271 |               539 |                777 |             512 |                 1024 |
| translation    |             603 |               186 |                751 |             768 |                  960 |
| cover-letter   |            1132 |              1417 |               2025 |            1536 |                 3072 |
| interview-prep |            1216 |               377 |               1430 |            1536 |                 3072 |
| verifier       |           15706 |             11996 |              16384 |           16384 |                20480 |

Writer limits use `ceil(max(maxVisible, maxCompletion * visibleFraction) * 1.25 / 256) * 256`. The visible fraction is 0.5 for medium and 0.8 for low. This adds at least 25% to both measured visible and total completion lengths. The resolver never exceeds the approved writer ceiling.

Verifier measurements use 867 individual raw DeepSeek responses associated with the selected writers, including recorded retries and votes. Do not use combined verifier usage across votes. Its maximum visible response needs 19633 tokens for a full 25% margin. The policy ceiling is 16384 visible tokens. The selected ceiling permits 20480 completion tokens, which gives 25% above the measured completion maximum. Visible headroom remains limited to 4.3%. No policy ceiling changes or truncation fallback are added. Production verifier protocol/retry behavior remains unchanged.
Validation: 131 focused tests pass: 103 API policy/adapter tests, 19 local configuration/BYOK tests and 9 fake-transport dispatch tests. Changed-file formatting/lint, workspace typechecks and package boundaries pass. The roadmap checker reports 0 errors. The loopback integration test fails with `listen EPERM` because the sandbox blocks local listening.
The wider AI run reports 499 passed, 96 skipped, seven failed suites without disposable database credentials, and one unrelated failure. That failure is `review-validation.test.ts`: `allows real rewording while preserving facts: Built Node.js services using C# and AWS.`, with `AI_LOST_FACT`. The affected hard-facts implementation contains pre-existing edits outside this change.
`pnpm validate:static` fails at formatting in pre-existing modified files: `Planning/roadmap/tasks.md`, `tooling/evaluations/review/guard-controls-tasks-v1.json` and `tooling/evaluations/review/tasks-study.json`. Separate lint finds 17 unrelated design-token/allowlist issues in document thumbnails and letter controls. Separate knip finds five unused files, ten unused exports and four unused types in benchmark tooling. These files remain untouched. No paid/live inference, environment-file reads or browser/visual tests ran. A11 and production approvals remain open.

## Open approvals/blockers affecting the task

- D17/T12 retained-feature release needs explicit quality/privacy/support decisions; D16/A11 blocks unapproved real-CV
  generation.
- D12 defers human review/public visibility and D01 excludes employer recruitment.

## Done definition

- Both tools are implemented and enabled locally, in development, and in tests.

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- D39 authorizes the T008 graph tick and Mermaid class now, without a feature commit or staging.
  Preserve all 16 large PRs. The tick does not authorize production release.
