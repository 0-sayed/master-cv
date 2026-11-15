# T009 account/data controls — execution evidence

## Design-consistency sweep (2026-11-14)

Scope: B-C01, B-C12, B-O01, B-O02 and B-O05; accessibility and persistence checks support A06/A07 without changing their production gates. This sweep replaces duplicated control composition across T009 account/security/devices, credential and proof dialogs, privacy/export/deletion, help, Trash and private pictures. The inventory and visual evidence below supersede earlier pending T009 surface-matrix notes; historical test runs remain historical.

### Shared-component inventory

| Surface                                                             | Shared components used                                                                                                      | Status                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Account profile, inline saved/invalid/failed fields                 | `SettingsSection`, `SettingsRow`, `SavedField`, `Input`, `Label`, `Button`                                                  | Verification in progress |
| Picture upload, removal and failure                                 | `Avatar`, `AvatarFallback`, `Button`, native hidden file input                                                              | Verification in progress |
| Security, connected devices and unavailable/retry states            | `SettingsSection`, `SettingsRow`, `PrivacyNotice`, `Button`                                                                 | Verification in progress |
| Passkey name, rename and destructive removal prompts                | `ConfirmDialogProvider`, `AlertDialog`, `Input`, shared footer                                                              | Verification in progress |
| Password change, error and unsaved guard                            | `TaskOverlay`, `PasswordInput`/`InputGroup`, `FormItem`, `AccountFormError`, shared footer                                  | Verification in progress |
| MFA password, setup/manual key, OTP/error, backup codes and disable | `Dialog`, `FormItem`, `PasswordInput`, `InputGroup`, `OTPField`, `Input`, `ActionGroup`, `AccountFormError`, `DialogFooter` | Verification in progress |
| MFA sign-in continuation and backup recovery                        | `AuthHeading`, `FormItem`, `OTPField`, `Input`, `Label`, `Checkbox`, `DialogFooter`                                         | Verification in progress |
| Email change, pending old/new verification and result notices       | `Dialog`, `FormItem`, `PasswordInput`, `OTPField`, `PrivacyNotice`, `PublicShell`, shared footer                            | Verification in progress |
| Fresh proof with password/MFA/passkey and recovery notices          | `TaskOverlay`, `FormItem`, `PasswordInput`, `OTPField`, `PrivacyNotice`, shared footer                                      | Verification in progress |
| Privacy/storage groups and export lifecycle/retry states            | `SettingsGrid`, `SettingsSection`, `Accordion`, `Alert`, `ActionGroup`, `Button`                                            | Verification in progress |
| Deletion review, proof, final confirmation and receipt              | `ReviewSection`, `Label`, `Checkbox`, `DialogFooter`, `PrivacyNotice`, `PublicShell`                                        | Verification in progress |
| Help intake, failure/retry and persisted receipt                    | `PublicShell`, `FormItem`, `Input`, `RadioGroup`, `Label`, `Textarea`, `PrivacyNotice`, `Button`                            | Verification in progress |
| Trash empty/populated/error, single/selected/all confirmations      | `PageHeader`, `DocumentRow`, library layout/notice, `Checkbox`, `Button`, `AlertDialog`                                     | Verification in progress |

### D36 decisions

- D36: compose both password modes with the established sign-in `InputGroup` pattern so the eye action stays inside the field at the logical inline end in RTL/LTR.
- D36: preserve `InputGroupInput`'s owning data slot when composed through `FormControl`, restoring the shared focus-ring selector instead of adding a local ring override.
- D36: group label/field pairs through `FormItem`; its horizontal variant and shared checkbox/radio labels own the 44px touch area without caller control-size overrides.
- D36: use shared 44px OTP segment height and `DialogFooter` body/action inset so all credential/proof dialogs keep equal-height actions and clear separation.
- D36: render backup codes through read-only shared `Input` controls and their actions through `ActionGroup`, replacing hand-styled code boxes/buttons.
- D36: use semantic shared `Alert` variants for export lifecycle statuses and shared `AvatarFallback` tokens for pictures, removing local visual imitations.
- D36: let shared `SettingsRow` action wrapping own narrow layouts; use the default shared Trash back action instead of local typography, padding and icon sizing.
- D36: keep review-deletion navigation neutral and reserve danger variants for the actual destructive deletion/passkey-removal commits; ordinary task cancellation remains neutral.
- D36: retain approved contextual cancellation labels for the shared unsaved guard (Leave/Stay) and Trash confirmations (Keep in Trash), rather than replacing their copy with a generic Cancel.
- D36: use shared touch-sized link/button variants for public help and deletion-receipt navigation instead of undersized standalone text links.
- D36: keep Trash navigation stable even at zero items, with the existing active-link component and positive-only count badge; localizing full count messages through ICU handles Arabic grammatical categories.

### Design references and verification

Live authorized renders inspected: account [S28 desktop 37:2877](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-2877), privacy [S29 desktop 37:3088](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3088), deletion [S30 desktop 37:3225](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3225), receipt [S31 desktop 37:3360](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3360), help [S36 desktop 82:3791](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-3791), adjacent password recovery [80:28869](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-28869). Mapped mobile masters: S28 `49:1716`, S29 `49:1825`, S30 `49:1887`, S31 `49:1948`, S36 `82:3910`; adjacent email pending `80:29876`/`80:30259`, devices `258:33773`/`259:15281`, export preparing `80:29999`/`80:30352` and ready `80:30079`/`80:30417`, deletion proof `565:37051`/`565:37200` and confirmed `565:37515`/`565:37673`, help sent `82:8976`/`82:9064`. Trash uses the implemented shared library layout; no unseen Figma frame is claimed.

Verification results and archived visual coverage are recorded after the final affected-case run and screenshot inspection.

## Browser QA round 2 (2026-11-14)

- **Localized account failures (B-C01/B-O01/A07):** password/MFA dialogs and account profile/passkey boundaries previously rendered provider exception text. They now accept stable error codes only through the shared auth mapper, with ar-SA/en-US copy-deck and Lingui entries plus a localized unknown/transport fallback. Audited email change, proof, export status/request/download, deletion and help intake: these already render fixed localized recovery notices and never provider messages. Existing preservation/retry regressions pass alongside new code/failure-shape/locale tests.
- **Mobile retry (A07):** password/MFA form errors used viewport toasts over sheet actions. Shared `AccountFormError` now composes the existing warning icon, title, explanation and retry controls in the dialog flow, focuses the notice and preserves inputs. Live Figma mobile password error [80:28869](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-28869) inspected. D36: use the shared inline recovery pattern instead of an overlay so retry and the primary action remain available. Personally inspected AR/EN password-error screenshots at 1440/390; browser assertions verify localized copy, no toast, actual primary-button hit testing, keyboard focus and no dialog overflow.
- **Real UI coverage (A06/A07/A12):** new `account-credential-recovery.spec.ts` completes MFA enrollment and post-password login continuation in AR/EN at 1440/390; `consumed-proof-recovery.spec.ts` drives proof, replay rejection and fresh confirmation through the UI (fixture consumption models another tab). Trash restore now uses its real menu action, reloads and checks privacy plus preserved versions. It exposed retained public-download eligibility: restore now atomically clears both public flags. A DB regression failed with `show_download_buttons=true` before that fix and passes afterward. No publish/revision gate changed.
- **Verification:** affected web **69/0/0**, affected API **96/0/0** (all three test DB variables explicitly use the authorized localhost:55432/postgres admin URL); `pnpm validate:static` PASS (format/lint, 22 workspace type tasks, Knip/boundaries); copy bindings PASS (0 diagnostics). Localization/inline-error regressions were observed failing before implementation. Full requested six specs plus the two new specs initially **23/5/0**; four failures were a test assertion's wrong deletion-column name, one was the restore product bug. Corrected the column to `subject_user_id`, preserved the privacy assertions and rebuilt only the changed server. Failed-case rerun **5/0/0** with `--skip-build`: **28 unique browser cases passing, zero skips**. Public sharing passes. Logs, JUnit and 33 screenshots (including the live Figma render) are retained in ignored `test-results/t009-round-2/`; runner-created temporary directories were removed. No environment files, paid/real provider calls, staging, commits or pushes.

Executed focused checks with `PATH=/home/weights/.nvm/versions/node/v24.22.1/bin:$PATH` and unit/static preload `NODE_OPTIONS=--import=/mnt/storage/master-cv/tooling/local/test-isolation.mjs`:

```sh
pnpm --filter web test src/features/auth/errors.test.ts src/dialogs/auth/change-password.test.tsx src/dialogs/auth/enable-two-factor.test.tsx src/dialogs/auth/disable-two-factor.test.tsx src/dialogs/auth/change-email.test.tsx src/dialogs/auth/confirm-account-access.test.tsx src/features/settings/account src/features/settings/privacy src/features/help
INTEGRATIONS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres COVER_LETTER_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres OAUTH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres pnpm --filter @reactive-resume/api test src/features/privacy src/features/auth src/features/documents/trash-lifecycle.integration.test.ts src/features/documents/service.test.ts
pnpm validate:static
pnpm --filter @reactive-resume/tooling copy:check:bindings
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs tests/e2e/specs/account-security.spec.ts tests/e2e/specs/account-data-rights.spec.ts tests/e2e/specs/privacy-help.spec.ts tests/e2e/specs/private-picture-delivery.spec.ts tests/e2e/specs/trash-retention.spec.ts tests/e2e/specs/public-sharing.spec.ts tests/e2e/specs/account-credential-recovery.spec.ts tests/e2e/specs/consumed-proof-recovery.spec.ts
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs --skip-build tests/e2e/specs/consumed-proof-recovery.spec.ts tests/e2e/specs/trash-retention.spec.ts --grep 'replayed deletion proof|restoring a formerly shared'
```

