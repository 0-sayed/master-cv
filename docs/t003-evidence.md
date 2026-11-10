# T003 implementation evidence

Recorded 2026-11-09 on `feat/t003-private-career-workspace`, based on `5908cdf12`.
Implementation was authorized for inline execution. The owner subsequently authorized logical commits,
a branch push and one PR into main, with review-fix rounds and no merge. No deployment, production
migration or paid-service activation is included.
T003's roadmap checkbox remains open until its future authorized merge and acceptance accounting.

## Delivered behavior and contracts

- Email/password registration requires real verification before private access. Verification returns
  to password/MFA login without creating a session. Reset is single-use, revokes sessions and preserves
  enrolled MFA. Fresh cookie, bearer and API-key identity checks reject unverified accounts.
- AR/EN auth recovery, persisted welcome, document library and manual career information reuse the
  existing application. Locale changes preserve entered facts, drafts and independent CV content.
- Five typed career groups use separate pending/accepted revisions. Confirmation atomically compares
  profile, accepted and draft revisions; conflicts retain the local draft for another explicit review.
  Removal records a tombstone without rewriting any CV. Legacy preferences/text knowledge are preserved.
- `savePending` uses `{ fact, version? }`, with strict field/value validation. `CareerMaster.links`
  returns only owned, nontrashed document names/IDs and accepted fact revisions for truthful used-in links.
  Linking accepts an exact retained, nonremoved historical snapshot. `resumeLinkState` reports lineage
  and stale fact IDs; T004 owns editor refresh/import/creation controls.
- Twenty-seven private tables enforce forced RLS. Runtime credentials cannot own protected tables,
  bypass RLS, assume the schema owner or mutate accepted snapshots. Requests use short owner-scoped
  transactions; multiwrite operations use an explicit atomic transaction. Queue discovery exposes
  bounded owner IDs; payload access runs under that owner. CLI migrations use a separate admin URL.

## Executed verification

The ignored execution workspace is `.superpowers/sdd/2026-11-09-t003-private-career-workspace/`.
Its ledger records task checks, failed-first regressions and final rulings. Post-QA logs are in the
neighboring `2026-11-09-t003-terra-e2e/` directory. Logs are local evidence,
not source files or production telemetry.

| Check                                 | Actual result                                                                     | Evidence                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Schema                                | 95 passed                                                                         | `backend-verified.log`                                                                    |
| PostgreSQL/RLS/migrations             | 14 passed, including 9 owner-scope integration cases                              | post-QA `sharing-backend-final.log`                                                       |
| Auth                                  | 39 passed, including 5 real-handler email/reset/MFA cases                         | `backend-verified.log`; final fixture-only edit rechecked in `auth-fixtures-verified.log` |
| Mail                                  | 6 passed, including generated-catalog parity and AR/EN templates                  | `backend-verified.log`                                                                    |
| API                                   | 473 passed, 7 skipped in the post-QA broad run                                    | post-QA `sharing-api-final.log`                                                           |
| Additional real-DB API prerequisites  | 9 passed across 2 files, including the formerly skipped 7 cases                   | `extra-api-verified.log`                                                                  |
| Server                                | 159 passed, 4 skipped in the post-QA broad run                                    | post-QA `sharing-server-final.log`                                                        |
| Actual OAuth integration prerequisite | 4 passed                                                                          | `oauth-verified.log`                                                                      |
| Web                                   | 385 passed                                                                        | `web-verified.log`                                                                        |
| Career service/history checkpoint     | 45 passed across 3 files                                                          | `task-6-tests.log`                                                                        |
| Tooling                               | 248 passed, 32 skipped                                                            | tooling run recorded in the ledger                                                        |
| Browser acceptance                    | 72 passed, 1 skipped                                                              | final `task-8-tests.log`; preceding run `browser-acceptance.log`                          |
| Types                                 | schema/db/auth/email/API/tooling/web/server/mobile passed                         | `typecheck-verified.log`                                                                  |
| Builds                                | production web and Hono server passed                                             | `web-build-final.log`, `server-build-final.log`                                           |
| Static                                | scoped formatting/lint, Knip, package boundaries, diff whitespace and secret scan | final verification logs                                                                   |
| Copy                                  | 0 binding diagnostics across 10 active surfaces                                   | `copy-bindings-final.log`; not full copy approval/coverage                                |

