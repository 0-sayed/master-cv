# T000 execution evidence

Historical observations below are dated 2026-10-21. This records an **uncommitted implementation**, not a completed release or merged task.
The Task Graph remains unchanged. No staging, commit, push, PR, deployment or registry publication was performed.

## Final local verification — 2026-11-05

- Uncommitted working tree on `chore/t000-project-bootstrap`; source HEAD `677b18784c953d26cd4876531441f8cf25d2ef62`.
  **Final tested commit: PENDING — fill after the authorized commit and verify it matches the tested tree.**
- Node **24.22.1**, pnpm **12.14.0**; child Node version also verified. No Git writes, Figma access, deployment, publication or GitHub settings changes.
- T000 contributes to A07/A08/A12/A13; no owned Figma frame and no business release gate passed.

| Check                                                                    | Result today                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm validate:static`                                                   | PASS: format, lint, workspace types, Knip and boundaries.                                                        |
| `pnpm test`                                                              | FAIL: accepted inherited native Hermes compiler absence; the default runner stops remaining tasks.               |
| Complete workspace tests with continuation and disposable real databases | 20/21 tasks pass; 2,031 Vitest tests pass, zero skipped/failed; native 7 pass / 1 fails. Only failure is Hermes. |
| `pnpm build`                                                             | PASS; existing bundling/font warnings retained.                                                                  |
| `pnpm security:secrets`                                                  | PASS: 5,383 commits scanned, zero unsuppressed findings.                                                         |
| `pnpm security:audit`                                                    | PASS at the high threshold: 2 moderate / 1 low remain; 1 accepted high ignored.                                  |
| `pnpm security:licenses`                                                 | PASS: no GPL-3.0/AGPL-3.0 dependencies in installed graph.                                                       |
| Fresh snapshot install/configuration/migration/start/health              | PASS; snapshot details below.                                                                                    |
| Production AR/EN browser matrix at 1440/390                              | PASS: four synthetic sign-in/dashboard/CV journeys; eight screenshots inspected.                                 |

The complete test run used isolated migration/integration databases and a separately migrated OAuth database in this session's disposable PostgreSQL project. Baseline sources with the original frozen lockfile reproduce the missing iOS pod-installed `hermesc`; no failing test was skipped or weakened. No application or dependency fix was needed in this final pass.

### Owner-accepted limits — 2026-11-05

- The four historical secret findings are upstream-author history, absent from current files and not owner credentials. Their exact fingerprints are accepted in `.gitleaksignore`; step 1's owner-revocation requirement is superseded. No secret values or broad rule exceptions were added.
- Expo CLI tooling-only Zod 3 advisory `GHSA-mrhx-c7xc-m3w5` is accepted in the existing `audit.ignore`; review **2026-11-19**. Glob/minimatch moderate advisories and low deepmerge remain follow-up below the CI threshold.
- The native Hermes test failure on Linux is accepted because native store delivery is outside this web roadmap. This does not establish native runtime acceptance or make `pnpm test` green.

### Snapshot and browser evidence — 2026-11-05

- `/tmp/t000-clean` was copied from `git ls-files --cached --others --exclude-standard`: 2,549 Git-visible files, excluding Git metadata, dependencies and non-example environment files. This is an **uncommitted snapshot, not the final commit**; the final evidence edit follows that snapshot.
- Frozen installation passed with lifecycle scripts disabled to prevent Git-hook writes. The first attempt was blocked by `ERR_PNPM_STORE_DIR_OPEN_OPERATION_LOCK` / `Read-only file system (os error 30)`; a writable temporary runtime directory resolved the lock location. This initial blocked attempt is not a pass.
- Documented `pnpm local:init`, isolated Compose PostgreSQL, `pnpm db:migrate` and `pnpm dev` passed. Snapshot web/Hono/email/DB ports were 24300/24301/24302/25439; Compose project `master-cv-t000-final`. Web and Hono `/api/health` returned 200. Fresh synthetic secrets/configuration were generated, not copied from the owner's environment.
- Synthetic UI signup and blank-CV creation passed in development. The built application then passed separate sign-in/dashboard/open-CV journeys in all four production combinations on port 24400. Language switched through Preferences; `ar-SA`/`rtl` and `en-US`/`ltr` matched. Document widths equalled 1440/390; no console/page/HTTP errors or failed requests in the production matrix. Saved synthetic CV text remained unchanged when switching interface language.
- All eight production dashboard/editor screenshots were viewed: no broken layout or missing-glyph boxes observed. Existing Hanken Grotesk/Newsreader fonts loaded; Arabic headings use the inherited system DejaVu Sans fallback. No new design/font implementation or PDF/DOCX qualification is claimed.
- Development mobile journeys logged a React conditional-`use()` warning. The original HEAD archive, installed with its original frozen lockfile, reproduced the same warning in Arabic mobile. Record this inherited development limit; production had zero such warnings. The first development editor screenshot caught a loading state; production captures waited for the visible name input before inspection.
- All six task-owned application ports closed after SIGINT; no task-owned processes remained. Disposable container/network removal passed; **volume deletion was blocked by automatic command review** (`containers.compose:down-volumes`). `master-cv-t000-final_postgres_data` remains stopped and isolated. Existing `master-cv-local-postgres-1` remained running and untouched.
- Recursive deletion of the session-created `/tmp/t000-clean`, `/tmp/t000-baseline`, `/tmp/t000-hermes-baseline` and `/tmp/t000-runtime-final` directories was also rejected by automatic command review. Those copies remain; synthetic environment/account/session files were individually removed. Pre-existing temporary dependency stores were preserved. Cleanup is incomplete; see the external report.
- Final `pnpm format:check` and `python3 Planning/roadmap/check.py` passed after this evidence update.
- Compact logs, JSON results, browser scripts and screenshots: external `master-cv-design-archive/t000/final/`, with the final report in `report.md`. No new independent review, remote CI or container-image build ran. Historical remote protection/reporting/release gates below remain separate; T000 stays unchecked until authorized merge.

## Historical evidence — 2026-10-21

### Source and execution boundary

- Product repository: `0-sayed/master-cv`, verified private, standalone, default branch `main`, developer access `ADMIN`.
- `origin`: `https://github.com/0-sayed/master-cv.git`; `upstream`: `https://github.com/reactive-resume/reactive-resume.git`.
- Starting and tested Git HEAD: `677b18784c953d26cd4876531441f8cf25d2ef62`, application version 6.0.4.
  The tested implementation is the working-tree diff on `chore/t000-project-bootstrap`; no new commit identifies it yet.