Optional cleanup of the two disposable browser databases was blocked by automatic approval review because database deletion is permanent; those local test databases remain.

Round-2 requested issues are resolved; broader product qualification and production approval gates below are unchanged. The existing password-title markup artifact remains outside this error/recovery change.

## Host-validation corrections (2026-11-14)

This section supersedes the earlier public-sharing failure and root-CI-not-run status below; earlier execution records remain historical.

- **Hermetic API tests:** reproduced the exact root command's 41 failures (1052 passing). Ambient `APP_URL` differed from the fixtures' `localhost:3030`, causing 28 origin denials, blocked-mail timeout/cascades and legacy-picture `FILE_UNAVAILABLE`; missing synthetic encryption configuration caused `PRIVACY_ENCRYPTION_UNAVAILABLE`. The API Vitest project now supplies explicit synthetic origin/auth/encryption configuration before imports. Account ownership tests now migrate their own disposable database instead of cloning stale shared OAuth tables (three missing-column failures). The career fixture's DB mock now exposes its own real `getPool`, fixing event-publication mock errors. The subsequently reached server OAuth flow had four more stale-column failures against the selected shared OAuth database. It now creates/migrates/drops its own UUID database on the designated instance and supplies explicit synthetic origin/auth/encryption config; its unchanged four assertions/cases pass, with mandatory DB setup instead of skip/early-return paths. Focused regression run: **121/0/0**, 20 files. A later full run also reproduced an independent worker-test race: its 30ms deadline could expire during DB setup, before the test's awaited input callback. The deadline case now arms a controlled timeout signal and advances its clock only after input is entered (within the active lease); unchanged 250ms completion, terminal-state and zero-egress assertions remain, with extra timer-argument bounds and early-worker-exit detection. Worker lifecycle regressions: **5/0/0**. The original held-email timeout was a separate consequence of origin rejection. CI's unit job now invokes the root guard/command and maps its disposable Postgres to the required `55432`; test cache inputs no longer include environment files. No GitHub workflow execution is claimed.
- **Remaining root-CI dependencies:** after API passed **1093/0/0**, the root run exposed `STUDY_FREEZE_CHANGED`: the existing deletion-safe accounting change in `operation-worker.ts` no longer matched the evaluation seal. Created `tasks-v1-private-accounting-v31`, binding that worker and its new account-state helper; preserved the prior seal/receipt as verified immutable Git blobs in `freeze-history.json`, retained historical core bytes and kept approval UNAPPROVED. Fresh deterministic scans: **1056 full / 699 scoped / 108 canary controls, zero failures**; the receipt also retains its original 72 scoped canary controls. No golds, prompts, scoring, model pins or assertions changed. The privacy-bootstrap tests now import Vitest instead of `node:test`, so the root runner counts their three unchanged cases. Focused seal/CLI/startup/bootstrap regressions: **15/0/0**, four files. Known-failing root attempts were interrupted before the final complete rerun. The root also caught three new visible query-loading paragraphs in security, privacy and deletion: existing guard RED **1 failed / 1 passed**, then GREEN **2/0/0** after replacing them with the shared `QuerySkeleton` and retaining their accessible localized labels; affected component regressions **13/0/0**. D36: use the established pending-state component, preserving successful-empty/error/ready behavior and copy.
- **Publish-review fixture:** retained the current-revision gate. T009 requires restored documents to remain private until an owner deliberately re-enables sharing; the revision check prevents stale pre-restore requests from republishing them. The fixture now reads the saved resume and supplies `expectedUpdatedAt`, using the existing owner review protocol without exposing a public launcher. Existing DB regression asserts missing-review rejection and explicit current-revision publication; the visitor PDF-count browser reproduced RED then passed GREEN.
- **Dialog cancellation:** four failing component regressions preceded the fix; final **8/0/0** across three files. Password change, MFA enable setup/backup and MFA disable now use neutral secondary Cancel through the existing guarded close handler and shared direction-aware footer. Email change, access confirmation, deletion confirmation and passkey prompts already provide neutral cancellation. B-C01/B-O01/A07; live Figma password master [80:28712](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-28712), mapped adjacent mismatch `80:28832`, mobile default/mismatch `80:28747`/`80:28869`; S28 `37:2877`/`49:1716`. D36: retain implemented shared dialog/sheet layouts and add the missing secondary action without local sizing/style overrides.

Browser validation reused existing server output and rebuilt only the changed frontend after UI corrections, with `--skip-build` on browser runs. The six requested specs finally passed **16/0/0 in one run (42.7s)**, including four added AR/EN × 1440/390 credential-dialog cases, keyboard Cancel and unchanged MFA enrollment after cancellation. Earlier, those four new cases encountered an ambiguous toast/dialog selector; scoping to action footers corrected the selector without weakening assertions. Inspected all **20 screenshots** (password, MFA setup, backup, verification, disable in each locale/viewport): labels fit, Cancel is neutral, footer direction/order is correct and dialogs have no horizontal overflow. This qualifies the changed dialogs only, not the previously pending whole-product state/sentinel matrix. Logs and screenshots are retained locally under ignored `test-results/t009-account-data-controls/`.

Executed acceptance commands from the actual checkout (not the earlier source snapshot):

```sh
COVER_LETTER_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres INTEGRATIONS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres OAUTH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/job_language_oauth_current pnpm test:ci
pnpm validate:static
PATH=/home/weights/.nvm/versions/node/v24.22.1/bin:$PATH E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs --skip-build tests/e2e/specs/account-security.spec.ts tests/e2e/specs/account-data-rights.spec.ts tests/e2e/specs/privacy-help.spec.ts tests/e2e/specs/private-picture-delivery.spec.ts tests/e2e/specs/trash-retention.spec.ts tests/e2e/specs/public-sharing.spec.ts
```

An earlier targeted retry used `--skip-build tests/e2e/specs/account-security.spec.ts --grep 'neutral Cancel'` (**4/0/0**); the final six-spec run supersedes it. `pnpm validate:static` passed format, lint, all 22 workspace type tasks, Knip and boundaries (2167 files/23 packages).

Final exact-root acceptance: **6601/0/32**, exit **0**, **20/20 workspace tasks successful** (13 unchanged task results reused from Turbo cache). The 32 skips are existing document-qualification cases only: month ranges 7, nested ranges 20, round-10 headers 4, round-9 display 1. All **319 integration cases plus five DB worker cases passed**, with **zero skipped DB tests**. API, DB and tooling reran under the existing cache-bypass policy. Counts below are pass/fail/skip; logs and parsed counts are in ignored `root-ci-final.log` / `root-ci-summary.json` beside the browser evidence.

| Workspace                    | Pass/fail/skip |
| ---------------------------- | -------------- |
| `utils`                      | 123/0/0        |
| `ui`                         | 81/0/0         |
| `fonts`                      | 9/0/0          |
| `schema`                     | 129/0/0        |
| `resume`                     | 270/0/0        |
| `ai`                         | 7/0/0          |
| `pdf`                        | 686/0/0        |
| `odt`                        | 22/0/0         |
| `docx`                       | 22/0/0         |
| `import`                     | 125/0/0        |
| `env`                        | 45/0/0         |
| `db`                         | 31/0/0         |
| `email`                      | 11/0/0         |
| `auth`                       | 41/0/0         |
| `api`                        | 1093/0/0       |
| `mcp`                        | 20/0/0         |
| `web`                        | 962/0/0        |
| `tooling`                    | 2744/0/32      |
| `server`                     | 174/0/0        |
| `dsh-plugin-reactive-resume` | 6/0/0          |

All correction work stays uncommitted; no staging/push, direct `.env*` reads, `--env-file` launches, real inference/email/SMS/provider calls or database connections outside the designated disposable instance were used. Cleanup was attempted but automatic approval review blocked database deletion and literal-path temporary-file removal as destructive operations; the six owned browser databases/roles and temporary artifacts remain. Exact owned names/paths are in ignored `test-results/t009-account-data-controls/cleanup-pending.json`. No deletion guard was bypassed.

Plan: `docs/superpowers/plans/2026-11-14-t009-account-data-controls.md`.
Baseline `a2c505d53675eb23ab313612298123ab3965a51c`; branch `feat/t009-account-data-controls`.
Execution spans two sessions: the first stopped during Task 12; this continuation preserved the uncommitted tree, reviewed Tasks 1–11, corrected gaps and implemented remaining work. Nothing was staged, committed, pushed or shipped.

## Task disposition

