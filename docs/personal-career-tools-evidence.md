# Personal career tools

T008 tool implementation is complete. Final validation is in progress. No release or deployment approval applies.
Sayed selected the recommended defaults on 2026-11-16 through the unattended execution instruction.
Interview preparation remains a benchmark category only. B-C14 product delivery remains deferred.
The owner runs paid inference separately after preparation. This execution runs no paid benchmark.

## Requirements and disposition

Cover letters consume B-C10, B-C04, B-C05, B-C06, B-C09, B-O02, A02, A03, A06, A07, A11, and A13.
Applications consume B-C13, B-C05, B-C06, B-C09, B-O02, A06, and A08.
Both tools are enabled in local, development, and test environments under D39.
The source policy currently marks adaptation as enabled and keeps `releaseApproved: false` for both tools.
One production setting, PERSONAL_CAREER_TOOLS_RELEASE_APPROVED, defaults to false. Sayed controls beta visibility. T013 remains a release-order decision.
No employer service, public sharing, BYOK, calendar sync, external application submission, or interview generation is approved.
Saved facts and private records remain owner scoped. Internal account export and deletion retain their existing access.

## Retained entry points

Cover letters use the existing library and `/builder/letter/$coverLetterId` editor.
Applications use `/dashboard/applications` and its existing detail route.
The production release gate covers every letter procedure and all application CRUD and AI procedures.
The server also gates letter mutations through the shared document library.
The document library hides unavailable letters and excludes them from visible counts.
The shell hides unavailable applications and disables their query.
Direct and legacy routes redirect before tool queries. Letter WebMCP registers no unavailable tool.
When the release gate is closed, the new-document dialog hides letter creation and its callback rejects creation.

## Design inventory

The source file is [Master CV](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni).
The complete mapped S32–S34 inventory is in the external evidence folder as `screen-inventory.json`.
S32 masters: desktop `38:3184`, mobile `49:1971`. Short states: `258:34135`, `259:31594`.
S33 masters: desktop `38:3321`, mobile `49:2018`. Added and moved states remain in the inventory.
S34 masters: desktop `38:3466`, mobile `49:2096`. Record variants remain in the inventory.
Application dialog and sheet: `80:28985`, `80:29052`.
New-application dialog and sheet: `259:21867`, `259:39576`.
Mapped masters and states were rendered. D36 dispositions appear below. No owner visual approval is claimed.

## Verification

The runner foundation passes 65 tests across 11 suites.
The server availability policy passes its unit tests. Direct procedure denial passes 46 tests.
The affected shell, document-creation, and letter automation tests pass 28 tests.
Focused browser evidence, D36 deviations, and benchmark preparation appear below. Final suite results remain pending.

## Implementation evidence, 2026-11-16

B-C10 uses the shared AI executor and the fact-based letter contract. Generated text requires explicit acceptance before persistence.
Manual text survives failed decisions, retries, reopening, and interface language changes. New Arabic and English letters remain separate documents.
B-C13 retains the existing application service, board, and details sheet. Each application can select an owned CV version.
Recorded CV versions remain stable after later CV edits. Deleting a recorded version never invents replacement history.
Public application updates require the last observed timestamp. Stale writes fail without changing saved data.
Interview preparation remains benchmark-only. No new interview feature or deployment work applies.

The runtime failure came from missing forced RLS and restricted grants on the new proposal-decision table.
The corrective migration forces RLS and grants only SELECT and INSERT. Append-only permission tests cover table and column privileges.
The server log records completed migrations and a clean start. GET /api/auth/get-session returns 200 on port 3030.

### D36 deviations

- S32 uses the retained document editor and explicit proposal review because users must approve generated changes before saving.
- S32 uses a shared length selector because it groups generation controls with consent and source selection.
- S33 retains six established application stages because saved records already use those stages.
- S33 retains the responsive list and board views because shared controls support narrow screens and keyboard access.
- S34 uses the retained details sheet because it preserves board context and supports direct reopening through the URL.
- S33/S34 add an explicit CV-version selector because a latest-CV label cannot prove the version used for an application.

### Functional and visual evidence

Focused browser tests pass: letter review 2, language persistence 1, application tracking/version selection 2, release visibility 2, and responsive layout 4.
Responsive evidence covers Arabic and English at 1440 and 390 pixels. Tests assert fonts, direction, saved content, and page overflow.
Evidence resides in /mnt/storage/master-cv-design-archive/ui-audit/t008-evidence/.
The changed-source detector returns no findings. Live detection on port 3030 fails with a 30000 ms navigation timeout.
A clean HTTP response does not prove a clean detector scan. The live detector remains an open validation failure.
Mapped Figma masters and recovery states were rendered into the evidence folder. The implementation uses shared controls and T002 tokens.
Final static validation passes. The final unit and GitHub results follow after their runs finish.

### Deep validation findings

The first full GitHub run is https://github.com/0-sayed/master-cv/actions/runs/43832665643.
Its failures exposed missing privacy inventory entries, stale test fixtures, and a changed approved letter label.
The fixes retain the failing assertions. The privacy owner-graph fixture includes decisions and proves that retry keys stay out of exports.
Local API units pass 139 suites and 1198 tests after these fixes.
Exact weighted partitions 3, 4, 5, 7, 8, and 9 were reproduced locally before the next snapshot push.
The authenticated detector spec also fails explicitly. The separate design configuration preserves the existing detector execution pattern.
The test proxy forwards only GET/HEAD to its fixed local target with a synthetic session. Four proxy boundary tests pass.
No paid benchmark, release deployment, feature commit, or real-index staging applies.
T008 completion bookkeeping remains pending the first shipped PR under AGENTS.md.

