# T002 implementation evidence

2026-11-08. Branch `feat/t002-design-system-shell`, base `8c7b6f6a5fa01a8492f95afb11f939e7adaa0706`,
plus the committed T002 changes in [PR #11](https://github.com/0-sayed/master-cv/pull/11).
No deployment, release approval, A07 pass or T002 graph completion is claimed.

## Delivery scope

The owner explicitly chose the shared theme/language foundation, with each screen's wording handled in its
existing task. [D34](../Planning/context/decisions.md#d34--t002-foundation-delivery-boundary--2026-11-08)
and the T002 brief now record that decision. Foundation delivery is distinct from the complete bilingual release,
manual accessibility qualification and downstream journey gates. Full-app diagnostics remain visible.

## Implemented boundaries

- Product UI accepts `ar-SA`/`en-US`: supported URL → saved account preference → cookie → Arabic.
  Inherited document/native locales remain separate and compatible.
- Nullable `user.ui_locale` uses the existing Better Auth update path. The additive migration was generated and
  applied to isolated local PostgreSQL. Catalog loading and persistence precede activation; switches serialize and
  coalesce the latest intent. Account generations invalidate stale work.
- In-place switching updates Lingui, root language/direction, Base UI direction, session cache, cookie and router
  search. Mounted forms, focus choices, selection, pending editor save and undo/redo are preserved. Locale never
  enters a CV schema or font registry.
- Existing semantic CSS and Base UI components gain shared light/dark colors, script-specific Noto stacks,
  spacing/type roles, fixed paper colors, the SAR vector, phone normalization, single-input verification code,
  resend state and an error summary. No auth/SMS service is activated.
- Number/timestamp APIs force Latin digits, Gregorian application dates and Riyadh time. CV dates remain untouched.
  Document filtering derives normalized comparison text and uses UI collation with stable IDs.
- Existing app/auth/public/editor chrome exposes the two-language switch; sidebar is 236px. Mobile navigation has
  four destinations and a separate New action. Seventeen exact deck bindings cover language, theme/preferences and
  shared navigation/menu labels. Retained inherited feature copy remains subject to its feature owner and A13.

## Source evidence

Authorized live context/render reads used [Master CV](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni):
[Foundations 19:2](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=19-2),
[Logo 6:23](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=6-23),
[SAR 6:27](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=6-27),
[S28 desktop 37:2877](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-2877),
[Dark 52:8286](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=52-8286),
[Phone 561:2273](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=561-2273),
[OTP 561:2502](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=561-2502) and
[Resend 561:2511](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=561-2511).
Planning-stage button and S28 AR/EN desktop/mobile renders remain in scratch evidence. These reads do not qualify
all downstream masters. S28 uses its measured 72px header rather than the general written 80px reference;
the existing editor bar remains 56px. D11 owner review remains open.

Local English fonts come from official `google/fonts`, pinned at `86aced91de05cd4f96a06838124cca45be337b2b`,
with their SIL OFL files. They are delivered as Latin-only variable WOFF2 subsets generated with FontTools 4.60.1
and Brotli 1.2.1, preserving all layout features. The Unicode range exactly matches `apps/web/src/index.css`:
U+0000–00FF, U+0131, U+0152–0153, U+02BB–02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329,
U+2000–206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF and U+FFFD.
The full weight axis (100–900) and original width axis (62.5–100) are preserved without static instancing.
Both old English TTFs were removed from source and rebuilt output. Each subset keeps its adjacent unchanged OFL.txt.
Existing Noto Sans Arabic 2.009 assets and license are byte-identical to HEAD; Arabic CSS and the document-font
pipeline are unchanged. UI faces use `font-display: swap`.

| Asset                    |     Bytes | SHA-256                                                            |
| ------------------------ | --------: | ------------------------------------------------------------------ |
| NotoSans-Variable.woff2  |    94,140 | `f0e7e16bb77a8366f6f06137eafa4913f48bb5b454480812fa8debaa6abf34b6` |
| NotoSerif-Variable.woff2 |   100,324 | `21bfa02d3b2455bc8af9ab3039601479ef0c5a5e2a7bec1b00d31f372e8b8fbc` |
| Each English OFL.txt     | unchanged | `cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a` |

## Verification

Only synthetic accounts/CVs and local infrastructure were used. Ignored `.env.t002.local` preserves the original
credentials and uses isolated PostgreSQL on port 55439. Installed system Chrome supplies the browser runtime.
Built-app tests use the existing rate-limit-disable flag only in their isolated synthetic process. No Docker image
was built/pulled and no real customer data, sending, payment or deployment was used.

| Check                       | Result/evidence                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation copy             | 17 delivered identities; `copy:check:bindings`: zero diagnostics; validator 32/32 tests                                                                                     |
| Full copy release audit     | Expected failing: 3,338 diagnostics (3,333 source/surface mappings, 3,087 unique IDs, five deck reference issues); existing feature handoffs recorded                       |
| Real preference storage     | Migration applied; API rejects invalid/anonymous updates; fresh browser restores saved preference                                                                           |
| Typecheck                   | 22/22 workspace tasks pass, including mobile; tooling checked after the scoped validator addition                                                                           |
| Package tests               | Utils 114; auth 34; UI 29; web 367; tooling 248 with 32 existing skips; server static 15 pass                                                                               |
| Production build            | Root build: 3/3 tasks pass                                                                                                                                                  |
| Built-app browser           | 54/54 cases pass, serial Chrome: auth, bilingual entry/shell, foundations, shared controls/copy, locale preference/drafts, real browser zoom                                |
| Responsive matrix           | AR/EN × light/dark × 320/390/768/1440 shell; public/login at 390/1440; font readiness checked                                                                               |
| Actual browser zoom         | Four AR/EN cases: 200% browser setting, physical windows 780/1440 → CSS viewports 390/720; no root overflow, mobile labels fit, keyboard skip link and theme radio operable |
| Development pseudolocale    | Existing compiled zu-ZA accented copy rendered on login at 320/1440; longer submit-label fixture fits at 320; production language choices exclude it                        |
| Static checks               | Root lint passes; changed-file formatting and diff whitespace pass; prior knip/boundaries checks pass                                                                       |
| Root formatting             | Remains failing only on untouched pre-existing `.archon/.state/review-bots.json` and `pr.md`; preserved                                                                     |
| Manual accessibility/device | Screen-reader speech and physical mobile/on-screen keyboard tests not run; remain A07 release work                                                                          |

The new binding-scope cases first failed (seven missing-function failures with 25 existing passes), then all 32
passed. Adding D34 initially exposed the planning validator's fixed decision-register range; it was updated to
include the newly authorized decision, preserving uniqueness/reference checks. Full tooling tests then pass.

The readOnly paste defect reproduced before the fix, then the UI suite passed 29/29. The custom handler now
respects immutable state. Earlier source review identified two Important provider defects: stale account requests
could block the next account, and a delayed result could steal newer focus. Both reproduced and were fixed in one
review pass; the complete web suite passes 367/367. No unresolved Important/Critical finding is recorded.

The real builder test holds an actual update request, checks all saved CV data/metadata unchanged during switching,
then allows only the intended name edit to persist. It tests undo/redo and reload. Two additional tests hold the real
preference response while a new-document dialog is opened and edited; after activation the same input node, value,
focus, selection and portal direction remain correct. Server revision-history records are not independently asserted.

Pseudolocale evidence is bounded development qualification, not full-app missing-copy or all-journey coverage.
Lingui accents characters without lengthening this label; expansion is a separate longer-label fixture. No third
production language or persistent test setting was introduced.

## Browser artifacts and review

A Terra 6.1 medium headless QA agent exercised the earlier 46-case dev-app matrix and additional flows; its report
is `/tmp/master-cv-t002-terra-qa.md`. The parent ran the current 54-case built-app suite. An earlier CSS-magnification
observation is not equivalent to actual browser zoom; the four real-browser-zoom cases pass. Playwright's ordinary
CSS-sized screenshots cropped the zoomed surface, so those artifacts are excluded. The final zoom test captures
Chrome's physical viewport through CDP instead; runtime assertions continue checking actual CSS geometry.

Earlier parent visual review covered AR/EN × light/dark at 390/1440 plus Arabic public/login screens. This continuation
also inspected Arabic actual-zoom output, English 320px preferences and an expanded pseudolocale login label.
Correct loaded type, RTL/LTR, wrapping and navigation were checked; this is not final Figma or brand approval.
Screenshot artifacts live under ignored `test-results/`; local logs use `/tmp/master-cv-finish-*`. Detailed RED→GREEN
records and source/extraction evidence remain in the ignored task workspace because commits are prohibited.

## Release conditions and downstream work

- Complete screen wording follows existing owners: T003/T009 auth/account, T004 editor/ATS, T003 documents,
  T010 billing, T011 public/landing; retained features keep their owners and A13 review. See
  [copy reconciliation](t002-copy-reconciliation.md). Existing upstream public branding is still T011 work.
- A07 owns full-product accessibility and complete-journey evidence. Manual assistive/device checks, remaining
  dialogs/errors and future billing/privacy journeys are pending; foundation automation does not pass A07.
- D11 brand/font owner review, AR/EN copy owner review, A13 exposure and applicable legal/processing approvals remain
  open. Rendering proves neither PDF/DOCX integrity nor authorization/payment correctness.
- Shared phone/code/resend primitives do not activate SMS. Existing MFA retains its API; T003/T009 qualify those
  consumers and T014 owns single-input SMS integration and server/recovery policy. A14–A16 remain closed.
- Formatting APIs are ready for feature adoption with correct domain semantics. Imported/partial/Hijri CV dates
  remain outside the instant formatter. Native packages typecheck; no native runtime test is claimed.

The foundation implementation is committed and pushed within D34's agreed delivery scope. Unrelated artifacts
are preserved. T001 is marked done at the owner's explicit instruction after PR #9 merged; T002 stays pending
until the owner merges this PR.

## Font review follow-up — 2026-11-08

The original English assets were 2,049,096 and 1,887,192 bytes. The size-budget check failed before conversion;
the subsets now total 194,464 bytes, about 95% smaller. Both pass the 300,000-byte budget, keep exactly the source's
supported code points within the requested range (320 each), preserve both variable axes, and match sample Latin
glyph outlines and advances at weights 100, 300, 700 and 900. License hashes are unchanged. FontTools was installed
only in a temporary tooling environment; no application dependency changed.

Fresh verification for this follow-up:

- Root production build: 3/3 tasks pass; output contains WOFF2 and no old English TTFs.
- Existing `design-foundations` and `bilingual-entry` Playwright specs: 21/21 pass on the built app in installed
  Chrome, covering AR/EN light/dark desktop/mobile and required-font failure behavior.
- Additional Chrome qualification: four AR/EN × light/dark cases pass; eight screenshots at 1440/390.
  CDP confirms custom Noto Serif on the English heading and Noto Sans on the label, plus 16 font probes across
  both themes and both families at weights 100/300/700/900 with synthesis disabled. Arabic heading/label use the
  original Noto Sans Arabic SemiBold/Medium faces. WOFF2 responses are HTTP 200, `font/woff2`, with the expected
  byte sizes; no font request failed. English desktop and Arabic mobile screenshots were visually inspected.
- Existing database migration integration test: 1/1 passes with the real-database gate enabled on isolated local
  PostgreSQL. It covers fresh installation, legacy upgrade, repeat migration and rollback in two disposable databases,
  which it removes after testing.
- Snapshot chain verification passes: the only added entry is nullable `user.ui_locale` text without a default.
  The actual Drizzle column and applied local database independently match those attributes.
- Root lint, changed-file formatting and whitespace checks pass. Root formatting still reports only the unrelated
  pre-existing `.archon/.state/review-bots.json` and `pr.md`; both were preserved.

The proposed T002 delivery explicitly includes both migration artifacts:
`migrations/20261108115423_chemical_nextwave/migration.sql` and
`migrations/20261108115423_chemical_nextwave/snapshot.json`. Both are tracked in the T002 feature commit.
No replacement migration or schema edit was necessary.

Screenshots: `test-results/t002-font-review/{en,ar}-{light,dark}-{1440,390}.png`.
Font report: `test-results/t002-font-review/font-rendering.json`.
Logs: `/tmp/master-cv-woff2-{build,e2e,browser,migration-test,schema-check}.log` and
`/tmp/master-cv-woff2-assets.json`. Initial probe runs before server readiness and with an overly strict Arabic
internal-family-name expectation are excluded; the final probe verifies the existing Arabic PostScript faces.
No production Arabic change was required. The user development app remains on port 3000.

## Shipping verification — 2026-11-08

The initial full workspace run passed 2,541 tests with 108 environment-gated skips across 20 successful tasks.
After the review fixes, the affected UI package passes 33 tests and the server passes 159 with 4 existing skips.
The final built browser run passes 83 tests with 3 feature-gated skips, including all 9 PDF cases and the four new
sizing/navigation regressions. The server-locale and code-entry regressions failed before their fixes.
Lint, typecheck (22 tasks), Knip, boundaries, roadmap and changed-file formatting pass. Final AR/EN desktop/mobile
light/dark screenshots were inspected. The PDF investigation is recorded in [its evidence note](t002-pdf-investigation.md).