- Mode A, direct branch-first execution. No scheduler or downstream task was started.
- Node 24.22.1, pnpm 12.14.0, existing pnpm lockfile and workspace catalogs. No dependency version upgrade.
- Existing React/Vite/TanStack Router, Hono, Better Auth, PostgreSQL/Drizzle and document packages remain.
  MIT license and upstream notices are preserved. No new business schema, AI workflow, payment or CV feature.
- No Figma frame implementation or visual approval belongs to this change. Arabic PDF/DOCX qualification remains T001/T004.

### Adapted bootstrap dispositions

“Changed” describes implementation, not a claim that every acceptance gate passed.

| Step                                | Disposition               | Evidence and remaining work                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Destination and planning inputs  | Verified existing         | Private standalone owner-controlled repository and both remotes inspected. Planning package already adopted; no repository transfer or visibility change.                                                                                                                                                           |
| 2. Adopt package and preserve fork  | Changed                   | Planning stays separate from upstream `docs/`. Root AGENTS links the preserved upstream repository guide; `CLAUDE.md` remains its symlink. Original license, app and lockfile retained. No commit under the user's instruction.                                                                                     |
| 3. Repository policy and start mode | Partly blocked            | Mode A selected. Main protection API returned 403 requiring an eligible GitHub plan. No protection bypass or visibility change. Candidate check names are in the development guide; required checks need real remote runs before configuration.                                                                     |
| 4. Runtime/language                 | Verified existing         | Node 24 and exact pnpm 12.14.0 used. Both disposable worktrees installed the frozen lockfile offline. Existing strict workspace types and export boundaries retained.                                                                                                                                               |
| 5. Workspace tooling                | Verified existing         | pnpm/Turborepo and all 23 packages retained, including native/mobile. Ownership map is in the development guide.                                                                                                                                                                                                    |
| 6. Quality gates                    | Changed                   | Read-only `validate:static` and `validate` added using the existing formatter/linter, types, Knip, tests and builds. Static validation passes. Full tests retain the native prerequisite failure below.                                                                                                             |
| 7. CI safety                        | Changed                   | Static validation replaces write-back autofix. Application tests retain isolated PostgreSQL. Actions pins resolved from upstream GitHub commits. Metadata-only PR title/assignment workflow, one Dependabot configuration. Publishing and cloud/native automation are explicitly gated.                             |
| 8. Entrypoints                      | Verified existing         | Existing Hono/web runtime, auth, migrations, `/api/health`, `/openapi.json`, storage and static serving reused. Synthetic registration/logout/login runs against the actual app in both worktrees.                                                                                                                  |
| 9. Worktree isolation               | Changed                   | WTC 0.2.0, `.wtcrc.json`, development Compose default, loopback ports, namespaced volumes and generated ignored secrets verified. Two concurrent databases and local storage directories proved separate. Optional Redis/S3/app-container profiles are retained but are outside the tested host/local-storage path. |
| 10. Observability/lifecycle         | Changed                   | Normalized correlation IDs, safe HTTP metadata and sanitized unexpected errors added; deliberate HTTP client errors retained. Shutdown drains HTTP/scheduled work and closes DB/Redis. Focused tests pass; lifecycle observations recorded below.                                                                   |
| 11. Real-stack tests                | Changed/verified existing | Existing Vitest unit/integration suites, real PostgreSQL migration/auth tests and Playwright auth smoke reused. Added focused bootstrap tests. Repaired one stale mobile layout boundary fixture; no native product change. No Testcontainers duplication or new coverage percentage.                               |
| 12. Developer/agent workflow        | Changed                   | Root guidance stays under 200 lines and links detailed setup/ownership/runbooks. Native parity, upstream public/provider capabilities and approval scope explicitly reconciled. README links setup without deleting upstream attribution.                                                                           |
| 13. Security baseline               | Partly blocked            | Staged/history Gitleaks commands and hook integration, license policy and separate high-advisory audit added. License check passes; synthetic secret rejection verified. History findings and dependency advisories remain unresolved below.                                                                        |
| 14. CI/image verification           | Partly blocked            | Cache-only image job has no registry login, push or deploy. It was not executed locally or remotely. Application CI is prepared; no remote run exists because changes remain uncommitted.                                                                                                                           |
| 15. Dependency/configuration audit  | Changed                   | No blanket upgrade or lockfile churn. Action revisions and infrastructure image digests verified against upstream metadata. Optional S3 digests are resolved, not runtime-certified. Security checks remain failing rather than suppressed.                                                                         |
| 16. Smoke and independent review    | Changed/verified          | Two linked baseline worktrees received the uncommitted bootstrap patch, then frozen installs/migrations/runtime/auth/isolation checks. This is a patch-applied checkout test, not a merged-commit checkout. Independent review and disposable-resource cleanup passed as recorded below.                            |
| 17. Integration/handoff             | Deferred by user          | No commits or PR. Intended future PR is `chore: bootstrap project` into the product repository's `main`; no merge or Task Graph update. T001/T002 remain dependent on completed T000.                                                                                                                               |