| Task | Implementation and verification                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Privacy migration/schema, restricted roles, explicit bootstrap and Turbo selector/cache coverage. Schema/account-state/owner-scope/bootstrap/cache tests pass. Shared provisioner is `@reactive-resume/db/runtime-role`, with explicit tooling dependency. |
| 2    | Purpose/session/nonce/expiry/single-use proof using actual pinned password/MFA/passkey verification. Access and cryptographically signed passkey integration pass; browser virtual authenticator passes.                                                   |
| 3    | Durable old-address then new-address verification, collision/cancel/resend/supersede/expiry and safe session revocation. Account changes: 11 passing DB cases, including held-mail deletion race.                                                          |
| 4    | File ownership/digest, private delivery, bounded reference-based legacy adoption, durable removal and interrupted-write recovery seam. Storage integration and anonymous/foreign/revoked browser delivery pass.                                            |
| 5    | Transactional private restore and recorded scheduled purge. Integration/browser prove formerly shared language-copy restore/history/sharing-off and timer purge without a trash visit.                                                                     |
| 6    | Schema-enumerated safe snapshot and complete archive inventory. Full two-owner graph proves credential exclusion, no-FK handling, orphan inclusion, missing-file failure and isolation.                                                                    |
| 7    | Durable export/delivery/retry/expiry and localized offline notices. Delivery integration: 3 passing cases including held storage across deletion; ZIP/offline-mail browsers pass.                                                                          |
| 8    | Admission barrier, queued/running cancellation and late accounting without result publication. Admission/fence/AI tests pass. Two held career/agent tests exercise actual restricted SQL publication, not full provider-worker transports.                 |
| 9    | Active erasure, minimal append-only replay, restricted recovery access, processor/renewal seams and scheduler. Full graph/deletion/replay pass; actual backups/external integrations gated.                                                                |
| 10   | Durable anonymous/authenticated support and attributable restricted access. Support integration and persisted receipt/error browser pass.                                                                                                                  |
| 11   | S28 shared settings/security, explicit unknown/error/ready, verified email/devices. Web tests and all 10 settings browser cases pass; MFA/password mutations refresh security query.                                                                       |
| 12   | S29–S31 privacy/status/proof/deletion/receipt implemented and tested. Obsolete unused client ZIP cleanup remains approval-blocked.                                                                                                                         |
| 13   | S36 public help, bilingual operational copy, truthful draft-policy state and deep links. Units/copy/browser pass; no legal approval claimed.                                                                                                               |
| 14   | Five new specs/all 11 new cases pass. Latest affected union: 24 pass / 1 fail / 0 skip. Existing public-sharing fixture hits gate; separate visual matrix pending.                                                                                         |
| 15   | Evidence/lifecycle/browser handoff prepared. Final checks below. T009 stays pending until later authorized shipment; Deep/CI and visual completion not claimed.                                                                                            |

## Isolation and executed checks

No `.env*` content read or `--env-file` used. Node 24.22.1/pnpm 12.14.0 children used allowlisted environment, synthetic secrets, loopback app/local storage, `TEST_INFERENCE_ISOLATION=true` and `tooling/local/test-isolation.mjs`. Only scripted transports and loopback `.test` sink; no paid inference, real email/SMS or processor calls.

All three DB selectors (`COVER_LETTER_TEST_DATABASE_URL`, `INTEGRATIONS_TEST_DATABASE_URL`, `OAUTH_TEST_DATABASE_URL`) selected `postgresql://postgres:postgres@localhost:55432/privacy_final_acceptance`, prepared with `node tooling/local/prepare-privacy-tests.mjs`. Suites create isolated databases/roles on that instance only. Browser admin uses the same designated instance's `postgres` database and fresh restricted `ci_browser_*` databases. Zero skipped DB cases, including inherited selector-controlled suites.

Root static/build ran in `/tmp/account-controls-review-source`, a source snapshot including intended uncommitted files. Environment files, credentials, caches/reports excluded by pathname before opening/copying; workspace links remain inside snapshot. Host launchers: `/tmp/run-private-tests.py`, `/tmp/run-private-snapshot.py`, `/tmp/create-privacy-snapshot.py`, `/tmp/run-account-browser.py`.

Counts are pass/fail/skip. Focused retries overlap full suites and must not be summed.

| Command under isolation                                                                                       | Result                                                                                                                      | Host log                                                                  |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `pnpm --filter @reactive-resume/api test`                                                                     | 1089/0/0, 129 files; includes 280 DB cases in 47 integration files plus 5 DB worker cases                                   | `/tmp/account-api-final.log`                                              |
| `pnpm --filter @reactive-resume/api test src/features/privacy` after final helper/new tests                   | 72/0/0, 17 files: 68 DB + 4 inventory units; four added cases increase unique API coverage to 1093 across full/focused runs | `/tmp/account-privacy-final.log`                                          |
| `pnpm --filter @reactive-resume/api test src/features/storage/ownership.integration.test.ts` after relocation | 8/0/0 DB cases                                                                                                              | `/tmp/account-picture-registry-final.log`                                 |
| `pnpm --filter @reactive-resume/auth test`                                                                    | 41/0/0; includes 7 DB email/auth cases                                                                                      | `/tmp/account-auth-tests.log`                                             |
| `pnpm --filter @reactive-resume/db test`                                                                      | 31/0/0; includes 24 DB cases in 5 integration files                                                                         | `/tmp/account-db-tests.log`                                               |
| `pnpm --filter @reactive-resume/email test`                                                                   | 11/0/0                                                                                                                      | `/tmp/account-email-tests.log`                                            |
| `pnpm --filter web test`                                                                                      | 958/0/0                                                                                                                     | `/tmp/account-web-final.log`                                              |
| Focused settings/proof/privacy after final UI edits                                                           | 19/0/0; separate MFA refresh assertion also passed                                                                          | `/tmp/account-settings-final.log`, `/tmp/account-mfa-refresh.log`         |
| `pnpm --filter server test`                                                                                   | 174/0/0                                                                                                                     | `/tmp/account-server-final.log`                                           |
| `pnpm --filter @reactive-resume/pdf test`, then failed unicode file                                           | Initial 685/1/0: zh-CN 60s timeout under concurrent load; focused unchanged unicode file 2/0/0                              | `/tmp/account-pdf-tests.log`, `/tmp/account-pdf-retry.log`                |
| Scoped tooling copy/Arabic/delivered-copy/bootstrap/browser-env/cache                                         | 54/0/0                                                                                                                      | `/tmp/account-copy-tests.log`                                             |
| `pnpm --filter @reactive-resume/tooling test local/database-roles.test.mjs local/ci-browser.test.mjs`         | 9/0/0                                                                                                                       | `/tmp/account-role-helper-tests.log`                                      |
| `pnpm --filter mobile test`                                                                                   | 10/1/0: missing iOS Pods Hermes compiler on Linux                                                                           | `/tmp/account-native-tests.log`                                           |
| `pnpm validate:static` in snapshot                                                                            | PASS: format/lint/22 workspace types/Knip/boundaries; 0 failed stages                                                       | `/tmp/account-static-qualified.log`                                       |
| Affected browser commands in handoff                                                                          | Latest unique 24/1/0; all 11 new pass                                                                                       | `/tmp/account-browser-qualified.log`, `/tmp/account-browser-recovery.log` |
| `python3 Planning/roadmap/check.py`                                                                           | PASS: 0 errors, 8 pending/8 completed, T009 pending                                                                         | Final verification                                                        |

No native source excluded. Initial PDF/native/browser failures are reported. `pnpm test:ci`, full browser/document-artifact CI suites not run: Deep belongs before a future authorized commit; CI is authoritative.

## Corrections and review

Observed RED included proof/privacy/help behavior, stale passkey challenge cookies, resend token uniqueness, public deep-link 404s, deletion double submit, missing archive references and security invalidation. Corresponding focused suites passed after fixes. Browser corrections cover shared email-row alignment/action sizes, stale Arabic selector, an accidentally authenticated anonymous fixture and real post-MFA login continuation. Publishing gate was not weakened.

One read-only whole-diff review requested changes. Six findings addressed: abandoned-write settlement; late AI response metadata blocked by deletion trigger; durable file removal/archive exclusion; unlisted known-reference detection; invoked legacy picture adoption; security refresh after MFA/password changes. Regressions pass; no second review or reviewer approval claimed.

## Requirements, frames and D36

- B-C12: proof/archive/barrier/erasure/S29–S31; privacy access/export/delivery/deletion/full-graph tests plus UI/data-rights browsers.
- B-O01/B-O05: correction/sessions/support/restricted access; account-changes/support integration and security/help browsers.
- B-C01/B-O02 consumed: real credentials/MFA/facts/history/content isolation; pinned auth, whitelist and private language-copy restore. Full UI-language sentinel matrix pending.
- A06: persisted email transitions/support/export work, atomic deletion acceptance and private history restore; account-changes/work/full-graph/document integration and reload browser checks.
- A07: explicit unknown/error/retry and purpose/consent dialogs; component and functional browser evidence. Full bilingual mobile/keyboard/state matrix remains pending, so A07 is not fully qualified.
- A08: anonymous/foreign/revoked file denial, owner-scoped archive and full-graph isolation; storage/export/ACL integration and browser cases. No Arabic PDF integrity/DOCX approval inferred.
- A11: scripted approved processor/pending behavior with no unapproved fallback; real data-flow/supplier/transfer approval remains gated.
- A12: deletion, restricted support/replay and pending external/backup exceptions; full graph/deletion/recovery ACL tests. T012 actual restore/replay and operational policy/alerts are not established here.
- A13: retained integrations/publication remain gated; no production launchers, publishing enablement or invented provider capabilities.

Personally rendered live Figma: S29 desktop `37:3088`, S30 `37:3225`, S31 `37:3360`, S36 `82:3791`, mobile proof set `566:32717` default/error/expired. [Design file](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni). Other matrix IDs are mapped references, not claimed renders; prior planner provenance is separate.