Real PostgreSQL tests exercise both owners, missing scopes, foreign parent references, private CRUD,
immutable snapshots, superuser/admin bypass versus runtime rejection, rollback/pool reuse, nested owner
changes and explicit transaction isolation. The queue metadata/foreign worker-read case uses PostgreSQL;
stale-agent cleanup also has API regression coverage. The browser ownership case uses the restricted
runtime server and checks private CVs, master links and files, anonymous/foreign denial and traversal.

The browser matrix covers `{ar-SA,en-US} × {1440,390}` for signup/welcome, SMTP verification/resend,
reset/wrong-password/error focus, invalid-reset recovery, enrolled MFA, career edit/review/confirmation,
two-tab conflict recovery, persisted reload and session-expiry draft restoration. It also covers owned
used-in links, pending-field locking, both Arabic digit sets, cancellation, interface switches during
auth/career/editor drafts, inherited login/logout, locale persistence, 320/768 reflow and 200% shell zoom.
Quota recovery deliberately uses a synthetic `BASE_CV_LIMIT` response: T005's race-safe enforcement
is not implemented or qualified here. Library failure/retry behavior also has component/service checks.

The skipped browser case requires the disabled synthetic AI provider. No live provider was enabled.
Integration-fixture prerequisite skips are stated above; they are not counted as executed assertions.

## Independent headless QA and fixes

At the owner's request, GPT-6.1 Terra at high effort exercised all 28 browser spec files and
additional synthetic scenarios using headless Chrome, a restricted PostgreSQL role and captured local
SMTP. The full post-fix run completed **123 passed, 0 failed, 3 skipped** out of 126;
`final-combined-full.json` and its log preserve the result. The skips require disabled AI test-provider
flags (2) or guest login (1). No disabled feature was activated to obtain passing results.

QA found and drove fixes for a stale accessible-name assertion, public PDF/statistics access,
old-address redirects, password unlocking, private-owner slug lookup, private-owner PDF and download
events, and owner access to password-protected PDFs. Regression checks cover sharing revocation,
changed-password cookie invalidation, owner-only files/history, foreign-user isolation and read
permission requirements for private owner access. Public SELECT policies remain limited to explicitly
public, nontrashed CVs and live redirects; private mutations retain forced owner isolation.

After the full run, an optional undefined property was omitted to satisfy exact optional typing.
The server was rebuilt from that final source. The independent exploration then passed **20/20**
against that build (`latest-explore.json`), including failed-save recovery, account switching,
long-text dialogs, Arabic/English reflow and actual 200% Chrome zoom. The strengthened permanent
sharing/ownership tests passed **4/4** (`latest-sharing.json`) and independent owner/password/hidden-data
probes passed **5/5** (`latest-probes.json`) on that final build. The original failed probes and
all corrected results remain in the ignored independent report; production release gates remain open.

## Figma and actual renders

Source file: [Master CV: Design (v1)](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni).
Authorized live Figma renders were inspected for these masters:

| Screen              | Desktop                                                                        | Mobile                                                                         |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| S02 registration    | [25:677](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=25-677)   | [41:692](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=41-692)   |
| S03 verification    | [25:771](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=25-771)   | [41:761](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=41-761)   |
| S04 welcome         | [25:845](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=25-845)   | [43:607](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=43-607)   |
| S14 login           | [22:478](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=22-478)   | [41:629](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=41-629)   |
| S15 forgot password | [32:1688](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=32-1688) | [47:1156](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=47-1156) |
| S16 reset           | [32:1751](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=32-1751) | [47:1199](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=47-1199) |
| S17 documents       | [21:325](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=21-325)   | [41:2](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=41-2)       |
| S18 information     | [32:1812](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=32-1812) | [47:1241](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=47-1241) |

Additional inspected recovery renders: expired verification `52:1033` / `120:10652`, reset sent
`52:1111` / `120:10703`, password changed `80:29813` / `80:30208`, session expired `89:19694` /
`89:19755`, empty documents `52:1182` / `52:8037`, and Start `258:28746` / `258:26002`.
Inspected forms: Add `259:22002` / `259:39520`, Edit experience `266:74946`.
The English document reference `64:164` was also inspected. Long-text frames `487:26086` /
`487:26655`, Account details sheet `85:20241` and all remaining state renders are not visually qualified.