The application dialog renders were inspected at nodes 80:28985, 80:29052, 259:21867, and 259:39576.
D36: The shared application form records the selected stage date because the retained board supports all six stages.
D36: The shared form retains explicit Cancel and Save controls because keyboard and touch users need the same actions.
The restored manual-writing label uses the approved Arabic translation. Locale and proxy tests pass 9 cases.
Local partition 8 passes all 64 tests, including the four AR/EN layout cases. Partitions 5 and 7 pass their applicable tests.

Partitions 4, 7, and 8 pass 78, 58, and 64 tests respectively. Partition 5 passes 53 tests with one unchanged conditional skip.
Partition 3 exposed the approved manual-writing label regression. Partition 9 exposed a missing revision timestamp in its API fixture.
After both fixes, the affected navigation and job-saving specifications pass all six tests with one worker and zero retries.

### Inline implementation review

The review covers the five Review Focus items in the implementation plan. No subagent or independent reviewer ran.
Letter proposal tests cover stale revisions, retries, acceptance, rejection, ownership, and hostile job context.
Application tests cover foreign CV versions, immutable recorded history, deletion, and stale update conflicts.
Browser tests cover independent letter languages, manual edits, reopened reviews, selected versions, and disabled production routes.
Benchmark tests cover source seals, one Arabic approval, stale smoke receipts, budget stops, and offline transport guards.
The shared source policy denies hidden API and navigation entry points. One production flag controls both retained tools.
The remaining evidence gap is the failed live detector. The GitHub rerun result is recorded separately after completion.

### Final validation result