D36 reasons:

- Existing S28 settings shell/preferences route preserves interface/content language independence.
- Email uses a verified task dialog and durable pending row because a text input cannot establish ownership.
- Email row moved outside its owning two-column field grid for shared alignment without local sizing overrides.
- Settings actions use shared default sizes for peer alignment/touch targets.
- Security query errors have recovery because failure cannot mean unenrolled credentials.
- S29/S30 use real work/status/counts, purpose proof and separate consent because prototype success cannot establish completion.
- Confirm-access returns proof only and cannot submit deletion.
- S31 is a public accepted-request receipt without ID lookup because erasure outlives access.
- S36 uses existing public shell/persisted intake; operational draft copy cannot publish approved policy.
- Existing tooling generates routes; prototype launchers and Google/SMS fixtures are not product capabilities.

## Open blockers and release boundaries

- Separate browser-testing agent's AR/EN × 1440/390 state matrix pending: fonts, touch/focus, overflow, shell alignment and preserved CV sentinels. Functional screenshots cannot replace it.
- Existing `public-sharing.spec.ts` fails 409 at gated publish fixture. T009 cannot enable public sharing. Native test lacks `apps/mobile/ios/Pods/hermes-engine/destroot/bin/hermesc` on Linux.
- Automatic approval review rejected obsolete client ZIP helper removal as requiring approval. `apps/web/src/features/settings/account/export.ts` and its test remain unused, without product callers; cleanup incomplete and not bypassed.
- Interrupted storage cannot be presumed settled by time. Internal `reconcileOwnedFileWrite` requires real adapter/operator confirmation; unknown settlement keeps deletion pending. No production automatic settlement proof or operator HTTP endpoint invented.
- Controller/contact, reviewed AR/EN notices, retention/deletion/backup/support/tombstone rules, operator access, approved processors/transfers and real mailbox/sender remain release gates. Synthetic 30-day policies are fixtures.
- T010 supplies paid-renewal stop; T012 independently preserves replay stream and proves restore/replay. Active erasure does not mean backup erasure.
- Root AGENTS first-shipped rule overrides stale after-merge prose. Only requested brief corrections retained; T009 row/class pending until shipment. D25 email-first controls older mobile wording; SMS/mobile A14–A16 and T008 benchmarking outside scope.

## Final verification

Latest executed checks: static PASS (five stages; 22 workspace type tasks); privacy 72/0/0; ownership 8/0/0; role/browser-environment units 9/0/0. Across full and focused runs, current unique DB coverage is 320 passing cases: API 284 integration + 5 DB-backed worker, auth 7, DB package 24; zero DB failures/skips in their final results. No full/focused double counting.

`git diff --check` passed; `git diff --cached --stat` was empty; branch remains `feat/t009-account-data-controls`. Roadmap checker reported 0 errors. Document-only final changes receive scoped formatter verification; unchanged source suites are not repeated. All work remains reviewable and uncommitted.

## Owner hand-test corrections — 2026-11-14

This section records the subsequent owner fixes only; earlier verification above is historical.

Requirements: B-C12 correction, B-C01/B-O02 account credentials, A06 persisted state and A07 accessible recovery. Current authorized Figma rendering inspected: [S28 desktop, Settings](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-2877). Mapped references, not additional rendered evidence: S28 mobile `49:1716`; email pending desktop `80:29876`, mobile `258:33773`. The supplied broken authenticator screenshot was also inspected.

D36 reasons:

- Authenticator enrollment now presents numbered scan/manual-key/code steps, then backup codes after successful verification, following the owner's explicit sequence.
- QR is fixed-size and centered with a descriptive accessible image name and no hover title; the manual key uses the shared LTR input/action group and announces copy success.
- Shared `OTPField` owns the centered LTR six-segment presentation and one native autofill/paste input. Setup, fresh proof, email correction and MFA login reuse it; labels retain interface direction and Arabic/Persian input normalizes to Latin digits. Verification is explicit, with a shared inline error/retry notice.
- Pending email correction names the address required for the current stage. Transport failure has its own retry status instead of claiming the link is invalid.

Reproduction/root cause: the loopback SMTP capture deliberately returns 550 for recipients outside `.test`. The owner's external destination therefore cannot receive synthetic mail. Previously the old-address approval committed `verify_new` and rotated the capability before this rejection; the HTTP adapter then converted the delivery exception to `invalid`. The sink's recipient restriction remains intact.

Fix: approval and resend deliver inside their database transaction; a failed send rolls back stage/token changes, and the same old-address link retries safely. A hashed consumed-approval receipt reports `verification_sent` or `complete` on repeat/concurrent clicks without sending again. The generated `email_change_approval_receipt` migration adds that receipt field; it was exercised in disposable test databases, not applied to the running demo. Initial-request failure remains recoverable through the persisted pending request and Resend.

Observed test-first failures: original shared OTP rendered six inputs; setup preceded verification with backup codes; Arabic short-code validation surfaced English; missing Arabic catalog entries failed the coverage guard; failed second-mail delivery and consumed-link replay failed the email transition regression. Green evidence:

- Shared OTP: 5 passing tests (`/tmp/t009-otp-green.log`). Web account/proof/privacy/auth tests: 60 passing, followed by the expanded setup file's 6 passing tests (2 additional cases; `/tmp/t009-web.log`, `/tmp/t009-web-final.log`).
- API: 25 passing integration tests across account transitions, actual loopback SMTP, account authentication and passkey proof; final transition/API-output-contract rerun: 14 passing. Auth email flows: 7 passing. Zero integration skips (`/tmp/t009-api.log`, `/tmp/t009-api-final.log`, `/tmp/t009-auth.log`).
- Server auth redirects: 29 passing tests (`/tmp/t009-server.log`). Arabic T009 coverage and delivered-copy bindings: 2 passing (`/tmp/t009-copy-final.log`). Coverage enumerates English source messages and requires a nonempty Arabic translation, including messages missing entirely from the Arabic catalog. Lingui AR/EN extract and catalog compile completed; unrelated catalog gaps are not represented as T009 completion.
- Final `pnpm validate:static`: PASS (format, lint/tokens, all 22 workspace type checks, Knip and boundaries; `/tmp/t009-static-final.log`). Roadmap validation: 0 errors. All commands used explicit synthetic configuration; no environment files, real provider/mail calls, commits, staging or pushes.

Browser attempt stopped at its occupied-port preflight; the existing `:3030` demo was left running. Updated account-security and account-credential-recovery specs cover explicit single-input submission, verification-before-backup, repeat approval clicks, and stage-specific pending notices. These browser changes have **not** run. AR/EN at 1440/390 screenshots and visual verification are **blocked**, not passed; no replacement images were fabricated. Lead command, after freeing the test ports:

```sh
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs tests/e2e/specs/account-security.spec.ts tests/e2e/specs/account-credential-recovery.spec.ts
```

The security spec captures `ar-SA`/`en-US` × 1440/390 `mfa-verify.png` artifacts in its Playwright test output. Deliver those screenshots to `/mnt/storage/master-cv-design-archive/ui-audit/t009-owner-fixes/` after the lead's run. No production processing, email or release gate is approved by these corrections.

## Privacy and Trash owner redesign — 2026-11-14

This subsequent pass covers B-C12/B-O01/B-O05 and the changed A07 surfaces only. Earlier authenticator, email-change and translation work remains in the tree. Fresh proof, deletion review/confirmation, ownership, retention services and release gates remain authoritative.

Privacy now has compact icon accordions, an S36 help link, an actionable JSON/ZIP export card and a final separate danger zone. Export states distinguish absence, pending work, ready with actual expiry, failure/retry and expiry; a ready transition announces an in-app toast and the existing captured email delivery. Timing depends on data size rather than an invented SLA. Public wording says policy/retention periods will be published before launch; it does not expose owner-approval notes. Deletion explains uploads/history, access revocation, processor completion, backup retention and the restricted recovery record, with a download-first link before destructive entry.

Trash now exposes labelled Restore and Delete forever on every item, including stacked mobile cards. Permanent and bulk deletion name their scope and require confirmation. Selection supports restore/delete selected and Empty trash; partial failures retain failed items. Restore refreshes Trash immediately and offers Open while the backend keeps sharing off. Retention is a single Latin-number line, urgent at three days or less; an empty Application column is omitted and a real association appears beneath the name when present. Active document-row behavior has a regression test.

Live Figma inspected in this pass: [S29 master `37:3088`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3088), mobile `49:1825`, ready desktop `80:30079`, preparing mobile `80:30352`, and S30 required-proof state `565:37285`. Adjacent mapped references: export `80:29999/30417`, proof `565:37051/37200`, S30 `37:3225/49:1887/565:37438/565:37515/565:37673`, S36 `82:3791/3910`. These remaining IDs are inventory references, not additional claimed renders. Trash uses the existing shared library rather than a fabricated Figma frame. Refero live research was unavailable because the connection has no active subscription; the owner's supplied research and shared design system informed this pass.

D36 reasons:

- Shared SettingsSection owns full-width card/danger variants and the peer-card grid so storage/export can use available settings width without route-level container overrides.
- Shared accordion rows collapse detail into scan-friendly categories; shared ActionGroup owns narrow full-width actions.
- Account deletion follows storage/export as a separate full-width danger zone, keeping consequences and download-first recovery together.
- Shared document layout owns responsive Trash rows; explicit per-item actions replace hover-only discovery without changing the active list's controls.
- User-supplied document names have isolated text direction inside plain-string confirmations so mixed Arabic/English names retain their order.

Actual export testing exposed the other lane's new `approvedTokenHash` column missing from the personal-data inventory. The inventory deliberately failed closed. Added it to excluded credentials alongside `tokenHash`/`requestNonce`; the existing column-completeness test failed before the fix and all five inventory tests passed after it. The browser downloaded actual revision/attachment bytes and checked that the approval receipt is absent. Email-change behavior was preserved.

Verification for this pass:

- Web units: 987 passed across 177 files; subsequent changed-file runs cover all 21 current privacy/export/Trash row/action tests, including an added active-row regression. Final assertion-type correction reran the four Trash action tests: all pass.
- Inventory: 5 passed. Copy-contract, Arabic-context, delivered-copy and account-copy: 53 passed. AR/EN Lingui extraction/compilation completed; 29 new copy-deck bindings are active. No new English interface copy remains in the changed Arabic surfaces.
- Final `pnpm validate:static`: PASS, including all 22 workspace type checks, format/lint/tokens, Knip and boundaries. Final web/server builds pass. Roadmap checker: 0 errors.
- Both affected browser specs have 13 unique passing cases across the full run and focused recovery runs, not one clean full rerun. Initial failures exposed the inventory omission and over-broad/hydration-sensitive test selectors; those failed cases subsequently passed. The final AR/EN × 1440/390 run passed all 8 layout/interaction cases, including in-app and captured-email notification, named deletion confirmation and actual bulk deletion. Earlier passing cases cover actual archive bytes, offline-mail retry, proof-before-deletion, private restore/history and timer purge. Logs are archived with the screenshots.
- 26 screenshots plus 22 metric files are in `/mnt/storage/master-cv-design-archive/ui-audit/t009-privacy-redesign/`: Privacy none/ready/proof, mobile lower-page views, Trash/confirmation and desktop Account comparison. Personally inspected all 26. Loaded Noto fonts, Latin retention digits, Arabic/English copy, action fit and no horizontal overflow verified. At 1440, Privacy and Account share header/content width 1094 and sidebar width 236; Arabic start edge is the same right edge, English the same left edge. At 390, content width is 354 with document width 390.

The standard command stopped at occupied port 3030; the demo was left running:

```sh
E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs tests/e2e/specs/account-data-rights.spec.ts tests/e2e/specs/trash-retention.spec.ts
```

To complete verification, an environment-file-free source snapshot under `/tmp/master-cv-privacy-verification` used only alternate browser ports 3130/3133, fresh synthetic databases on the authorized localhost:55432 administrator connection, restricted runtime roles and loopback captured SMTP. The repository runner was not changed for this workaround. The snapshot avoids existing dotenv files and the data disk's limited build space; the test isolation guard blocks environment-file loading and real providers. No real email/provider calls, staging, commits or pushes occurred. Production notices, retention policy, mailbox/provider approvals and other existing release gates remain unresolved; this UI pass does not approve them.

## Design consistency sweep — 2026-11-15

This pass resumes the interrupted uncommitted sweep and supersedes earlier blocked visual-verification notes for these surfaces. Scope: B-C12, B-O01/B-O05, credential recovery under B-C01/B-O02, and applicable A06/A07 checks. No account-data service behavior or release approval changed.

The owner-provided screenshots `16.png`, `10.png` and `15.png` were inspected. Password controls now reuse the same `PasswordInput`/`InputGroup` composition as sign-in; the show/hide button and manual-key copy button remain inside the field in both directions. `InputGroup` preserves both wrapper and input slots when composed through `FormControl`, so shared focus/invalid styling, labels and trailing-action layout remain intact. A regression failed before that wrapper-slot fix and passed after it. `SavedField` now uses shared form labels, controls, descriptions and errors rather than recreating them.

The complete surface/control inventory, four-variant image links, lower-scroll captures and geometry are in the [consistency archive](../../master-cv-design-archive/ui-audit/t009-consistency/index.html), [surface table](../../master-cv-design-archive/ui-audit/t009-consistency/surface-inventory.md) and [coverage manifest](../../master-cv-design-archive/ui-audit/t009-consistency/coverage.json). The archive's older `account-consistency/` and `functional/` folders are historical; the current set is `surfaces/`.

| Surface family                                                               | Shared components used                                                                                                              | Status |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Account, security and devices; saved/error/unavailable states                | SettingsSection/Grid, SavedField with FormItem/FormLabel/FormControl/FormDescription/FormMessage, Button, ActionGroup, Notice/Alert | PASS   |
| Password, email, MFA enable/disable and backup codes; inline failures        | TaskOverlay, PasswordInput/InputGroup, FormItem, OTPField, InputGroup trailing action, DialogFooter, AccountFormError               | PASS   |
| Passkey naming/rename/removal and unsaved-change confirmation                | DialogManager prompt/confirmation, Input, AlertDialogFooter, Button semantic variants                                               | PASS   |
| Fresh proof for export/deletion/email; MFA/passkey/unavailable states        | TaskOverlay, PasswordInput/InputGroup, OTPField, Notice/Alert, DialogFooter                                                         | PASS   |
| Privacy, storage categories and all export statuses                          | SettingsSection/Grid, Accordion, ExportStatus/Alert, ActionGroup, Button variants                                                   | PASS   |
| Deletion review/proof/confirmation/count failure and receipt                 | SettingsSection, Notice/Alert, Checkbox/Label, DialogFooter, PublicShell, PageHeading                                               | PASS   |
| Help intake/error/receipt and email-link results                             | PublicShell, SettingsSection/Grid, FormItem, Input/Textarea, RadioGroup/Label, Notice/Alert, Button                                 | PASS   |
| Trash empty/populated/error/recovery and single/selected/empty confirmations | DocumentCardLayout, TrashRow, Checkbox/Label, ActionGroup, EmptyState, Notice/Alert, DialogManager, Sidebar NavLink/Badge           | PASS   |
| Picture upload/removal/failure                                               | Avatar, shared Button and toast                                                                                                     | PASS   |

Live authorized Figma renders inspected in this pass: [S28 desktop `37:2877`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-2877), [S29 desktop `37:3088`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3088), [S30 desktop `37:3225`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3225), [S31 desktop `37:3360`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-3360), [S36 desktop `82:3791`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-3791) and [mobile proof default/error/expired group `566:32717`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=566-32717).

Mapped adjacent inventory references, not additional claimed live renders: S28 mobile `49:1716`, account sheet `85:20241`, email dialogs `80:28603/28628`, pending `80:29876/258:33773`, password `80:28712/28747/28832/28869`; S29 mobile `49:1825`, export `80:29999/30352/30079/30417`, proof `565:37051/37200`; S30 mobile `49:1887`, required/error/expired proof `565:37285/37438/37515/37673`; S31 mobile `49:1948`; S36 mobile `82:3910` and receipt `82:8976/9064`; desktop proof group `566:32463`. Trash reuses the existing document library without inventing a Figma frame. The account sheet uses the existing settings route rather than adding a duplicate editing surface, under D36.

D36 reasons (one line each):

- Shared InputGroup owns inside-field adornments and stable slots; credential dialogs no longer compose an adjacent lookalike eye button.
- Shared DialogFooter owns non-collapsing body separation and direction-aware responsive action placement; task dialogs use one primary action and a neutral Cancel.
- Shared FormItem/FormLabel/FormControl/FormDescription/FormMessage own saved-field alignment, validation styling and accessible associations.
- Shared Alert title/description wrap long addresses in either direction; the mobile overflow regression failed before this fix and passed after it.
- Shared OTPField owns six visual segments over one semantic input, Latin digit normalization, paste/autofill and visible focus across setup, proof and sign-in.
- Shared Label/FormItem own checkbox/radio touch height; shared ActionGroup and SettingsSection/Grid own narrow action stacking and page layout.
- Shared document layout owns responsive Trash rows and explicit touch actions; destructive confirmations retain a neutral recovery action.
- Trash navigation remains visible at zero with active `/dashboard/trash` state; its badge appears only for a positive count.
- ICU/Lingui plurals replace count interpolation for retention, selected/bulk document confirmations and deletion scope, preserving Arabic one/two/few/many forms and Latin digits.

Verification from the env-free temporary source copy (234 changed implementation/test/config files checked against the checkout; only the temporary browser runner differs for alternate ports):

- `pnpm validate:static`: PASS, including 22 workspace type checks, tokens, Knip and boundaries.
- `pnpm --filter web test`: PASS, 177 files / 996 tests. Shared UI: 4 files / 14 tests. Compiled Arabic count-copy regressions: 9 tests, covering 0/1/2/3/10/11/30/100 and Latin digits.
- Web/server builds: PASS. Roadmap checker: 0 errors. Changed-file formatting/lint and `git diff --check`: PASS.
- Browser checks use `ci-browser.mjs --skip-build` at 3130/3133. All 91 unique selected cases passed across focused reruns: 53 requested functional cases, 20 four-variant inventory cases and 18 additional bilingual/shell regressions. The initial mobile auth context and subsequent geometry false positives were corrected in the test harness; the last two touch privacy cases passed. This does not claim a single uninterrupted all-green run. Per-case results and run history are in [verification.json](../../master-cv-design-archive/ui-audit/t009-consistency/verification.json).
- Current evidence: 77 surfaces × ar-SA/en-US × 1440/390 = 308 base images, plus 142 lower-scroll images; 450 screenshots personally inspected, no missing variants. Native touch contexts verify effective 44px targets (including enclosing radio labels, clicked at their outer corners), inside-field adornments, equal footer action heights, at least 16px body/footer separation, no clipped control/notice text, correct fonts/direction and shell alignment. Focused control captures and shared control regressions cover focus treatment.