Actual settled screenshots remain in ignored `test-results/`: verification, resend, welcome, document
empty/limit, password changed/reset recovery, MFA, career edit/conflict/information and session expiry.
The executor inspected AR mobile/desktop and EN desktop/mobile output. Tests wait for fonts and finite
transitions before capture and assert language/direction/font availability and overflow. Arabic uses
Noto Sans Arabic; English uses Noto Sans and the existing editorial heading face. No user study,
screen-reader study or independent pixel-diff qualification was performed.

The existing username field is retained. Mobile structured entry editing adapts the mapped sheet;
there is no separately invented Figma mobile Edit experience ID. The inherited document library and
its empty/import composition remain reused, so this evidence does not claim pixel identity with S17.
Mock plan/usage figures, prototype mail previews, Google/mobile activation and simulator controls
are not adopted as product behavior.

## Gates and outstanding qualification

- **B-C01 / A08:** verified-account and ownership implementation has the synthetic evidence above.
  This is not a blanket production security or retained-exposure approval.
- **B-C05 / A06:** reviewed master persistence, historical links and independent AR/EN/job CV snapshots
  are covered. T004 still owns editor refresh, import and full CV revision-restoration acceptance.
- **A07:** local auth, recovery and correction journeys are covered as stated. Complete release
  accessibility/visual qualification, physical keyboard/device coverage and uninspected states remain open.
- **B-C12 / B-O01:** recoverable auth/correction and existing settings navigation contribute here.
  T009 owns full rights/support/deletion work; T003 does not claim it.
- **A11 / A12 / A13 and D09/D11:** real-data processing, operational restore, retained exposure,
  legal/company/mail/provider inputs and release approvals remain open. Real SMTP delivery was not used;
  only a loopback `.test` recipient capture was exercised. No real CV was processed.
- Following the owner's request to fix the three sharing regressions, SELECT-only policies permit
  explicitly public, nontrashed CVs and their unexpired redirects. Private writes/history remain owner-only;
  view/download counter writes use the owner returned by the checked lookup. Owner-private slug,
  server PDF fallback and download-event lookups use the read-authorized owner scope; owner PDF
  downloads bypass the visitor password cookie and remain excluded from visitor counts. Targeted headless browser
  tests pass for public PDF/statistics, address redirects, password unlocking and private ownership.
  They also check immediate sharing revocation, rejected wrong passwords and invalidated unlock cookies
  after a password change. This repairs retained behavior; A13/T004 release qualification remains open.
- Native validation: 8 tests passed; the inherited Hermes test failed because its iOS Pods compiler is
  absent on Linux. Mobile typechecking passed. The full root test command is not claimed green.
- Mobile signup/SMS, real billing, AI activation, public sharing and production deployment are not
  authorized by this work. Scoped copy review remains pending with its designated owner.

Only disposable test databases were migrated. Existing application configuration/credentials and
unrelated untracked files were preserved. SMTP captures contain disposable synthetic auth links in
ignored, restricted files; tokens, private connection strings and real-user facts are absent from this
document and the source diff. Local credentials, scratch work and raw browser evidence are excluded from commits.

## Final fidelity and ship verification (2026-11-09)

The final light-theme pass refreshed 19 Figma/app pairs after the presentation fixes:
Arabic S02/S03/S04/S14/S15/S16/S17/S18 at 1440×1024 and 390×844; English S14 desktop
and S17 desktop/mobile. Pair filenames follow `<screen>-<locale>-<width>-{figma,app}.png`
in `/mnt/storage/master-cv-design-archive/t003/fidelity/`. Three taller Arabic mobile masters
retain their full original plus an unscaled top-844px comparison crop. All 19 app captures waited
for fonts; none overflowed horizontally. Whole-screen results remain PARTIAL for the 15 documented
runtime, feature and launch-gate differences in `fidelity/differences.md`; dark parity is not claimed.
No screenshot baselines were added. The owner must review the visuals before adopting baselines.

