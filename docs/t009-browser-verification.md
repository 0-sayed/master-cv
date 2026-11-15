# Account controls browser handoff

All 11 new functional cases passed. Latest unique affected result: **24 pass / 1 fail / 0 skip**, combining final results per case rather than claiming one all-green run. Broad run: 19/6/0 (`/tmp/account-browser-qualified.log`, artifacts `/tmp/master-cv-ci-browser-NY5eAr`); corrected security/picture/settings: 15/0/0 (`/tmp/account-browser-recovery.log`, artifacts `/tmp/master-cv-ci-browser-iTSFgr`). Production builds passed. Existing `public-sharing.spec.ts` still fails 409 at its gated publish fixture; no gate was enabled.

New specs/cases: account-security 4; account-data-rights 3; privacy-help 1; private-picture-delivery 1; trash-retention 2. Actual browser coverage includes two-link email with MFA, virtual passkey proof, ZIP content, offline mail retry, queued/running deletion, signed-out receipt, owner/anonymous/foreign/revoked pictures, private language-copy restore/history and timer purge. Test-only controls are absent from production routes.

## Host command

Run with Node 24 and pinned pnpm on PATH. No env file:

```sh
env -i PATH="$PATH" HOME="$HOME" E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs tests/e2e/specs/account-security.spec.ts tests/e2e/specs/account-data-rights.spec.ts tests/e2e/specs/privacy-help.spec.ts tests/e2e/specs/private-picture-delivery.spec.ts tests/e2e/specs/trash-retention.spec.ts tests/e2e/specs/auth.spec.ts tests/e2e/specs/settings-stability.spec.ts tests/e2e/specs/cv-readiness-export.spec.ts tests/e2e/specs/json-export-import.spec.ts
```

This host command must be run from the env-free snapshot described by the implementation plan. Build inputs must include every uncommitted change. Never use another database or reuse an already running application. Any failure is unresolved, not a skipped acceptance.

## Execution matrix

For the known publishing-gate failure, run separately from the same env-free snapshot:

```sh
env -i PATH="$PATH" HOME="$HOME" E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres node tooling/local/ci-browser.mjs tests/e2e/specs/public-sharing.spec.ts
```

Each invocation owns fresh ports 3030/3033, database, local storage and `.test` mail sink. Do not repeat unchanged passing cases without new source/findings. Keep all credentials/mail in private test artifacts. The command above does not authorize enabling publishing.

All 48 surface/locale/viewport groups below remain **Pending** for systematic visual/interaction qualification; each includes the enumerated states. Functional smoke/settings screenshots do not establish each matrix cell. No separate browser-testing agent has run this matrix. Personally rendered live Figma in this continuation: desktop S29/S30/S31/S36 and mobile proof `566:32717`; other IDs below require live render inspection.

### Browser verification list (separate browser-testing agent)

**Every row/state below:** `{ar-SA RTL, en-US LTR} × {1440, 390 CSS px}`, synthetic `.test` accounts and built production runner. Record Pass/Fail/Blocked plus actual screenshot/trace and action for each cell. Inspect all remaining Figma renders through the agent's own authorized connection; metadata or an app screenshot is not Figma render evidence. Toggle UI language with fixed Arabic/English CV sentinels and assert document values/revision identity unchanged.

| Changed surface                           | Required states/dialogs/actions/recovery                                                                                                                                                                                                                         | Reference                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Dashboard/settings shell                  | Account/privacy/back/history, expanded/rail, mobile tabs, no gated fixtures; adjacent dashboard comparison for header/body start edges, invariant sidebar width, toolbar heights, avatar inset.                                                                  | S28                                                                                            |
| S28 account/details                       | Save/reload/validation/server error/retry; avatar upload/replace/remove/loading/failure; long names/email, responsive account-details sheet/focus return.                                                                                                        | `37:2877`, `49:1716`, `85:20241`                                                               |
| Email change dialog/sheet                 | Default/current credential+MFA error/invalid+duplicate address/network failure; old address active, pending after reload, resend/cancel/supersede/expired link, verified new email; locale of captured old/new mail.                                             | `80:28603`, `80:28628`, `80:29876`, `80:30259`                                                 |
| Password dialog/sheet                     | Default/visibility/mismatch/current-password/minimum/server failure, values retained, commit/stale other session, MFA preserved/reset continuation.                                                                                                              | `80:28712`, `80:28747`, `80:28832`, `80:28869`, `258:33954`, `259:15383`                       |
| Security/devices + changed method dialogs | Loading/unknown/error+retry/stale-known/successful empty/passkey+authenticator enrolled; current device/revoke one+others pending/fail/success. Inspect every affected existing MFA/passkey confirmation/error dialog and record actual registry/frame identity. | S28, `258:33773`, `259:15281`                                                                  |
| S29                                       | Storage categories/consent off/unavailable/policy draft, proof required, no request/queued/preparing/ready/download/failed/retry/expired/re-request/cancelled/deletion pending; signed-out ready link→correct owner, wrong owner denied.                         | `37:3088`, `49:1825`, `80:29999`, `80:30352`, `80:30079`, `80:30417`, `565:37051`, `565:37200` |
| Confirm access dialog/sheet               | Export and deletion purposes: default/wrong password/MFA/passkey success+cancel+unsupported+UV failure/expired+retry/rate/network error; neutral Cancel, no action from proof success; focus trap/return/Escape.                                                 | `566:32463`, `566:32717` default/error/expired sets                                            |
| S30                                       | Live scope counts 0/1/2/many, optional export, actual exceptions, proof required/confirmed/expired, checkbox off/on, Cancel/final danger/double submit/error retry; paid renewal pending cannot complete. No Google/SMS promise.                                 | `37:3225`, `49:1887`, `565:37285`, `565:37438`, `565:37515`, `565:37673`                       |
| S31/public shell                          | Accepted receipt/all devices signed out, refresh/back/deep-link privacy, pending wording, home/help/language; completion mail after actual completion only, no public ID status lookup.                                                                          | `37:3360`, `49:1948`                                                                           |
| S36/public shell                          | FAQ/form/four subjects/invalid fields/sensitive-data warning/submitting/durable received/error/retry preserving message/send another/signed-out access; distinguish receipt from mail delivery.                                                                  | `82:3791`, `82:3910`, `82:8976`, `82:9064`                                                     |
| Picture-bearing CV/preview/PDF            | Owner image, anonymous/wrong owner/revoked/conditional fetch denied; replacement/removal/error; owner PDF without public fetch, no immutable/private cache leak. Check affected avatar/card/preview surfaces.                                                    | Actual S28/S08/S12 mapped surfaces, inspect before edit                                        |
| Trash/document dialogs                    | Restore formerly shared language copy/reload/private, purge pending/failure/retry/completion and active-file references; all changed confirmation dialogs. Timer/durable purge proved in tests separately, not by screenshot.                                    | Existing mapped document/trash inventory, no invented T009 frame                               |

For each: actual loaded self-hosted faces (`document.fonts.ready` plus loaded font check), lang/dir, mixed-script `dir=auto`, Latin digits, full select labels, semantic shared sizes, no local font/color/spacing/radius/height override, keyboard/tab/error summary/live status, touch reachability and visible focus, one primary+neutral Cancel, shared icon/title/explanation/recovery notices, no pending/empty/error conflation. Spot-check 320/768 if shared layout changed, reduced motion, no overflow. One-line D36 reasons, visual evidence separate from smoke.