### Checks actually executed

- **Historical pass (2026-10-21):** `pnpm validate:static`: formatting, lint, 22 workspace typecheck tasks, Knip and Turbo boundaries
  (1,504 files, 23 packages). Formatting changes to imported planning were limited to files rejected by the formatter.
- **Pass:** `pnpm build`: existing application/package builds. Upstream bundling/font warnings remain; no container image was built.
- **Pass:** focused HTTP correlation/error and real HTTP shutdown tests: 9 tests. Local configuration and license tests
  are included in the final tooling suite; all 42 tooling tests pass, including preserved publishing/mobile workflow scripts.
- **Pass:** final database suite: four tests, including both connection-error logging tests and the real migration integration
  test (clean schema, v5 data preservation, retry and rollback). Pool/client error listeners remain intact; raw pg error/client
  objects are no longer logged. This was prompted by the actual dependency-stop test, not a hypothetical failure.
- **Pass:** standalone repaired mobile layout test. Native compiler test remains unresolved; it was not skipped.
- **Pass:** workflow validation with actionlint 1.7.12 (release archive checksum verified).
- **Pass:** `pnpm security:licenses`: no GPL-3.0/AGPL-3.0 package in the installed graph. Existing LGPL libvips is distinct;
  its notices remain. No license exception was invented.
- **Fail:** full `pnpm test` initially found missing iOS Hermes compiler and the stale layout fixture. The fixture is repaired;
  final `pnpm --filter mobile test` reports seven passed, one failed (Hermes), zero skipped. Hermes requires the app's iOS Pods
  compiler. The full `validate` command therefore remains failing at its test stage; it is not claimed green.
- **Pass:** database-backed `pnpm test:ci`: 20 tasks, 2,028 tests passed with no failures/skips in that run. This used disposable
  PostgreSQL and a separately migrated OAuth database. Subsequent config-preservation and pg-logging changes were verified by
  the final tooling/database suites above, plus static checks/build. No coverage-percentage report was run.

Raw local command logs and redacted reports are ignored under `.superpowers/t000/`; they are not portable CI evidence.
GitHub Actions have not run for this patch. A successful browser smoke is not full browser coverage or Arabic document acceptance.

### Concurrent worktree observations

Both disposable worktrees start at the recorded HEAD and receive the uncommitted bootstrap files without hidden commits.
Each ran `pnpm install --offline --frozen-lockfile`, `wtc start`, `pnpm local:init`, `pnpm db:migrate`, and `pnpm dev`.
The locally installed WTC link initially lacked production dependencies; repairing that external tool did not change its source
or lockfile. WTC was then verified as version 0.2.0.