Review regressions cover the mark physically left of its wordmark in both interfaces, English titles
in Arabic UI and Arabic titles in English UI truncating at their own logical ends, the S04 information
icon, exact indexed S14 actions, S17 cover-letter tab and S18 desktop title. The desktop S18 title uses
`editor.navigation.career`; the mobile master intentionally uses `editor.career.title`. All four requested
copy corrections had matching indexed deck entries, so none required rewriting the deck or an owner decision.

All 80 live Figma Icon components were exported read-only and rasterized at 48px against
`@phosphor-icons/core@2.1.1/assets/regular`. 69 names identify the matching glyph directly;
11 live aliases are recorded as optional `phosphorName` entries in `Planning/context/design/icons.json`:
`envelope → envelope-simple`, `gear → gear-six`, `shield → shield-check`,
`upload → upload-simple`, `download → download-simple`, `pencil → pencil-simple`,
`spinner → circle-notch`, `calendar → calendar-blank`, `chat → chat-circle-text`,
`hourglass → hourglass-medium`, `share → share-network`.
The matched alpha-mask mean error is at most 2.339/255 and binary IoU at least 0.9501;
minor rounded-curve export differences prevent a pixel-identity claim. Raw exports, same-name and
canonical raster pairs, metrics and nearest-glyph checks are in the sibling `icons/` archive.
Code retains the existing React package and registry: all 80 names plus canonical aliases resolve.
S18 uses star/translate/certificate, shell navigation stays regular, verification uses envelope-simple,
and the light-theme toggle uses moon. No Figma edits or substitute glyphs were introduced.

Failed-first evidence: Step 0 exposed 7 failures out of 8 checks; after correction all 8 passed.
Four new icon browser checks failed on the old glyphs/weights; all 12 review-fidelity checks now pass.
The registry test failed for 24 missing names and passed after extending the registry.
Independent review also reproduced silent queue/stale-agent discovery failure under a non-bypass
schema owner. Both discovery regressions failed before the fix. A generated migration grants SELECT
only to the migration-time owner on four worker tables; runtime payload reads remain owner-scoped
and startup rejects membership in protected-table owners. The integration fixture now migrates as a
normal NOSUPERUSER/NOBYPASSRLS owner. All 15 DB tests pass, including foreign-payload denial.

Latest unit/integration results: schema 95/95, DB 15/15, auth 39/39, mail 6/6, API 480/480,
server 163/163, web 385/385, UI 33/33, tooling 249 passed and 32 prerequisite skips.
API/server prerequisites were supplied through a separate disposable synthetic database; no integration
prerequisite skips remain in those two results. The root native/Hermes limitation stated above remains.
Lint, all 22 workspace typechecks, Knip, boundaries, scoped formatting, copy bindings (0 diagnostics)
and production web/server builds pass. The new migration was applied only to the isolated browser runtime.
Three broader browser selectors were updated to the actual indexed copy (Email address, Cover letters,
and desktop مستنداتي); all original interaction/geometry assertions remain. The reflow check polls the
same zero-overflow condition after resize, rather than measuring an intermediate layout; three repeats passed.
Final rebuilt-runtime headless Chrome run: 156 passed, 0 failed, 3 gated skips, 0 flaky across
all 30 specs (247.2 seconds). The skipped cases require disabled AI/provider or guest capabilities.
The ship report records the PR and subsequent review results.

## PR #13 review round 1

Review reproduced and corrected 27 findings: runtime TRUNCATE privileges and migration credentials;
legacy owner-reference validation under forced RLS; fair bounded job/mail processing; mixed-precision
dates, raw-date preservation and conflict merging; fact categories; surviving CV variants and download
authorization; lazy stream initialization inside owner scope; reset/session recovery, MFA branding and
catalog coverage; audited icon aliases; isolated SMTP setup and a real cross-owner storage traversal probe.
Focused regressions failed before their production fixes and passed afterward. Evidence and raw bot
threads are preserved in the external fidelity archive; no credentials or authentication links are included here.