No `.env*` files were read, real providers called, demo processes killed, or changes staged/committed/pushed. Only the authorized local PostgreSQL admin connection was used; browser fixtures create synthetic isolated databases there. A01–A16 and production processing/deployment gates remain unchanged. Automatic approval review rejected removal of the eight synthetic databases as permanently destructive; their exact names and roles are recorded in `verification.json`.

Temporary-file cleanup: PASS. All nine session-created `/tmp` roots were removed by literal paths, and their absence was verified. The eight synthetic databases/roles remain because automatic approval review rejected permanent database removal; no production data was used.

## Empty states and settings follow-up — 2026-11-15

Scope: B-C12, B-O01 and B-O05; consumes B-C01 and B-O02. This follow-up preserves the existing T009 worktree and security contracts. Nothing is staged, committed or pushed. No release or production-processing approval is asserted.

Live authorized Figma renders inspected for this follow-up: [Documents first use `52:1182`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=52-1182), [Account `37:2877`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=37-2877), and [email-change pending `80:29876`](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=80-29876). Adjacent mapped settings, proof, export and recovery states remain the inventory recorded above; no additional live renders are claimed. The owner's supplied screenshot files were unavailable at the supplied temporary paths.

D36 reasons (one line each):

- Shared `EmptyState` now owns the decorative icon, heading, description, responsive actions and compact density; first-use Documents offers New CV and PDF import, while filtered results offer clearing the query.
- Career sections, knowledge, offers, applications, upcoming interviews, insights, contacts, Trash and the successful no-export result use that component; loading, failed and stale lookups retain explicit recovery UI.
- Help has an intake form and persisted receipt, with no user-facing intake-history collection to restyle; no fictitious history or placeholder state was added. Export shows the actual latest request rather than inventing an archive.
- Account reuses full-width shared settings cards and existing blur-to-save fields with visible saved/unsaved/saving feedback; its LTR username prefix comes from configured `APP_URL`, not the browser host.
- Security rows use shared icons/status badges and real enrollment/session state; devices expose recognized browser/platform labels without returning raw user-agent metadata, and omit unavailable location rather than guessing.
- Preferences uses shared selectable appearance previews, independent interface-language guidance, searchable timezone selection, current-time preview and the existing saved toast; the device-timezone action uses the existing wrapping `row` button size so Arabic text fits.
- Authenticator setup uses shared `DialogSteps` insets/rhythm, a white four-module QR quiet zone, and the existing direction-aware dialog footer spacing.
- Email outcomes reuse a focused public shell and shared `StatusCard`, with actual resend/retry and navigation actions; verified current/pending addresses are shown only when available from authenticated services, never inferred from invalid, expired or cancelled URLs.

English and Arabic strings are in the copy deck and Lingui catalogs. New owner-requested wording remains marked for owner review in the copy deck; it does not approve prices, suppliers, DOCX, public sharing or mobile recovery. A01–A16 remain unchanged.

Functional verification is recorded separately from visual evidence in [verification.json](../../master-cv-design-archive/ui-audit/t009-empty-states/verification.json). Checks ran from an env-free source copy under `/tmp`, using the approved local PostgreSQL URL only and alternate application/mail ports 3130/3133. The application build was reused across browser checks. No `.env*` file was read and the running demo on 3030/3033 was not stopped.

Results: static validation PASS (22 workspace type checks, tokens, Knip and boundaries); web units PASS (177 files / 996 tests, then 16 career and 26 settings tests after their refinements); 36 requested browser cases plus 7 follow-up cases PASS across targeted runs; roadmap checker 0 errors; `git diff --check` PASS. All 255 changed source files matched the isolated validation copy. The initial virtual-passkey export timeout was resolved by starting the existing synthetic queue worker; its focused rerun passed. The final six-case screenshot/interaction run passed without failures.

The screenshot manifest and bilingual 1440/390 images are in [the follow-up archive](../../master-cv-design-archive/ui-audit/t009-empty-states/screenshots.json). Visual review covers shared empty cards, distinct no-results actions, all seven email outcomes, Account/Preferences and authenticator setup, including lower-scroll content. Functional checks cover actual CV creation entry, query recovery, theme selection, persisted device timezone, authenticated email resend after the unchanged cooldown, and completed email replacement.

All 100 final PNGs were personally inspected through bilingual contact sheets. The inspection corrected the Arabic device-timezone button's wrapping and a premature desktop Insights capture. No horizontal page overflow remained in the four capture variants; fonts/direction, card/header alignment, action labels, dialog insets and QR/footer spacing were checked separately from functional smoke.

Follow-up cleanup: PASS. The literal owned scratch root `/tmp/master-cv-ui-polish` is absent; temporary application/mail ports 3130/3133 are closed and the queue worker is stopped. The synthetic runtime role was removed after verifying that it owned zero objects; the applied test schema was preserved. No demo process was signalled. The screenshot archive and verification record remain outside the checkout.

## Host validation repairs — 2026-11-15

Scope: the five reported failures for B-C12, B-O01 and B-O05, including both mobile privacy variants. Existing T009 changes, assertions and A01–A16 gates are preserved. The relevant account/privacy masters and adjacent export states remain the mapped inventory above; this repair does not claim new live Figma inspection or a layout redesign.

- Passkey status now uses the existing inline badge `QuerySkeleton`; no loading-classification guard was changed.
- Partition discovery failed because root-owned browser specs could not resolve the schema workspace. The root dependency and lockfile now declare it, and all nine new T009 specs have partition timing entries. The unchanged exactly-once discovery assertion passes.
- Fresh scoped AR/EN extraction and the existing deck synchronization align delivered bindings and catalogs. Removed source identities are no longer active bindings; superseded deck entries remain as design references. Pending copy approvals are unchanged.
- The mobile export toast was the correct success notification. The Confirm button leaves the synthetic mouse over the mobile toast, which pauses Base UI dismissal. Moving the pointer outside it preserves both the success-text assertion and the unchanged zero-toast assertion.

Verification used an env-free `/tmp` source copy matching every current source file, the authorized local PostgreSQL instance, synthetic data and alternate ports 3130/3133. Static validation passed; web units passed 177 files / 996 tests; roadmap validation reported 0 errors. The three reported tooling guards pass in the checkout (6 tests). The complete tooling run finished with 2,739 passes / 38 skips / 8 temporary-harness failures: two port-expectation failures and six Git-context failures across three files. Those three files were rerun in the checkout: 17/17 passed, leaving 2,747 unique passing tests and no unresolved tooling failure. This is a full run plus focused infrastructure rechecks, not a single uninterrupted green run.

The first broad browser process was interrupted after 13 account-consistency cases. Completed cases were retained and only its remaining seven cases were selected separately. The other 66 selected cases completed: 63 passed, with three pre-existing avatar fixtures rejected by the validated account-write gate. All seven account-data-rights cases passed, including AR/EN privacy at 1440 and 390. No assertion or production security gate was weakened.

Local tooling recovery: pnpm unexpectedly began dependency verification/reinstallation after the manifest correction. That process was stopped; matching installed dependencies were recovered from the existing sibling checkout, with ignored `node_modules/.pnpm` now linked to its installed store. No dependency versions were upgraded. The owner demo process was not signalled, no `.env*` file was read, and no real provider was called. Nothing was staged, committed or pushed.

All nine new T009 specs completed across those runs: **57 passed / 6 failed (63 unique cases)**. The six remaining account-consistency failures are four secondary-device fixtures that expect “Other device” while their default user agent is recognized, and two desktop geometry checks that reject the deliberately ellipsized profile name. These were outside the five supplied failures and were not changed. The additional legacy/shell/settings selection contributed 20 passes / 3 avatar-fixture failures.

Synthetic browser databases retained on the authorized local instance: `ci_browser_1794722631805_94bdd0` (initial interrupted setup), `ci_browser_1794722649745_b41373`, `ci_browser_1794722839176_f06038`, `ci_browser_1794722987516_ca9610`, `ci_browser_1794723240690_1720e8`, and `ci_browser_1794723505289_af91ed`; restricted role names use the corresponding `ci_browser_runtime_` suffix. These are synthetic test artifacts, not owner-demo databases.

Cleanup verification: the owned source snapshot and six browser artifact roots are absent; alternate ports 3130/3133 are closed. The owner demo on 3030 returns HTTP 200; port 3033 was closed at the final check. No owner process was signalled. Temporary launchers, diagnostic copies and logs were removed after results were recorded here. Final changed-file formatting/lint, roadmap validation and whitespace checks passed; the staging area remains empty.

### Owner settings refinement — 2026-11-15