Snapshot `7feef3a233daef92cc440bfe3265044de98b0bd1` passes all 19 jobs in [the full GitHub run](https://github.com/0-sayed/master-cv/actions/runs/43836230153).
All ten browser jobs report no flaky tests. The throwaway `ci/try-t008` branch was deleted after completion.
Local static validation passes. The roadmap checker reports zero errors. The six affected navigation and job-saving tests pass without retries.
Local `pnpm test:ci` fails with exit 134 after the tooling process reports `malloc(): mismatching next->prev_size (unsorted)`.
Fifteen tasks pass before the native allocator abort. The API task passes 139 suites and 1198 tests.
The GitHub tooling jobs pass, but they do not replace the failed local command result.
Implementation stops at this toolchain failure under the owner instruction. No package, catalog, or toolchain change attempts a repair.
The live Impeccable detector remains failed because its navigation times out. Responsive screenshots remain separate evidence.
The demo session endpoint returns HTTP 200. Both tools remain enabled locally, with production release approval off.
No feature commit, real-index staging, paid inference, deployment, or demo-server restart occurred.
Tasks 1-6 and 8 are complete. Tasks 7 and 9 retain the detector and local unit failures.
Task 10 records these results. Completion bookkeeping remains pending the first shipped PR.

## Owner audit continuation, 2026-11-16

Both independent benchmark audits were read in full. The [disposition table](personal-career-benchmark-history.md#2026-11-16-benchmark-audit-dispositions) records every finding and its resolution.
D39 now requires PROVISIONAL selection, 12 holdouts per language/category, zero critical failures, and an explicit smoke checkpoint.
The benchmark contains no new interview product feature. Both career tools remain enabled locally, in development, and in tests.
Production visibility remains one owner-controlled setting, default off. No deployment or paid inference runs here.
The measured projection is $0.88 OpenRouter/$0.56 OpenAI for smoke, and $15.85/$27.91 cumulatively with full.
The current projection exceeds the $12/$5 cumulative caps. Full stays blocked pending a completed smoke forecast that fits.
The [owner runbook](personal-career-benchmark.md) contains the exact approval, smoke, checkpoint, full, and recovery commands.
The live session endpoint returns HTTP 200. The Impeccable live detector fails with `Navigation timeout of 30000 ms exceeded`.
The detector engine starts, but it cannot complete navigation. This remains a failed visual validation, not a clean scan.
The owner explicitly authorizes the T008 roadmap tick in this continuation. The tick does not authorize production release.
Final audit checks and the new D38 GitHub run are recorded below after completion.

The final report also removes the retired Wilson qualification text for tasks-v1. The legacy study keeps its existing policy.
The first audit snapshot run was cancelled during execution so that final CI uses the corrected report and final seal.

## T008 Task 7: Impeccable refinement, 2026-11-16

Owner clarification, 2026-11-16: `impeccable detect --cdp 9333` is authorized only for this job's own headless Chromium with a temporary profile; never use port 9222, automatic connection, or an existing personal browser.
The attached-browser results below are valid under that clarification. The URL-only timeout does not invalidate them.
The critique and polish use one agent and one context. The owner explicitly forbids subagents.
The review uses the Impeccable critique, polish, craft-floor, and operate references.
The initial critique found a broken creation action, an untranslated stage selector, and undersized helper text.
The remaining visual findings require the dispositions below, rather than a new visual theme.

### Scope and design references

The scope covers the letter list, editor, independent Arabic/English documents, consent, proposal review, application board, details, creation, and editing.
Interface languages are ar-SA and en-US. Viewports are 1440 and 390 pixels wide.
Requirements remain B-C10, B-C13, B-C04–B-C06, B-C09, and B-O02, with the existing approval gates above.
No production gate changes apply.
The current Figma file is `K3UTevGCFBhsoSLXH7BDni`.
This pass reads the S32 desktop master `38:3184` and these mapped renders:
`49:1971`, `258:34135`, `259:31594`, `38:3321`, `49:2018`, `38:3466`, `49:2096`,
`80:28985`, `80:29052`, `259:21867`, and `259:39576`.
The existing screen inventory retains the adjacent recovery-state mappings. This pass does not claim a fresh render of every mapped recovery frame.

### Changes and D36 notes

- `documents-page.tsx`: The populated letter collection creates a letter through the existing shared creation hook.
  D36: New follows the selected letter collection because opening CV creation prevents the intended task.
- `application-form-sheet.tsx`: Stage options use the shared translated labels. Helper text uses the shared `type-metadata` role.
  These fixes preserve the existing T002 tokens, shared controls, approved copy, and layout.
- `section-card.tsx` adds the shared `SectionCardTitle` with the existing `type-section` role.
  `letters/review.tsx` uses it for the original, proposal, and evidence headings.
  The initial proposal scans demonstrate the flat hierarchy. The repeated scans test the correction.
  D36: Shared section headings separate authored text, proposed text, and supporting evidence during approval.
- The affected unit tests cover populated collection creation, Arabic stage labels, and proposal decisions.
- The layout browser test covers both document languages, the edit sheet, and creation from the populated collection.
- The detector browser test launches its own temporary Chromium on port 9333 and refuses an occupied port.
  It scans through CDP, preserves the security guard, and closes its browser in `finally`.
  It removes the inherited executable override only from the detector subprocess to prevent launcher recursion.

### Live detector findings

Counts below refer to completed scans on `http://localhost:3030`. Values separated by `/` refer to 1440/390 widths.
The screenshots and complete detector JSON are outside the repository in `ui-audit/t008-evidence/impeccable/` within the design archive.
The first scans use `before-` names. The repeated scans use `after-` names.

| Screen                                     | Arabic before → after | English before → after |
| ------------------------------------------ | --------------------- | ---------------------- |
| Letter list                                | 2/2 → 2/2             | 2/2 → 2/2              |
| Letter editor and creation/review composer | 2/3 → 2/3             | 1/1 → 1/1              |
| Application board, with mobile list        | 4/2 → 4/2             | 4/2 → 4/2              |
| Application details                        | 3/3 → 3/3             | 2/2 → 2/2              |
| Save-job form                              | 3/3 → 3/3             | 2/2 → 2/2              |
| Edit-application form                      | 2/2 → 1/1             | 2/2 → 1/1              |

The second document language also has four completed after scans. Its findings match the editor row for each interface language.
The real server shows the provider-disabled recovery state. This pass sends no live AI request.
Synthetic runtime tests cover consent and proposals separately, with deterministic local responses and synthetic CV facts.

### Remaining findings and disposition

- `cream-palette`: The Desk & Paper palette is an explicit D35/T002 design choice. Replacing it violates the shared visual source.
- `content-hidden-at-rest`: The flagged text belongs to inactive TanStack developer panels, including “Plugins”. Product text remains visible.
- `nested-cards`: The board places draggable application cards inside stage dropzones. Both layers communicate separate interactions.
- `edge-flush-cards`: The first stage aligns with the dashboard content edge inside its outer gutter. Its radius remains visible.
  Horizontal scrolling exposes the remaining stages. A second inset breaks the shared header/body alignment.
- `cramped-padding`: Arabic glyph bounds trigger the heuristic in shared controls. Rendered text remains readable without clipping.
  The shared controls retain their semantic sizes and touch targets. Local padding or height overrides do not apply.

The tiny-text finding is fixed in all four edit-form scans. Source detection on the four changed production components reports zero findings.
No new detector ignore rule, arbitrary visual token, or call-site control-size override applies.

### Verification

The three affected unit suites pass 16 tests. The four layout cases pass with one worker and zero retries.
The existing language-persistence, application-tracking, selected-version, and proposal accept/reject specifications pass five tests.
The first layout attempt fails because the new assertion uses a unit-test matcher. The corrected Playwright matcher passes all four cases.
Formatting and lint pass on the eight changed code/test files.
The first automated CDP attempt fails from launcher recursion. The replacement passes one test with 28 completed scans.
The first consent/proposal test passes eight completed scans and exposes the English proposal heading issue.
Its four consent scans report 3/3 Arabic and 1/1 English findings. Its proposal scans initially report 3/3 Arabic and 2/2 English findings.
The manual CDP matrix completes 24 before scans and 28 after scans on the unchanged demo server.

The full CI run 43847075117 completes all browser partitions and non-tooling units. Three tooling shards expose fixture/scoping regressions, now fixed through focused tests.
One browser test passes only on retry. The testing backlog records it. Targeted GitHub rechecks use explicit workflow inputs and distinct summary names.

The final consent/proposal test passes all eight scans with one worker and zero retries.
Proposal findings change from 3/3 to 3/3 in Arabic and from 2/2 to 1/1 in English.
The English flat-type-hierarchy finding is gone. The remaining findings match the dispositions above.
The consent counts remain 3/3 Arabic and 1/1 English. These states have no before scan on the provider-disabled demo server.
The independent proposal tests preserve the manual letter before acceptance. No real provider request runs.
The final runtime screenshots and the 28-screen contact sheet show both directions, readable labels, and contained dialogs.
The proposal contact sheet shows the new shared headings and reachable decision controls at both widths.
There are nine passing functional browser tests and two passing detector tests across the focused runs.
All local browser runs use one worker and zero retries. Detector exits of 2 retain their findings and dispositions.
The first layout matcher failure and detector-launcher failure remain in the external logs.
The detector browsers close after each run. The existing server on 3030 remains running.
No staging, commit, paid inference, deployment, or edit to the prohibited planning/benchmark paths occurs in this continuation.

## Final audit recovery validation

The current sealed study is `tasks-v1-personal-career-ec083b755ea0`.
The free campaign completes 54 smoke sessions, 72 judge probes, and 1944 full sessions.
All scripted writer and verifier pairs pass. The campaign spends $0 and provides no live model qualification.
The current forecast is $0.8843 OpenRouter and $0.5562 OpenAI for smoke.
The full phase adds $14.9656 OpenRouter and $27.3536 OpenAI.
The cumulative forecast exceeds the $12 OpenRouter and $5 OpenAI caps, so paid full execution remains blocked.

Static validation passes after obsolete typography exemptions and two type/accessibility errors are corrected.
Focused benchmark recovery tests pass 1085 cases. The final binding checks pass after the test uses the plan's `writers` interface.
The changed letter-library and application-form tests pass.
The roadmap checker reports zero errors. T008 is ticked under the explicit owner instruction.
Both tools stay enabled in local/dev/test. Production visibility stays off until owner approval.

The direct URL detector starts its engine but fails with `Navigation timeout of 30000 ms exceeded`.
The later attached-browser scans count under the explicit owner clarification above.
The design test uses the job's own headless Chromium on port 9333 with a temporary profile and occupied-port refusal.
This method scans the current screen and its open dialogs without waiting for Vite network activity to stop.
No empty URL-only detector output counts as a successful scan. The completed attached-browser scans govern Task 7.
The existing server on port 3030 returns HTTP 200 for its session endpoint and stays running.

### Final GitHub results

The completed [full run](https://github.com/0-sayed/master-cv/actions/runs/43847075117) passes all ten browser partitions and the other unit workspaces.
Three tooling partitions fail in that run. The corrected [tooling recheck](https://github.com/0-sayed/master-cv/actions/runs/43852883587) passes all four partitions.
The exact [browser partition recheck](https://github.com/0-sayed/master-cv/actions/runs/43851127606) passes 97 tests without retries.
The original full run includes one retry-only report-deletion test. Its cause remains open in the testing backlog.
The recheck records deletion complete after one attempt, without a failure code.
No local full unit suite or browser partition runs during this recovery.

The final free campaign is `campaign-20261116T105142Z-replay` in the external benchmark archive.
Its acceptance record is `ui-audit/t008-evidence/audit-offline-acceptance-final.json` in the design archive.
The final preflight and dry run are `campaign-20261116T105116Z-dry-run` in the benchmark archive.
The changed UI tests pass 13 cases. The final CLI and budget tests pass 36 cases. The dispatch tests pass 20 cases.
Startup now rejects invalid credentials before the offline request matrix. The regression preserves the original test timeout.
The reservation tests retain five attempts and assert the exact frozen bound. The forecast does not count those attempts twice.
Arabic approval, live judge qualification, the full-run budget, and the original browser flake remain open.

## Authorized detector rerun, 2026-11-16

Task 7 is complete. The owner clarification restores the earlier attached-browser evidence on port 3030.
The fresh rerun completes 36 scans on the isolated application at `http://localhost:3036`, with Arabic/English interfaces at 1440/390.
The normal server covers 28 screens and forms. The deterministic AI test server covers eight consent/proposal states without provider calls.
Creation uses the shared letter editor. Four additional scans cover its independent English document.
Both targeted tests pass with one worker and zero retries. The first consent attempt used the normal, processing-disabled server and failed before scanning.
Only that failed test repeats against the existing deterministic runtime. The original assertions and timeouts remain intact.

The existing 32 comparable scans contain 73 before findings. The fresh scans contain 48 findings for those same screen combinations.
The four additional English-document scans contain six findings, for 54 findings across all 36 completed scans.
These observations span the Vite demo and compiled synthetic server. Lower counts do not establish further product fixes in this correction.
The recorded earlier refinements and their before/after results remain valid.

| Screen                              | Arabic before → latest | English before → latest |
| ----------------------------------- | ---------------------- | ----------------------- |
| Letter list                         | 2/2 → 1/1              | 2/2 → 1/1               |
| Letter editor and creation composer | 2/3 → 2/2              | 1/1 → 1/1               |
| Application board and mobile list   | 4/2 → 3/1              | 4/2 → 3/1               |
| Application details                 | 3/3 → 1/1              | 2/2 → 1/1               |
| Save-job form                       | 3/3 → 2/2              | 2/2 → 1/1               |
| Edit-application form               | 2/2 → 1/1              | 2/2 → 1/1               |
| Review consent                      | 3/3 → 3/3              | 1/1 → 1/1               |
| Proposal review                     | 3/3 → 3/3              | 2/2 → 1/1               |

The remaining rules are `cream-palette`, `cramped-padding`, `nested-cards`, and `edge-flush-cards`.
Their dispositions remain the approved shared palette, readable Arabic control bounds, distinct draggable cards and stage dropzones, and shared shell alignment.
The compiled server emits no `content-hidden-at-rest` finding. The earlier Vite finding refers to inactive developer panels.
No detector ignore, token override, product change, or benchmark edit applies in this correction.

The external evidence is in `ui-audit/t008-evidence/impeccable/authorized-rerun/` within the design archive.
`scan-summary.json` records every comparison and rule count. Each scan also retains its JSON, stderr, and screenshot.
The job closes both temporary headless browsers and removes their profiles. Port 9333 has no listener after completion.
The existing demo on port 3030 remains running and its session endpoint returns HTTP 200.

## Platform back navigation, 2026-11-16

Scope: B-C13 and B-O02, with the existing S33/S34 references above and the platform UX checklist.
This pass uses the implemented shared components as the D35/D36 layout reference. It does not claim a new Figma inspection or approval.
The application detail link applied a rotation on top of the shared icon's RTL reflection. These transforms reversed the intended Arabic arrow.

The inventory contains 24 back-control declarations across 18 web source files. The editor declaration serves both resume and letter headers.
The UI package contained no independent back control. Its shared `Icon` already owns directional reflection.

| Source under `apps/web/src/`                                   | Controls | Context and selected pattern                                                                                                    |
| -------------------------------------------------------------- | -------: | ------------------------------------------------------------------------------------------------------------------------------- |
| `features/applications/components/application-detail-page.tsx` |        2 | Detail header and unavailable-record recovery: visible parent links to applications.                                            |
| `features/career/workspace/shell.tsx`                          |        4 | Workspace header and recovery link to applications; two saved-version states link to the current tab without its version query. |
| `features/documents/trash-page.tsx`                            |        1 | Collection header: visible parent link to documents.                                                                            |
| `features/career/job-target-page.tsx`                          |        1 | Job-target header: visible parent link to documents.                                                                            |
| `features/resume/variants/language-versions.tsx`               |        1 | Language-copy header: visible parent link to documents.                                                                         |
| `features/career/knowledge/stories.tsx`                        |        1 | Missing-story recovery: parent link to stories with its selection cleared.                                                      |
| `routes/dashboard/settings/route.tsx`                          |        1 | Mobile settings header: parent link to settings, hidden on desktop by PageHeader.                                               |
| `routes/dashboard/import/$flowId.tsx`                          |        1 | Expired import recovery: parent link to documents. The active review keeps its Cancel action.                                   |
| `features/auth/pages/error.tsx`                                |        2 | Authentication error: parent links to sign-in or account settings according to the failed flow.                                 |
| `features/auth/pages/forgot-password.tsx`                      |        1 | Password recovery: parent link to sign-in.                                                                                      |
| `features/auth/pages/verify-email.tsx`                         |        1 | Email verification: parent link to sign-in with its callback preserved.                                                         |
| `features/auth/pages/verify-2fa.tsx`                           |        1 | Verification step: link to the previous authentication step with callback and reauthentication preserved.                       |
| `features/help/public-page.tsx`                                |        1 | Public header: home link on desktop; the existing home logo serves mobile.                                                      |
| `features/help/public-shell.tsx`                               |        1 | Public footer: visible home link in both directions.                                                                            |
| `features/documents/new-document-dialog.tsx`                   |        2 | Copy steps: local back buttons retain the in-dialog selection state.                                                            |
| `features/resume/editor/chrome.tsx`                            |        1 | Resume and letter headers: named icon link to documents with a tooltip and shared header target.                                |
| `features/resume/editor/write/entry-card.tsx`                  |        1 | Mobile entry header: local back button returns to its section without leaving the editor.                                       |
| `features/resume/share/history-tab.tsx`                        |        1 | Version preview: local back button returns to the current draft without navigating away.                                        |

One extra search match was a dialog close action labeled “Back to documents.” It keeps `closeDialog` and now says “Close.”
Other dialogs and sheets retain their close and Cancel actions. They do not gain parent navigation or lose focus restoration.
The remaining history call in `features/career/hooks.ts` closes a URL-owned overlay. It does not implement page back navigation.
The command palette's Backspace shortcut changes local command pages. It is not a visible back button.
Calendar month arrows, previous-issue arrows, keyboard glyphs, and forward action arrows remain outside the parent-navigation inventory.
All six PageHeader back slots now contain the shared control. No back-control call site applies an icon transformation.

`packages/ui/src/components/back-navigation.tsx` owns all 24 replacements.
It uses the existing ghost button style, header target, semantic tokens, visible focus, decorative icon, and translated text label.
The icon appears before its label in DOM order and at inline start in each direction. The Icon component supplies the only RTL reflection.
Router links retain real hrefs and native link semantics. Local steps use native buttons with `type="button"`.
The version preview uses the existing sunken surface so its shared ghost action retains readable text.

### Critique and polish

DEGRADED: single-context critique because the owner explicitly forbids sub-agents. Questions skipped because the owner requests unattended execution.
The review found the double reflection, inconsistent targets, and imperative navigation in recovery controls with known parents.
The shared control resolves those issues without changing the primary page actions, saved content, or interface language rules.
Rendered Arabic screenshots show the arrow on the right of the label, pointed right. English uses the left position and direction.
The mobile selection test also found the stretched row button above its checkbox. The checkbox now uses the existing desktop layer protection.
This fixes the selection interaction required by the preceding board task without changing the board's layout.

### Back-navigation verification

The four live browser cases pass independently with one worker and zero retries: ar-SA/en-US at 1440 and 390.
They cover saved detail routes, parent hrefs, icon direction and placement, accessible names, keyboard return, responsive columns, and missing-record recovery.
They also cover legacy redirects, board navigation, fixed selection controls, Trash, and password recovery.
The initial mobile failure exposed the checkbox overlay issue described above. Both mobile cases pass after that correction.
The existing board/details spec also uses the parent recovery link and exact card selectors. Its database-isolation suite did not run in this pass.
Expired import recovery retains its asynchronous leave cleanup through the real parent link.

The external evidence contains 14 board/detail/selection images in `board-ux/`, including both mobile detail continuations.
The `back-nav/` directory contains 64 images: focused links, recovery screens, four detector captures, and the changed parent-navigation contexts.
Those contexts include settings, public help, authentication, workspace recovery, resume and letter editors, language copies, and job targets.
The editor captures use empty documents in a separate verified synthetic account. No saved user content or paid inference runs.
Local dialog steps and version-preview actions retain their existing behavior and focused unit coverage. This pass does not add interaction captures for those states.

Four live Impeccable scans use this job's headless Playwright Chromium on port 9333 with `detect --cdp 9333 --json`.
The scans report zero findings on back-navigation controls. The source scan also reports zero findings.
The Arabic scans each report four findings. The English scans each report three, for 14 observations across four renders.
The remaining rules concern Arabic preparation-button padding, existing heading levels, the approved palette, and inactive Vite developer panels.
These findings remain outside the back-navigation change. The detector exits with status 2 for these findings, so the full-page scan is not clean.
Each live scan retains its JSON, stderr, and screenshot. No detector suppression or call-site icon transformation applies.

The shared component passes four unit tests. Affected web tests pass for the application detail, workspace, import recovery, authentication, documents, and history views.
Both UI and web type checks pass. Changed-file formatting, lint, and the exact token-allowance check pass.
Lingui extraction updates only ar-SA and en-US. The four obsolete token allowances removed here correspond to controls replaced by the shared component.
The `back-nav/checks/` folder retains focused test and tool logs, including the initial mobile failure and its successful reruns.
No full suite, staging, commit, server restart, benchmark change, or Planning change occurs in this pass.

## Retained-feature exposure audit, 2026-11-16

This audit covers `apps/web` routes, menus, command entries, tabs, sheets, query links and WebMCP registration.
It also covers the complete `packages/api/src/routers/index.ts` router inventory and HTTP adapters outside oRPC.
Counts describe feature families: 24 reviewed, 9 approved within existing release gates, and 15 withheld.
Approval in this table does not approve production processing, deployment, or billing.

| Feature                                                     | Location                                                                                                             | Decision                                | Reason                                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application board, details, documents, notes and status     | `/dashboard/applications`, `/applications` CRUD and document associations                                            | Approved: B-C13, D39 amendment          | Personal records remain available under the existing personal-tools release policy.                                                                      |
| Interview scheduling, calendar and participant links        | Application interview dialog, `/applications/{id}/interviews` and timeline CRUD                                      | Approved: B-C13, D39 amendment          | These are records only. They do not run preparation, scrape profiles, or contact participants.                                                           |
| Cover-letter editing, review, versions and job associations | Letter builder, `/cover-letters`                                                                                     | Approved: B-C10, D39                    | Explicit review and truthful persistence remain required. Submitted snapshots remain immutable.                                                          |
| Career master and job-target facts                          | `/dashboard/career/information`, `/career/master`, `/career/personal-workspace`, `/career/job-targets`               | Approved: B-C05/B-C09, D39              | These are owned facts and reviewed job targeting, separate from legacy coaching.                                                                         |
| CV editing, import review and versions                      | Resume builder, resume CRUD/import/versions                                                                          | Approved: B-C02/B-C04/B-C06, D03/D27    | Existing account, ownership and import-review gates remain.                                                                                              |
| Reviewed platform AI                                        | `/ai/availability`, consent, operations and reviews; cover-letter review                                             | Approved: D16, D39, D40                 | OpenRouter only, explicit consent and review. Provider-key setup is never a prerequisite. Interview benchmark results do not enable a product operation. |
| Local authentication and account privacy                    | Account/preferences/privacy, local email and passkey flows, account export/deletion                                  | Approved: B-C01/B-C12, D39              | Existing proof and deletion controls remain.                                                                                                             |
| Private storage and qualified PDF export                    | Storage procedures, owner PDF URL, export checks                                                                     | Approved: B-C08/B-C12, A03/A04          | Owner authorization and document qualification remain.                                                                                                   |
| Templates and public product education                      | Homepage, templates and ATS information                                                                              | Approved: B-C04/B-C07                   | Educational pages do not expose saved CVs or anonymous AI processing.                                                                                    |
| User provider credentials and models                        | Settings AI/API-key aliases, provider setup, `/ai-providers`                                                         | Withheld: D16, A13                      | Retained BYOK is outside the approved platform processing route.                                                                                         |
| Assistant chat and conversations                            | Editor assistant, palette Ask/Threads, `/agent/*`, agent procedures                                                  | Withheld: D16, A13                      | General chat and agent tools are outside reviewed AI operations.                                                                                         |
| Interview preparation, practice, debrief and messages       | Application `/{tab}` routes, workspace launcher and coach sheet                                                      | Withheld: B-C14, D39 amendments         | Interview preparation is benchmark-only and excluded from T008 product scope.                                                                            |
| Job search, page reading and legacy application AI          | Save-job search/reader buttons, `/applications/**/ai/**`                                                             | Withheld: A13, D16                      | No approved job-search integration. Manual job records and pasted text remain.                                                                           |
| External web connectors                                     | Integrations/job-search aliases, web-access controls, `/integrations/**`                                             | Withheld: A13                           | No external integration availability/privacy/support decision.                                                                                           |
| Legacy career coaching and knowledge views                  | `/dashboard/career` except information; legacy `/career/**` except master/workspace/job-targets                      | Withheld: A13, D39                      | They are separate from the approved master-facts feature.                                                                                                |
| Career schedules, notifications and background jobs         | Career runner/queue, `/api/career/**`, schedule procedures and briefing hints                                        | Withheld: A13, D39                      | No autonomous search, preparation, or outreach runs. Queue polling stops before database access.                                                         |
| Public CVs and public profile links                         | Publish actions/badges/filter, sharing procedures, `/$username/$slug`, password page, public PDF and social metadata | Withheld: B-C16, A13                    | No public release approval. Existing published flags do not bypass the gate. New publication writes are denied.                                          |
| User API keys and OAuth grants                              | Settings developer page, `/auth/api-keys`, Better Auth API-key/OAuth endpoints and consent                           | Withheld: A13                           | Existing API keys and bearer grants no longer authenticate product requests. Browser sessions remain available.                                          |
| MCP, WebMCP and protocol discovery                          | `/mcp`, OpenAPI/schema documents, well-known API/agent/OAuth documents, centralized browser registry                 | Withheld: A13                           | Protocol adapters use the same policy before dispatch or registration. Internal session REST/oRPC remains available.                                     |
| Legacy AI import, improvement, ATS and letter drafting      | `/ai/improve`, legacy parse/ATS endpoints and cover-letter draft                                                     | Withheld: D16, A13                      | Improvement uses the new shared gate. Existing legacy import/ATS/draft denials remain. Reviewed replacements remain available.                           |
| External identity providers                                 | Social authentication controls and `/api/auth/sign-in/social`, `/link-social`                                        | Withheld: B-C01 security review, A13    | Existing provider discovery advertises only approved local choices. Direct social entry points are denied.                                               |
| SMS/mobile authentication                                   | No delivered product route or sender in this fork                                                                    | Withheld: B-C17/B-C18, D20/D21, A14–A16 | Later increment needs sender and company approval. No placeholder journey is enabled.                                                                    |
| Billing, top-ups, employer workspace and human review       | No delivered charging/B2B/human-service procedure or product entry point                                             | Withheld: B-C11/B-C15, D40, A09/A10     | T010 and later approvals remain open. Fixture prices do not authorize charging.                                                                          |
| Word export                                                 | Shared download availability and export service                                                                      | Withheld: B-C08, A05                    | Existing unavailable state remains until native integrity approval.                                                                                      |

The shared policy lives in `packages/schema/src/personal-tools.ts` beside the T008 availability schema.
It defaults every retained feature to off without an environment override.
Dashboard/auth parent guards deny child loaders. Agent and public-resume routes also deny direct links.
The base procedure middleware classifies final route metadata before authentication or handler work.
HTTP adapters, background career work, social metadata and browser tool registration consume the same policy.
Retained source remains in place. Retained behavior tests use an explicit test-only enabled policy.
Legacy public-sharing/connector browser qualification stays skipped while its release policy is off.
The new denial specification covers the shipped default in both interface languages and widths.

### Direction, copy and save recovery

The shared input uses interface direction while its placeholder is visible, with `text-align: start`.
Entered URL, email and phone values retain LTR direction. The same CSS rule controls the caret without replacing input values.
Arabic retry copy uses `حاول مرة أخرى`. Failure copy uses `تعذّر`, including matching copy-deck entries.
No saved document content is translated.

The owner log records `BAD_REQUEST` from `linkLetterApplication`, at the submitted-document replacement guard.
The observed error is not a stale-revision error. The submitted snapshot protection remains active.
The toast now identifies the failed letter change and offers a detached copy for this case.
A real copy defect retained the submitted application link. Duplication now clears that link before the copy is edited.
Separate conflict recovery defects left metadata conflicts unmarked and prevented an explicit reload of the same letter.
The store now records these conflicts and supports a deliberate reload. The toast offers Reload or Try again as appropriate.
Recovery actions capture the original letter identity and do not reload another open letter.

Mapped design references: [S32](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3184),
[S33](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3321), and
[S34](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3466).
The map also lists short-letter, interview-moved, application-added and new-application states.
Live Figma renders and browser visual evidence are not inspected in this unattended pass.
D36: excluded workspace entry points are removed because D39 excludes B-C14.
D36: recovery uses the existing alert, parent-navigation and toast components to expose the actual failure and next action.

### Verification for this audit

Focused gate, authentication, social-metadata, input-direction, save-store, and toast units run locally.
The broader web unit pass initially reports 30 failures from changed policy and Arabic expectations.
All 87 affected tests pass after those expectations and explicit retained-behavior policies are updated.
The remaining 188 web files passed in that initial run. No unchanged suite is repeated.
Browser specifications are updated but do not run locally, as the owner requests.
Final static and GitHub results are recorded below after execution.

Final focused results: 265 tests pass across the affected suites.
Changed-file formatting and lint pass. The roadmap checker reports 0 errors, and `git diff --check` passes.
The broader type check completes 21 workspaces and fails in the pre-existing modified homepage `tailor.tsx:75`.
Its `ThreadSpec` assignment supplies an optional `tone` as explicit `undefined`. This audit does not change that file.
`pnpm validate:static` stops at formatting in the pre-existing interview-prep and translation `tuning.json` files.
The audit does not change those files. The aggregate lint, types, unused-code and boundary stages therefore do not run through that command.
No D38 workflow runs: D38 requires a passing static check, and the owner forbids the snapshot commit needed to upload these edits.
The committed HEAD is `b60f985f47e6b8bb539fbc8db4a9e759fa19e813`. A run of that SHA does not qualify this working tree.
No `ci/try-t008` branch is created, so no temporary branch remains to delete. There is no new GitHub run URL.
No browser suite, paid inference, package install, staging, commit, environment-file read, or dev-server restart occurs in this audit.

### Application picker and demo data repair, 2026-11-16

B-C10/B-C13: the letter builder, interview dialog, CV job-copy dialog, and letter-library link dialog share one searchable application picker.
Each option shows the role, company when present, localized stage with its color dot, and a relative date with Latin digits.
Options sort by recent updates. Closed applications appear only when linked or when no active applications remain.
UUID values in company fields never appear in picker text. The CV-version selector already uses version names or dates without ID fallbacks.
D36: replace the letter dropdown and job-copy pills with the shared combobox so large application lists remain searchable and consistent.
The starting S32 masters are [desktop 38:3184](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3184) and [mobile 49:1971](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=49-1971).
The desktop Figma render was read through the authorized connection.

The submitted-letter fixture creates applications named `Synthetic Submitted Job`, previously with UUID suffixes, and letters containing `Original submitted content.`
The demo account contained 10 exact fixture applications from 13:49–13:52 UTC on 2026-11-16. Their linked originals matched that fixture.
Only those 10 applications were deleted through the authenticated application API. Other documents were retained.
The remaining `مهندس / Engineer` application at `شركة تجريبية / Synthetic Company` matched its full pre-cleanup record.
The exact removed IDs and timestamps are recorded outside the repository in `/tmp/master-cv-test-row-cleanup.json`.

The shared browser fixture client previously accepted any authenticated session. It now rejects sessions outside generated disposable accounts before sending requests.
Authentication also requires the exact generated account. The live navigation spec now uses that fixture instead of the demo login.
The live browser configuration rejects owner storage state. These changes prevent fixture reuse from writing through a demo session.
The historical command that ran the submitted-letter fixture against the demo session was not recovered.

Focused results: 15 UI tests and 2 account-isolation tests pass. Formatting, changed-file lint, and the design detector pass.
The one browser specification passes with one worker and no retries across Arabic/English at 1440 and 390 pixels.
It tests the live letter picker without writes: search, stage labels/dots, Latin digits, keyboard return, and viewport bounds.
Browser evidence also exposed clipped trigger labels and a popup minimum width above its available width.
The shared combobox now uses the existing flexible row button variant and caps its minimum width at the available width.
Screenshots are outside the repository in `/tmp/master-cv-picker-browser/`. The other three picker contexts have focused unit coverage but no live screenshots.

D36 / 2026-11-17 (Sayed), B-C10/S32 and B-C06/S20: shared Beta badges identify provisional AI tools; one durable content retry keeps the existing review flow and single-delivery charge while retaining both provider costs. Verification: API 1355, web 1159 and database 37 unit tests pass, with the added source-fault regression also passing. Shared neutral Badge variants retain T002 styling. The production-worker pin refresh keeps raw benchmark scoring unchanged; Arabic v6 approval and offline preflight remain valid.

## PR 26 review corrections

The review scan records 44 actionable threads and five rejected suggestions in the local, uncommitted `pr.md`.
Application changes preserve sent CV snapshots, saved version selections and server revisions across edits and stage changes.
Cover-letter changes recover from copy/reload failures and retry rejected verification. The retained mobile draft action follows the BYOK gate.
Benchmark changes correct unknown charges, interrupted reservations, account-error costs, repetition identity, interview language checks and MQM span scoring.
The new benchmark identity requires fresh qualification. Historical paid results and the historical core seal remain unchanged.
Freeze history now records the previously omitted seal and its original control receipt through immutable Git objects.
Billing metadata is checked even when current files match the seal.

These changes cover B-C10, B-C13, B-C17, B-C18, A02, A06, A08 and A13 within their existing approval gates.
The planning corrections apply D43 to pilot prerequisites and retain eighteen scheduled task briefs.
The owner suggestion “T2” remains unverified. No supplier substitution or activation approval occurs.

Live Figma access confirms S32 desktop `38:3184`, S33 mobile `49:2018` and S34 desktop `38:3466`.
The inspected reference renders are [S32 desktop](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=38-3184)
and [S34 mobile](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=49-2096).
The existing S32 recovery, S33 creation/edit and S34 stage states remain the inventory for these fixes.
D36: retain the detail-page shell and derive four or five mobile columns from available destinations. This keeps the shared header and navigation aligned.

Static validation passes. All 37 affected browser tests pass with one worker and zero retries.
Affected units pass: API 1357, web 1179, tooling 2997 and database 37. Existing skips remain: API four and tooling 32.
The API database configuration and three stale benchmark expectations required corrections. Only the failed suites ran again.
Ten mobile tests pass, including the notes revision regression. Native compiler validation remains blocked because the local Hermes compiler is absent.
The full browser suite remains a CI responsibility.
CI exposed an import-test race: its wait matched a section-picker button before the section navigation updated.
The test now waits inside that navigation. Its 24 tests pass locally with Node 24.
Browser evidence covers Arabic and English at 1440 and 390, including application details, edit dialogs and letter recovery.
Screenshots are in `review-browser-evidence` under the owner-specified scratchpad. The inspected dialogs retain shared controls, visible footers and correct direction.
The migration regression proves that a later notes edit does not replace the recorded sent-version date.
Fresh offline controls pass for all categories, the selected scope and canaries. Offline request preflight passes with zero network requests.

The current main lockfile reproduces the Picomatch advisory. No patched release is available in the inspected registry.
The audit uses the existing advisory-exception mechanism for [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), with a review date of 2026-11-24.
Repository and build patterns reach this dependency. Product inputs do not supply glob patterns.
Dependency audit and license validation pass. This exception does not patch the dependency.