Eight comments were declined or retained behind existing gates with concrete evidence: cover-letter
parent ownership is already enforced; SMTP failures do not enumerate accounts; verification templates
have no unresolved name placeholder; successful verification already redirects; guest access remains
disabled; welcome copy and sidebar composition follow the working masters. Approved legal destinations
remain an existing prelaunch requirement: S02 currently matches the master's plain consent copy, and no
unapproved policy text or invented links were added.

Post-review unit/integration: schema 101, DB 21, auth 41, mail 8, API 498, server 163, web 403,
UI 33, tooling 262 passed with 32 prerequisite skips: **1,530 passed** in total. All API/server integration
prerequisites were supplied. Lint, 22 workspace typechecks, Knip, boundaries (1,642 files/23 packages),
copy bindings, roadmap validation, scoped formatting and both production builds pass.
The rebuilt isolated runtime passed all 30 browser specs: **156 passed, 0 failed, 3 gated skips,
0 flaky**. The first-head CI failure exposed six test setup failures: an ambiguous two-segment public
route and unused font faces not loaded by `document.fonts.ready`. Tests now assert the actual root-404
surface and explicitly load the required fonts; all geometry and font assertions remain.
The corrected two-spec browser run passed **47/47**, with no skips, failures or flaky cases.
The 19 app captures were refreshed after fonts, animations and loading skeletons settled, with no
horizontal overflow. Existing fresh Figma targets and all 15 documented intentional differences remain;
no visual baselines or dark-theme parity claims were added. GitHub's final results are tracked separately
in the ship report, not inferred from the local run.

## D35 owner decision and follow-up

D35 (owner decided 2026-11-09) makes existing shared components the visual-detail target.
Figma still governs screen/state/dialog inventory, elements, exact icons, indexed copy, flows and
order. Fresh comparisons check those contracts, layout/RTL and brand geometry; pixel spacing is
not an acceptance gate. The roadmap checker now recognizes D35 without marking T003 complete.

Fixed invented career-dialog language controls, first/last Arabic and Latin avatar initials,
the indexed certification helper, opposite-edge language levels and full-width draft notices.
Desktop fact dialogs include their indexed entry/approval guidance. Reset-sent now offers a real
resend with pending/error recovery; failed resends do not link to the removed email field.
Recovery-state notices follow the heading with the exact check-circle/warning/clock icons.
Career edit labels now react to locale changes while preserving authored drafts.

Failed-first evidence in the external `t003/d35/` archive: 5 initials failures, 12 original browser
contract failures, 6 missing dialog/resend failures, 4 failed-resend error-link failures,
2 draft-notice placement failures and 6 recovery-state order/icon failures. Harness setup failures
are excluded. The corrected regressions pass on the rebuilt isolated Chrome runtime.

Focused results: web 409 passed; utils 123 passed; tooling 262 passed with 32 prerequisite skips.
The affected 14-spec browser run passed 132 tests, with 1 gated unsafe-AI capability test skipped,
0 failures and 0 flaky cases. Lint, 22 workspace typechecks, Knip, boundaries, scoped formatting,
copy bindings, roadmap validation and production builds pass.

Fresh Arabic captures cover 28 desktop/mobile screen and dialog targets after font loading,
with zero horizontal overflow. Fresh English S17 captures also have zero horizontal overflow;
the real empty library is explicitly distinguished from the populated English Figma fixture.
References, captures and comparisons are in external `t003/d35/`; the D35 differences record
classifies retained capabilities, data integrity and gates. No dark-theme visual equivalence or
unmapped dialog parity is claimed. S17's indexed empty-title wording conflicts with the live
override; the deck remains unchanged for owner copy review (A13). PR checks are reported separately.

The first D35 CI browser run passed 183 tests but failed one MFA continuation (one gated skip).
The login page changed the SPA route while the auth client's MFA hook started a document redirect,
destroying the capture's execution context. The hook now owns that redirect; its validated callback
and standalone reauthentication flag remain intact. Two competing-route regressions and two missing
reauthentication-parameter cases failed before the fix; all 25 focused auth tests now pass.
The browser flow also requires a visible OTP control before capturing, retaining every existing
authentication, session-isolation and post-verification access assertion.
The rebuilt affected browser set remains 132 passed / 1 gated skip. All four MFA locale/width
cases passed five repeats each (20/20); an independent read-only review approved the redirect fix.