D36 / design-system section 6: reversed the rejected shared two-column settings grid. S28 Account and Preferences now share a centered 720px settings column, keep fields within the existing 640px form limit, and group short preferences into one card with shared row controls. S29 retains its original two-card desktop layout and full-width deletion section. Existing account actions remain available. Devices sort current-first then descending activity, show honest unknown-browser labels and sign-in/activity times, and show a normal-size bulk sign-out only when other sessions exist; AR/EN copy and bindings were synchronized.

Impeccable Operate/refinement used existing project context directly because the context launcher had no installed engine; no installation or repair was attempted. Inspected the running owner demo on localhost:3030 in ar-SA/en-US at 1440/390: Account and Preferences measured 720px on desktop and 354px within the phone gutters, with no document or row horizontal overflow. Inspected all 12 requested screenshots plus four Devices and two mobile deletion captures, saved in the owner-designated `t009-settings-centered` UI-audit archive. Figma inventory references remain S28 desktop `37:2877` / mobile `49:1716`, S29 desktop `37:3088` / mobile `49:1825`; these were not reread live and no new Figma parity claim is made. No owner server was stopped or started.

Light checks: changed-file formatting/lint passed; affected web units passed 14 tests across Sessions, SavedField, Privacy and Preferences; account-copy units passed 9 tests and delivered-copy bindings passed 1 test. Lingui extraction and compilation completed. No full validation or browser suite ran; screenshots are a focused live visual inspection, not automated functional suite evidence.

### Privacy reference restoration and timezone action — 2026-11-15

D36 / Impeccable refinement: restored S29's approved compact export status row with download icon, soft background and separate green request button; removed the collection EmptyState. Deletion navigation uses shared secondary and danger Buttons with link semantics. Preferences places the device-timezone action below the select across the available row, using the shared compact metadata-link variant so the full AR/EN label fits on one line without a local type or control-size override. The removed hint is obsolete in both catalogs and retained only as a superseded copy-deck reference; it has no active surface binding. Lingui extraction, synchronization and compilation completed.

Compared Privacy against the owner-approved `t009-privacy-redesign/privacy-ar-SA-1440-none.png`: the desktop card positions, status row, request action and deletion section positions are restored; secondary appearance follows the current shared Button variant. Captured and inspected Privacy and Preferences in ar-SA/en-US at 1440/390 against the existing localhost:3030 demo, overwriting the eight requested screenshots and two supplementary mobile deletion captures in `t009-settings-centered`. Device-timezone text measured 287px AR / 226px EN within the 312px phone card interior, with no wrapping or overflow. Light formatting/lint passed; affected web units passed 16 tests in three files and copy-binding units passed 10 tests in two files. No browser suite or server restart ran.

### Settings header alignment — 2026-11-15

D36 / Impeccable refinement: moved the existing settings width constraint to the shared Settings layout so PageHeader, navigation tabs, divider and content share one centered column. Kept the existing icon/label/soft-highlight navigation and phone back navigation. Live AR/EN measurements at 1440 confirmed matching header/tab/body edges: 720px Account/Preferences and 1094px Privacy; at 390, headers and cards share the 354px column without overflow. Captured and inspected all 12 requested `-header.png` screenshots in `t009-settings-centered` against the existing localhost:3030 demo. Changed-file formatting/lint and the six existing Settings route tests passed; no copy changes, browser suite or server restart.

## Dashboard sidebar refinement — 2026-11-15