| Resource                 | Worktree A                                 | Worktree B                                 |
| ------------------------ | ------------------------------------------ | ------------------------------------------ |
| Branch                   | `test/t000-a`                              | `test/t000-b`                              |
| Frontend                 | `http://localhost:23100`                   | `http://localhost:23200`                   |
| Hono / email preview     | `23101` / `23102`                          | `23201` / `23202`                          |
| PostgreSQL loopback port | `25532`                                    | `25632`                                    |
| Compose namespace        | `master-cv-wt-1-test-t000-a`               | `master-cv-wt-2-test-t000-b`               |
| DB volume                | `master-cv-wt-1-test-t000-a_postgres_data` | `master-cv-wt-2-test-t000-b_postgres_data` |
| Storage                  | A checkout's `data/`                       | B checkout's `data/`                       |

Both health endpoints, OpenAPI documents and email preview servers answered HTTP 200. A real synthetic row inserted into each
database was visible only there and was removed afterwards. Separate storage marker files stayed in their own checkout.
Auth/encryption keys differed between worktrees and generated files had restricted permissions. Each browser auth spec passed
registration, logout and login with its own browser context (14.2s / 14.3s); test account cleanup left no test account behind.
System Chrome was selected via `PLAYWRIGHT_CHANNEL=chrome`, with Playwright's matching ffmpeg installed. Ports do not isolate
cookies; browser contexts do. The user's pre-existing main-checkout app/database/local files were preserved.

Stopping A's database produced A HTTP 503 with an unhealthy database result while B remained HTTP 200. Stopping A's dev
process closed all three A app/preview ports while B stayed healthy. Restart restored A HTTP 200 and its storage marker.
A separate synthetic database marker row also survived another infrastructure stop/restart; B remained healthy.
The browser check launched during the restart timed out on loading; after recovery, the same auth spec passed again (9.8s).

Both dev process groups were stopped, WTC removed their containers/networks, and the two inspected synthetic database volumes
were removed by exact name. Both disposable linked worktrees/branches were removed. All eight allocated app/database ports
were closed, no containers/volumes with either test-project label remained, and the main checkout's health stayed HTTP 200.
No global prune or deletion of the user's existing app/database/storage was performed.

An independent reviewer inspected the uncommitted implementation and then verified fixes. The review caught loss of custom
generated-env settings on restart; the new test failed before the fix and passed after, retaining SMTP/Redis/storage settings
while refreshing ports. Container verification now runs on every PR to avoid missing build inputs. Support links now target
the product repository's existing form, and the unverified security contact was removed. A final narrow review of PostgreSQL
error redaction found no important regression. The inherited security policy still needs the owner decision below.

### Historical remaining gates — superseded where resolved above

The following records the 2026-10-21 state; the dated verification and owner decisions above govern today.

- **Native tests:** the inherited `hermes-compat.test.mjs` expects the iOS pod-installed `hermesc` executable. It is absent on
  this Linux machine. Mobile has no `test:ci` script in the baseline, so a green workspace CI command does not cover this test.
- **Historical dependency audit (2026-10-21; superseded):** registry audit returned seven advisories, including three high:
  `@tiptap/core` (`GHSA-j95f-988m-3j2f`, patched at 3.30.5), `node-forge` (`GHSA-86w9-cpqp-85rv`) and
  `braces` (`GHSA-vfj7-8cjw-p6xm`). The latter two reports offered no patched version at inspection time.
  No blanket upgrade, audit exception or silent failure was applied.
- **Secret history:** full-history Gitleaks scanned 5,383 commits and reported 27 detections. These include inherited test/docs
  fixtures and historical provider-related values; they have not all been triaged as actual credentials. No values are reproduced
  here. Review redacted findings and determine any necessary revocation or narrowly justified fixture handling; do not rewrite
  history or broadly allowlist without a decision. Synthetic GitHub-token detection returned failure as expected.
- **Remote checks/image/protection:** no GitHub run or container-build result exists; main protection is unavailable under the
  current plan. Local image builds were not attempted with limited storage. Do not substitute the prepared workflow for evidence.
- **Reporting/hook policy:** inherited `SECURITY.md` was removed because this repository is private. The product needs
  an owner-approved private reporting channel before release; no new channel or response guarantee was invented. The existing
  global hook policy delegates pre-commit but not commit-msg, so local commitlint enforcement needs that policy integration.
- **Production:** image/deployment/native publication variables were not enabled. Registry destination, deployment scripts,
  Expo project ownership and release policy require separate review before any future opt-in. Real CV/AI, Moyasar charging and
  paid Saudi OCI resources remain disabled and outside T000.

Remote checks, image/protection and reporting/release approvals remain outside this local pass. Keep the single roadmap task unchecked until authorized merge.