- Owner-approved scope: top New CV opens the existing `document.new` flow; Trash joins the main navigation after a divider; one account button opens Settings, Help, Language, Theme and Sign out, and remains active on all settings descendants. Sidebar widths remain 236/64; phones retain bottom tabs with the same destinations and account menu.
- Requirements: B-C01 (account access), B-C05 (document creation/navigation), B-C12 (Trash/data controls). Inventory baselines: Sidebar `14:264`, Bottom nav `15:627`, S17 `21:325` / `41:2`, empty documents `52:1182`, S28 `37:2877` / `49:1716`; existing creation, error and recovery flows remain in their owning dialogs/pages. This refinement uses the owner screenshot and implemented shell as its visual reference; no new live Figma verification is claimed.
- D36: creation and secondary Trash move up, account actions consolidate at the bottom, and collapse/expand moves beside the top brand (outside the narrow rail's brand slot) to reduce bottom weight and keep controls discoverable. Mobile keeps its bottom-navigation pattern and adds Trash alongside Account. Shared button sizes keep the expanded/rail account rows aligned; controls use shared tokens and logical RTL/LTR positioning.
- Copy: four bilingual sidebar/menu labels bind to the existing copy deck and shared-shell inventory. Catalog synchronization now includes the existing user-menu feature; theme choices reuse the approved appearance strings. Locale review remains pending owner review.

- Visual review: captured and inspected all 12 `ar-SA` / `en-US` images in `t009-sidebar`: 1440 expanded, collapsed, and account menu in both states; 390 bottom navigation and account menu. Fixed long synthetic identity overflow with bounded shared menus, equal expanded/rail row positions, mobile label wrapping and aligned icon rows. The rail expand control is beside the brand and remains clickable above the header. Mobile Settings retains the existing settings-list entry route.

- Validation: changed-file formatting and lint passed; 11 unit/component tests passed across the shell, account menu, shared Button and locale tooling. Lingui ar-SA/en-US extraction and build-time compilation completed; copy bindings reported 0 diagnostics across 11 surfaces. Web/server production builds passed.
- Focused browser validation on 3130/3133: all 33 selected cases passed across 11 specs, including `shell.spec.ts`, persisted geometry, menu access in AR/EN light/dark at 1440/768/390, stationary expanded/rail rows, Settings tabs/titles, header motion, 200% zoom, cross-tab sign-out/account switching and empty Trash. Failed fixture/title assumptions were corrected and those cases rerun; the real Arabic row-height mismatch was fixed in shared Button sizes and the affected layout cases rerun. No full suite ran. The owner server on 3030 remained running.
- Cleanup: the isolated web/SMTP runtime stopped and scratch files were removed. The automatic cleanup guard rejected deleting the synthetic database `sidebar_review_1794727155852` as destructive; that database and its `sidebar_review_1794727155852_runtime` role remain. No guard bypass or toolchain repair was attempted.

### Fixed Settings column and Profile edges — 2026-11-15

Owner decision / D36 / Impeccable refinement: all three Settings tabs now use the same shared centered 720px wrapper for PageHeader, navigation, divider and cards. Privacy stacks What we store, Download your data and Delete account in order; existing status, actions and danger styling remain. SavedField fills the settings-card content width, removing its extra 640px cap without changing dialog/sheet limits. The device-timezone action uses the shared accent link variant and compact metadata size. Updated only the relevant settings wording in design-system section 6; interface copy is unchanged.

Captured and inspected the 12 requested AR/EN 1440/390 `-fixed.png` screenshots plus four supplementary deletion captures in `t009-settings-centered` on the existing localhost:3030 demo. Compared exact header and every navigation-item rectangle across all three tabs: identical for each locale/viewport. Desktop headers are x=242 AR / x=478 EN, y=96, width=720; tab rows y=168. Phone headers are x=18, y=84, width=354, with existing back navigation and hidden desktop tabs. Profile field bounds match both content edges: 678px desktop and 312px phone. The accent device action stays on one line (287px AR / 226px EN); no horizontal overflow. Changed-file formatting/lint passed; 16 affected web tests and the shared Button test passed. No full/browser suites, provider calls or server restarts.

### S36 help and data-rights refinement — 2026-11-15

- Scope: B-O01/B-O05. Inventory: S36 desktop `82:3791`, mobile `82:3910`, sent `82:8976` / `82:9064`; preserve the existing intake-failure recovery and saved-not-resolved receipt. The owner screenshot and running application are the visual reference; no new live Figma verification is claimed. Mobile/SMS recovery remains gated.
- D36: shared Textarea body typography and a message variant provide seven initial lines, content growth up to sixteen lines, then internal scrolling. Existing short textarea contexts keep their compact size. The existing 10000-character limit has a visible, Latin-isolated counter. The form uses `noValidate`, localized shared field errors and first-invalid-field focus instead of browser validation bubbles.
- D36 / Impeccable Read/Operate: expose the existing Subject label, group FAQ answers, surface existing data-rights copy, place the mobile FAQ jump in the shared header action slot, and use the shared section column presentation to align desktop headings while keeping the mobile divider. Announce and focus the saved receipt; return focus to message entry when starting another message. Keep the supported request categories, privacy warning and truthful receipt; add no response deadline or delivery promise.
- Copy: four new bilingual validation/count entries and reused FAQ/rights entries remain bound to the two Lingui catalogs and active-surface inventory. Extraction, synchronization and strict AR/EN compilation passed; delivered bindings reported zero diagnostics. Owner copy/policy review remains pending.
- Verification: 13 help component tests and 14 existing shared-input tests passed; changed-file format and lint passed. Captured and inspected empty/error/sent in both languages at 1440 and touch/mobile 390 in the owner-requested `t009-help` archive, with critique and capture results alongside. Verified seven-line minimum, capped growth, localized fonts/body metrics, invalid-field and receipt focus, aligned desktop headings and no horizontal overflow. Sent states came from real synthetic local intake responses (HTTP 200), without mocked success or provider delivery. No browser specs/full suites, commits, staging, pushes, environment-file reads or server restarts.
- Critique provenance: two independent read-only assessments. The deterministic detector was attempted but its optional engine was unavailable; no automated detector pass or toolchain repair is claimed. Questions skipped because the owner requested implementation of the clearly useful refinements without new product/policy decisions.

### Sidebar toggle and count refinement — 2026-11-15

- Scope: shared dashboard navigation supporting B-C01/B-C02 and T009; mapped S28 desktop `37:2877` and mobile `49:1716` remain inventory references. Owner screenshots and current code govern this refinement; no new live Figma verification is claimed.
- D36 / Impeccable refinement: keep the top toggle position; replace chevrons with mirrored Phosphor sidebar variants and shared IconButton/quiet Button styling, preserving transparent rest, hover/focus feedback, the shared focus outline and 44px target. Ctrl/Cmd+B uses the existing hotkey hook and is shown through the existing tooltip/Kbd component; fields and open dialogs retain their shortcuts.
- One NavLink and shared SidebarCountBadge now serve Documents, Applications and Trash: 16px height, shared 11px tabular Latin numerals, zero hidden, visual 99+ cap, and full localized accessible totals. Expanded pills remain at the row end; rail badges sit above the icon at logical inline-end with a surface-colored separation ring. Digit isolation stays inside the badge so RTL positioning inherits the navigation direction.
- Captured and visually inspected 28 AR/EN 1440×900 screenshots in the owner-requested sidebar audit folder: expanded/collapsed rest, hover, tooltip and keyboard focus (`-toggle`), plus counts 1/12/120 in both states (`-badges`). Browser-only synthetic session/RPC fixtures exercised actual app components; no product fixture path, account creation, persistence or provider calls. Geometry confirmed 44px toggle targets, transparent rest and 16px/11px badge metrics; the visual pass found and corrected RTL corner placement before final captures.
- Light verification: 17 sidebar component tests, the shared Button test and delivered-copy binding test passed; changed-file formatting/lint and AR/EN extraction/compilation passed. No full suites or browser specs, server restart, environment-file reads, staging, commits or pushes. The optional Impeccable context engine was unavailable; guidance and manual visual review were used without installing or repairing it.

### Upload choice refinement — 2026-11-15

- D36 / B-C02: simplified the S05/S06 upload choice (mapped masters `28:769`, `43:668`, `28:820`, `43:717`) to one action line and shared icon badges derived from the actual byte/page validator constants; separated the truthful storage note and retained existing scanned-PDF errors and partial-read review warnings. Full-width shared ActionChoice details prevent Arabic chips wrapping at 390.
- Light validation: changed-file formatting/lint passed; chooser/new-document units 9/9 and delivered copy binding unit 1/1 passed; AR/EN extraction and scoped compilation passed. Twelve idle/drag-over/error captures at 1440/390 were inspected; keyboard Enter opened the picker, focus outline was present, chips stayed on one row with Latin digits and no card overflow. Captures use the actual StartCvDialog and shared components on the existing dev server in an isolated synthetic-session harness, not an authenticated end-to-end account flow. No shell/sidebar files were edited. Live Figma frames were not reverified; the owner screenshot and implemented shared components were the visual baseline.

- D36 empty-CV card refinement (2026-11-15; B-C02, S17 masters `21:325` / `41:2`, adjacent empty collection `52:1182` / `52:8037`): centre the label in the visible page area and use decorative existing template samples or token-based blank-sheet lines, preserving filled-card sizes; scope legacy compact-icon styles to unavailable previews. Five thumbnail tests and changed-file format/lint pass. Sixteen synthetic-browser captures cover AR/EN, 1440/390, light/dark and missing-image recovery, with matching sizes and exact label centres; single-session Impeccable critique and geometry are in the owner-requested empty-CV audit archive. Owner screenshot/code baseline; no new live Figma verification, copy changes, provider calls, browser specs or server restart.

## D36 visual delight — owner approved 2026-11-15

- One original shared 3% Sadu tile decorates only auth/public-status and bounded EmptyState surfaces to add Saudi character without touching CV paper or previews.
- The approved checkmark draws once for 800ms on auth entry and the existing HTML boot gate to acknowledge arrival without looping; reduced motion retains the final mark.
- Shared 800ms green check/glow feedback complements existing PDF completion, accepted AI review and known first-CV creation messages to acknowledge confirmed success while retaining live announcements and calm work screens.

Validation: changed-file format/lint passed; 11 UI and 47 affected web unit/component tests passed. AR/EN extraction, approved-copy sync and compilation completed with unchanged wording. The copy binding check retains 12 unrelated privacy-message/source mismatches in the existing worktree. The owner-designated `t009-delight` archive contains the inspected AR/EN light/dark 1440/390 captures, 0/400/800ms animation frames, reduced-motion evidence and a single-context Impeccable critique (delegation explicitly declined). Successful CLI scans of sign-in, sign-up, email-change, password recovery and deletion receipt each flagged existing hidden developer-tool text; injected detector overlays flagged the existing approved cream palette. No change-related detector finding remained; supplemental mobile/gated CLI scans timed out or terminated. Success visuals use actual shared components in a synthetic browser-only harness; provider-backed exports/reviews were not exercised. Minimum measured patterned-text contrast was 4.94:1. Port 3030 stayed running.

- D36: Owner removed repeated trust footnotes from career cards (visual noise); approval behaviour unchanged.

### Language and skill entry refinement — 2026-11-15

- D36 / owner screenshots 39–40: replace free-text-only language, fluency and skill-level entry with shared localized selectors in career facts and standard/custom CV editor sections; Other retains custom text. Presets keep text storage and synchronize numeric ratings; renderers localize recognized labels using the CV language without mutating saved content. Owner screenshot/current shared-code baseline; no new live Figma verification.
- Light format/lint passed; 84 focused unit/component tests passed. AR/EN extraction, binding sync and compilation completed; new option bindings are clean, with 46 existing account/privacy diagnostics left outside scope. The owner-designated `t009-delight` archive contains 56 `language-`/`skill-` screenshots at 1440/390, the in-session Impeccable critique and raw detector results. URL scan timed out; both CDP dialog scans completed with 11 existing background/palette warnings each and none targeting changed controls. Synthetic browser fixtures block external font requests, so PDF visual verification remains open; document-language projection is unit-tested. No full/browser suites or server restart; 3030 remains running.

## UI audit refinements (2026-11-15)

- A2 / D36: the shared Settings route now applies the existing centered settings column to every sub-route, including deletion review, so the heading and navigation retain their start edge. Account and deletion measure the same 720 px column at 1440 and the same 354 px column at 390.
- A4 and empty-CV placeholder: the thumbnail subscribes to Lingui during render; activating either interface locale updates the placeholder without navigation, refetching the CV or rendering a PDF. The shared placeholder uses an opaque paper background behind the label so decorative fallback lines cannot show through it.
- B1 / D36: a document type with no items and no search, tag or public-only constraint uses the shared first-use EmptyState and its type's action. The cover-letter action reuses the existing creation hook, including pending state; CV creation and PDF import retain their current entry points. Active constraints retain the no-results state and clear action. Three new cover-letter messages are bound to the copy deck and both Lingui catalogs; locale review remains pending.
- B2 / D36: the shared stacked SettingsRow action aligns to the logical start under its label; desktop trailing columns remain. Browser geometry confirms all three Arabic preference rows share their label/action start edge at 390.
- Help / D36: the inline message error immediately follows its textarea, before the sensitive-data helper and character counter, preserving the existing field association and validation behavior.
- Light verification: affected web component tests **29 passed**, tooling locale tests **72 passed**, changed-file formatting/lint **PASS**, AR/EN Lingui extraction and strict compilation **PASS**. Impeccable's changed-source detector returned no findings. No full, browser or production suite ran.
- Render evidence: Arabic captures at 1440/390 cover Account, deletion review, Privacy, Preferences, empty letters, filtered no-results, empty CVs, Help validation and the forced thumbnail fallback. English and Arabic captures after locale switching exercise the existing mounted thumbnail at both widths. Empty-CV-type screenshots use only an intercepted empty document-list read response; no document was created or removed. These screenshots verify presentation, not deletion, mail delivery or provider behavior.

- Upload requirements / D36, B-C02: owner-requested S05 chip wording now states PDF-only, maximum size and page count in AR/EN, retaining shared icons, badges and limit constants; a localized named list groups the requirements and wraps at narrow widths. Starting inventory: desktop `28:769`, mobile `43:668`; owner screenshot is the visual baseline, with no new live Figma inspection.
- Verification: changed-file format/lint passed; import-start component tests **6 passed**, tooling locale tests **72 passed**; AR/EN extraction, binding sync and compilation completed. Headless Arabic captures `limits-ar-SA-1440.png` and `limits-ar-SA-390.png` passed list-copy/overflow checks; the first mobile capture attempt used a desktop-only launcher and was retried with the open dialog. Affected browser specs were skipped because port 3030 was occupied; its dev server remained running.
- Upload requirements bidi correction / D36, B-C02: isolate the complete `25 MB` value/unit with `<bdi dir="ltr">` inside the size message, preserving Arabic reading order; the page-count chip already reads `حتى 30 صفحة` and is unchanged. AR/EN catalogs and copy binding synchronized and strictly compiled; component tests **7 passed**, tooling locale tests **72 passed**, changed-file format/lint passed. Both `limits-ar-SA-1440.png` and `limits-ar-SA-390.png` were retaken and inspected using a newly launched headless browser against the running local demo; the size has computed LTR direction and bidi isolation at both widths. No live Figma inspection or browser suite; dev server left running.
