# Master CV development

This is the complete Reactive Resume v6 application, extended in place. Product requirements live in
[Planning/context](../Planning/context/README.md), and [T000](../Planning/roadmap/tasks/T000-project-bootstrap.md)
owns this setup. The upstream MIT license and notices remain intact. Product PRs target `0-sayed/master-cv`;
`upstream` is only for reviewed updates from `reactive-resume/reactive-resume`.

## Toolchain and validation

Use Node 24 (`.nvmrc`) and the exact `packageManager` version, pnpm 12.14.0. Run `pnpm install --frozen-lockfile`.
The lockfile and existing catalogs are the baseline; do not run a blanket update.

- `pnpm validate:static`: check formatting, lint, all workspace types, Knip and package boundaries.
- `pnpm validate`: static checks, the existing complete test command, and application/package builds.
- `pnpm test`: includes the inherited native tests. The Hermes test requires an iOS pod installation;
  this Linux checkout cannot pass that test. Do not silently exclude native packages or call this suite green.
- `pnpm test:ci`: existing workspace CI suites. Mobile has no `test:ci` script; its `pnpm test` result must
  also be reported. This is a recorded inherited coverage gap, not permission to omit mobile validation.
- `pnpm build`: existing web, Hono and shared build tasks; generated build output is ignored.
- `pnpm check`, `pnpm format` and `pnpm lint:fix` rewrite source. They are not CI validation commands.

Reject newly added raw UI font/color/spacing/radius values and control-size overrides outside shared definitions; require semantic roles and shared variants. Verify equal header/body start edges and invariant sidebar width across dashboard routes, matching toolbar heights, full select-label fit and avatar inset. Check AR/EN, narrow/wide layouts and every changed dialog/state; record evidence separately from functional smoke.

The web owns routes and React UI; the Hono server owns HTTP/startup/static serving. `packages/api` owns
authenticated business procedures; `auth`, `db`, `schema`, `resume`, `pdf`, `docx`, `ui`, `fonts`, `env` and
`email` retain their existing responsibilities. Mobile and native packages remain in the workspace.
See [the preserved repository guide](agents/repository-guide.md) for conventions and the detailed map.

## Local development

On a new checkout, run `pnpm local:init`, then `docker compose -f compose.yaml up -d --wait postgres`,
`pnpm db:migrate`, provision its runtime role below, and `pnpm dev`. Docker Compose v2 with `include` support is required.
`local:init` generates ignored `.env` infrastructure inputs and `.env.local` application configuration,
with mode 0600. It refuses to replace hand-written `.env.local`. Keep an existing setup deliberately
or move its configuration aside before using the generator; never discard local credentials implicitly.

The default ports are web 3000, Hono 3001, email preview 3002 and PostgreSQL 5432. Set distinct
`PORT`, `SERVER_PORT`, `EMAIL_PORT` and `POSTGRES_PORT` in ignored `.env` if occupied: first run
`pnpm local:init` to generate credentials, edit those ports while retaining `POSTGRES_PASSWORD`, then rerun
`pnpm local:init` before starting Compose. The generator preserves existing infrastructure credentials.
`APP_URL` is the frontend origin and determines auth callbacks and absolute application URLs.
Host-run connections use loopback; the optional container app uses `postgres` service DNS.

The default supported path is PostgreSQL 17 plus local filesystem storage inside this checkout's `data/`.
Redis is supported but optional for a single instance. Optional `redis` and `s3` Compose profiles retain
the upstream services; they are not part of this path's acceptance. Set their credentials/host URLs explicitly
and verify those profiles before using them. Their image digests are pinned but S3 was not runtime-tested.
For the `app` profile, supply `.env.local` and build the existing Dockerfile.dev explicitly. No image build
is needed for the host development path. Do not attach an old PostgreSQL-major volume to the new dev stack.

`compose.yaml` includes `compose.dev.yml` and is the safe development default. The inherited `compose.yml`
remains an upstream deployment example, with legacy defaults; it is not an approved production configuration.
Use explicit `-f compose.yaml` to avoid Compose's warning about both filenames. Production belongs to T012.
Docker build/watch inputs exclude Planning, credentials, local state and browser reports.

## Private workspace database roles

T003 requires two connections. `DATABASE_MIGRATION_URL` owns schema changes; `DATABASE_URL`
must be a non-owner login without superuser, BYPASSRLS, migration-role membership, TRUNCATE
privileges on protected tables or UPDATE/DELETE privileges on `career_fact_revision`. INSERT remains
required to append revision snapshots. Startup verifies forced RLS and refuses unsafe runtime credentials.
The 27 protected tables deny private queries without an authenticated owner scope. Identity/session
lookups stay outside that scope; they do not use the migration connection.

For a new **synthetic local database**, run the existing `pnpm local:init` and `pnpm db:migrate`, then
`pnpm exec dotenvx run -f .env.local -- node tooling/local/database-roles.mjs`.
The helper accepts loopback databases only, creates `master_cv_runtime`, and writes ignored,
mode-600 `.env.runtime.local`; it refuses an existing role or file instead of rotating credentials.
Existing checkouts must supply their actual schema-owner URL as `DATABASE_MIGRATION_URL` first.
Do not replace an existing database password or run this against real CV data.

Root development/database scripts load `.env.runtime.local` before `.env.local`; the first file wins.
Existing process environment still takes precedence. The original local setup and its admin credentials
are preserved. A worktree needs its own role/file; do not copy runtime files between databases.
CI provisions a fresh restricted role after migrations and uses a separate admin URL for fixture cleanup.
Future migrations that add tables or functions must explicitly extend its grants.

Accepted master snapshots are append-only for the application role. Queue and abandoned-run discovery
functions return bounded owner IDs only; payload work then uses short owner-scoped transactions.
Atomic confirmation uses one transaction, with independent accepted and draft revision checks.

## T003 copy generation

The copy deck remains the source for scoped AR/EN workspace strings and auth mail. From the tooling
workspace, use `copy:generate:auth-mail` or `copy:generate:workspace` to regenerate the corresponding
TypeScript derivatives. Extract the web's `en-US,ar-SA` catalogs with the existing Lingui command,
then run `copy:sync:workspace` and `copy:check:bindings`. These checks validate active bindings;
they do not approve pending copy reviews or claim complete release coverage. Preserve other locales.

## Isolated worktrees

Use worktree-compose 0.2.0 with the `portStride` support verified in this environment. Run `wtc --version`
and `wtc --help` first. A broken local link must be repaired before using it; do not invent unsupported flags.
The main checkout supplies `.wtcrc.json`, `compose.yaml`, `compose.dev.yml` and an ignored base `.env`
containing synthetic `POSTGRES_PASSWORD`. WTC copies these infrastructure inputs into linked worktrees.
It does not copy `.env.local`; each worktree generates separate application secrets.

1. Create a linked branch worktree from the intended baseline and install with the frozen lockfile there.
2. From the main checkout run `wtc ls`, then `wtc start <index>`. It starts only PostgreSQL by default.
3. Inside that worktree run `pnpm local:init`, `pnpm db:migrate`, provision its runtime role below, and `pnpm dev`.
4. Use the URL printed by `local:init`. WTC's URL column can choose an optional S3 port, so it is not
   authoritative for the frontend. Allocated ports and `.env.local` must agree.
5. Stop `pnpm dev` with Ctrl-C before `wtc stop <index>` from the main checkout. WTC stops infrastructure,
   not application processes. Restart using `wtc start`, rerun `local:init`, then `pnpm dev`.

WTC uses stable slots and a stride of 100. Observed slot 1 allocates 23100/23101/23102/25532; slot 2 uses
23200/23201/23202/25632. Compose project names, database volumes and checkout-local storage are distinct.
WTC copies its base `.env` on each start; do not put per-worktree hand-maintained configuration there.
Rerunning `local:init` refreshes allocated ports while retaining that worktree's generated auth/encryption keys
and custom app settings. It preserves an explicitly chosen storage backend/path; keep those namespaces isolated.
WTC starts with `--build`, but no build service belongs to the default profile.

Cookies are shared across ports on a hostname. Use separate browser profiles or Playwright browser contexts,
never reuse one worktree's login/storage state in another. Reports, traces, screenshots, logs, uploads and
Vitest caches remain inside the worktree and are ignored. Do not synchronize them or `.env.local`.
Stopping preserves volumes. Remove only the named disposable project's volumes after checking its namespace;
never use `wtc clean`, a global Docker prune, or delete another project's data for routine cleanup.

## Integration and browser checks

`/api/health` reports database/storage readiness; an unavailable dependency produces 503. `/openapi.json`
is the existing API document. The Node server drains HTTP and scheduled work and closes PostgreSQL/Redis
connections on SIGINT/SIGTERM. HTTP logs record validated request IDs, method, status and timing without
URLs, headers or bodies. Existing development email previews contain synthetic auth links; use synthetic
accounts only and keep logs private. This bootstrap is not a comprehensive production logging audit.

Existing real-database Vitest suites use `COVER_LETTER_TEST_DATABASE_URL`, `INTEGRATIONS_TEST_DATABASE_URL`
and `OAUTH_TEST_DATABASE_URL`. Point them only at disposable local databases with CREATE DATABASE permission.
They create isolated schemas/databases; OAuth needs its own migrated database, separate from the running app.
The migration integration suite verifies clean creation, legacy-data preservation, retries and rollback.
The CI workflow documents the full service/test environment. No Testcontainers layer is needed to duplicate it.

For `node tooling/local/ci-browser.mjs`, explicitly load an ignored `.env.test.local` with
`node --env-file=.env.test.local tooling/local/ci-browser.mjs`. Set `E2E_DATABASE_ADMIN_URL` to a
working loopback admin connection; the runner creates its own fresh synthetic database and restricted role.
For API database tests, load the same file with the three test URLs above pointing at disposable local
databases (OAuth must already be migrated). These commands do not automatically load `.env.local`.
If authentication fails with `28P01`, verify credentials against the existing container's original
infrastructure configuration; correct the ignored file, never rotate the running database password.

Build before running browser tests against the production server. For a running development worktree, use
`pnpm exec dotenvx run --ignore=MISSING_ENV_FILE -f .env.local -- playwright test tests/e2e/specs/auth.spec.ts`.
The default uses Playwright Chromium; install it with `pnpm exec playwright install --with-deps chromium`.
An existing system Chrome can be selected with `PLAYWRIGHT_CHANNEL=chrome`; Playwright's matching ffmpeg
must still be installed for video artifacts. Browser smoke does not certify Arabic PDF/DOCX gates or D35 UI consistency. Record the separate AR/EN layout, element and dialog/state evidence required above.

The application-test workflow caches `.cache/document-toolchain` by runner OS/architecture and the
installer plus `versions.json`. Every install checks the pin marker, executable/library SHA-256 values
and reader version before reuse; a valid cache makes no downloads. Cold downloads use three attempts
per Ubuntu archive/security mirror, 20-second request timeouts and exponential backoff, retaining the
same exact package checksums. Setup checks the runner's installed runtime libraries and invokes apt
only for missing packages, with five acquisition retries and bounded timeouts. It no longer installs a
second, unpinned system Poppler. Reader setup has a six-minute job-step limit. Chromium installation also reuses the runner runtime
libraries without `--with-deps` (which otherwise refreshes apt and installs unrelated language fonts);
Playwright still validates its host library dependencies.

## Security and CI boundaries

Gitleaks 8.30.1 is an external CLI. `pnpm security:staged` scans staged changes; `pnpm security:secrets`
scans Git history. Both redact findings and fail when the scanner is absent. The existing Lefthook pre-commit
chain runs the staged scan. `pnpm hooks:install` must not overwrite a shared/global `core.hooksPath`;
integrate with an existing hook policy deliberately. CI installs Gitleaks from a verified release checksum.
On this machine the global pre-commit hook delegates to `.git/hooks/pre-commit`. Installing with
`GIT_CONFIG_GLOBAL=/dev/null pnpm hooks:install` created repository hooks without changing that global hook.
The global policy does not delegate commit-msg; its commitlint hook is not effective here until that policy
is integrated. Conventional PR titles are checked independently in CI.

`pnpm security:licenses` checks the installed graph and rejects GPL-3.0/AGPL-3.0 dependencies, including
expressions requiring review. Existing LGPL libvips is distinct; retain its upstream notices. No new exception
is approved. `pnpm security:audit` is network-dependent and fails on high advisories. Both checks run in a
dedicated workflow, separate from routine validation. Known history findings/advisories remain unresolved
until reviewed; no broad allowlist or silent audit failure is configured. Dependabot is the single update bot.

Static validation, application tests, secret scanning, dependency auditing and container verification use
read-only permissions and verified Action SHAs. Image verification uses cache-only output with no push,
registry login or deployment. Inherited cloud compatibility, live smoke, native publishing and stale-issue
automation require explicit repository-variable gates. No production integration is enabled by T000.
The original publishing workflow's tested scripts are preserved behind manual dispatch, product-repository,
main-branch and `MASTER_CV_ENABLE_IMAGE_PUBLISH` checks. Deployment and native publication have further gates;
their inherited deployment/Expo configuration still needs owner review before opt-in.
PR title/assignment automation operates on GitHub metadata only and never checks out PR code.

Candidate protection checks are `Static validation`, `Unit integration and browser`, `Secret scan`,
`Dependency audit and licenses`, `Container build`, and `Conventional PR title`. Add required checks only after real GitHub runs.
Container verification runs for every PR so an omitted build input cannot bypass it. Private-repository protection
currently returns 403 on this account plan. Do not change visibility or claim protection is configured.

See [T000 execution evidence](t000-evidence.md) for actual local passes, failures and outstanding approvals.
Issue-template support now targets the product repository; its unverified security-report contact was removed.
The inherited `SECURITY.md` was removed because this repository is private. Add an owner-approved Master CV
private reporting channel before release. Do not send private product reports to upstream contacts.

T003 browser tests capture actual verification/reset messages through the loopback SMTP sink in
`tests/e2e/mail-capture.mjs`. It accepts only `.test` recipients and saves ignored mode-600 messages
under `test-results/mail/`. The browser server runs with synthetic SMTP settings. Never publish these
messages, traces or local environment files; links are authentication secrets. The production transport
requires configured SMTP and surfaces delivery failures as retryable errors. Mail delivery/domain and
legal wording approval remain release gates.

Playwright starts its own application and SMTP capture by default and refuses occupied ports, including
locally, so an unrelated development server or worktree cannot silently receive test mail. The capture
port defaults to the web `PORT` plus 3; `E2E_SMTP_PORT` overrides it for both the capture and application.
`E2E_MAIL_DIRECTORY` selects the capture directory and must match the directory read by the fixtures.

To use an already provisioned isolated browser runtime, set `E2E_REUSE_SERVER=true` together with explicit
`E2E_SMTP_PORT` and `E2E_MAIL_DIRECTORY`. This opts into reusing both services; the existing application
must already send to that loopback capture port and the sink must already write to that directory.
Playwright cannot retrofit SMTP settings into an existing process. Keep `APP_URL`, `PORT`, storage and
database settings pointed at that same synthetic runtime. `PLAYWRIGHT_CHANNEL=chrome` remains supported.

## Synthetic review browser runtime

For bounded offline verification, use Node 24 and explicit disposable test URLs; do not load environment files.
Preload `tooling/local/test-isolation.mjs` before application imports. It disables native dotenv loading,
rejects inference credentials, disables Vite dotenv discovery and blocks fetch to listed inference-provider hosts while retaining
loopback transports and the application's normal `NODE_ENV`. The browser runner supplies this preload
through its own controlled `NODE_OPTIONS`; inherited Node options and provider credentials are not forwarded.

```sh
NODE_OPTIONS="--import=$(pwd)/tooling/local/test-isolation.mjs" \
COVER_LETTER_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
INTEGRATIONS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
OAUTH_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/job_language_oauth_test \
pnpm --filter @reactive-resume/api test
```

The OAuth database must be separately created and migrated on that same disposable instance.
The AI suites create/migrate fresh databases with restricted `NOBYPASSRLS` roles and remove their own
databases/roles after execution. Database-backed skips are missing verification, not a passing result.

The synthetic review browser suite uses `tests/e2e/reviewable-ai-runtime.config.ts`. Its web-server
command, `pnpm --filter server test:review-runtime`, starts `tests/e2e/reviewable-ai-runtime-server.ts`
with deterministic transports; it requires no paid inference. Pass `--config tests/e2e/reviewable-ai-runtime.config.ts`
to the isolated browser runner when running the review specs.

## Local real AI (synthetic CVs only)

With Node 24 on PATH and the local database/storage configured in `.env.local`, build the web app
(`pnpm --filter web build`) and run `pnpm dev:real-ai`. It serves the normal built web app at
`http://localhost:3060`, binds loopback only, and refuses production mode or a missing app key.
It loads the existing restricted-role `.env.runtime.local` first when present, then `.env.local` and
ignored `.env.openrouter.local`; it does not alter servers on 3000/3050. Provision the restricted runtime
role using the local database setup above before launching; unsafe database credentials fail closed.
At startup, the launcher uses `DATABASE_MIGRATION_URL` to create the current UTC daily budget if no row exists.
Both database URLs must select the same local database and port. Remote hosts and connection overrides are refused.
The separate administrative connection closes before the HTTP server starts. The runtime role receives no additional privileges.
The default is 3,000,000 USD micros ($3) per UTC day, 200,000 micros ($0.20) per request, and two concurrent operations.
An existing row keeps all limits, spend, reservations, and active counts. Startup never resets accounting.
After midnight UTC, restart this launcher to create that day's missing row. Requests fail closed until that setup completes.
The OpenRouter key cap remains the real money limit. This setup runs only in the local launcher and refuses production mode.

The launcher registers wording, extraction, summary, job evidence, tailoring, translation, and cover-letter handlers.
Follow-up questions use the wording handler's result action and its separately approved writer.
Interview preparation remains benchmark-only and unavailable in this launcher. The review guide states this limit.
Launch errors distinguish unavailable AI, daily budget, account allowance, consent, and temporary provider failures.
Only temporary failures offer Retry. Consent recovery returns to the notice and requires another explicit start.
The dialog uses the server's remaining count and hides allowance text for unlimited accounts, including eligible admins.

The banner reads **LOCAL REAL AI — dev only, provisional models**. Writer: Luna low/Azure;
verifier: DeepSeek Flash 1017 low/Together. ZDR, deny collection, no provider fallbacks, consent,
owner scope, durable accounting and fail-closed review remain enforced. This is not route/release approval.

Put `OPENROUTER_API_KEY=<app-key>` and, separately, `OPENROUTER_BENCHMARK_KEY=<benchmark-key>` in
`.env.openrouter.local`. The owner must set hard key caps in OpenRouter: **$3 app / $5 benchmark**.
The benchmark reads only its explicitly passed file's benchmark key, never the app key or inherited shell keys.
Set `LOCAL_REAL_AI_OWNER_ID=<local-account-user-id>` in `.env.local` to give only that account
50 operations in this launcher; without it the standard five apply to non-admin accounts.
Operation allowances are not dollar limits; provider key caps are owner-managed.

`ADMIN_EMAILS` grants unlimited AI operations and document allowances to listed accounts in every environment, including production.
The server reads this comma-separated list once at startup, trims spaces, ignores empty entries, and compares email addresses without case.
Restart the server after changes. For example, inject `ADMIN_EMAILS="owner@example.test,second@example.test"` into the server process.
An account qualifies only while its stored email matches and `email_verified` is true. Each request uses the current database identity.
The legacy database role does not grant this access. The browser cannot grant it, and the former Better Auth admin endpoints are unavailable.
Usage and spend remain in durable accounting. Existing safety, consent, ownership, concurrency, and platform spend controls still apply.
The OpenRouter key cap remains the money limit. Ordinary accounts retain their current limits, and letters remain uncapped as before.
The API represents an unlimited allowance with `null`, while used and reserved counts remain numeric.

Use synthetic/sample CVs only until Saudi processing compliance is approved. Each paid run still needs
explicit owner permission; launcher/test verification does not authorize paid calls.

Vitest, integration setups, browser CI, Playwright and the T005/T006 synthetic servers reject either key
variable when present (including empty values), before running tests. They never load `.env.openrouter.local`.
For offline launcher verification, `pnpm dev:real-ai --env-file /tmp/fake-openrouter.env` replaces the
credential file. Use a fake app key, `OPENROUTER_BASE_URL=http://127.0.0.1:<stub-port>/api/v1` and
`FLAG_ALLOW_UNSAFE_AI_BASE_URL=true`; only explicit numeric loopback HTTP stubs are accepted and redirects
are forbidden. Ordinary launches use the canonical OpenRouter endpoint. Do not export real keys into test shells.

## Fictional local demo

Use Node 24 and an already migrated database with the restricted runtime role.
Supply `DATABASE_URL` and `APP_URL` through the prepared dotenvx root scripts.
The configured database and application URLs must use loopback.
Docker publication on a loopback host address is supported.
The seed rejects production mode and inference credentials.
The avatar upload requires the local storage backend.

Run `pnpm db:seed:demo` with those runtime variables supplied.
With pnpm 12, export `npm_config_verify_deps_before_run=false` before each pnpm command in the sandbox.
The command does not load environment files or run migrations.
It never uses administrator credentials.

The reserved account is `demo@sirawise.test`.
The fixed password is `SirawiseDemo-Local-2026!`.
All saved people, companies, achievements, jobs, and documents are fictional.
A completed seed skips later runs and preserves owner edits.
A failed content transaction rolls back all fixture content.
An unexpected partial workspace causes a refusal.

Version 6 covers one invented Saudi professional with twenty years of experience, from 2006 through 2026.
It creates 15 CVs from five authored exemplars, 11 active letters, 20 applications, eight job targets, and eight STAR stories.
Eight letters link to applications. Three letters come from the custom cover-letter sections through the normal resume update path.
The original three exemplars fill every standard section and every supported custom section type.
Two Arabic showcase CVs present the same person and career: `سيرة قبل التحسين` and `سيرة احترافية`.
The draft omits contact information and uses unresolved dates, a creative heading, dense prose, and cramped columns.
The professional CV uses standard headings, grouped skills, reverse chronology, quantified results, and one readable column.
Both showcase CVs hide the avatar and omit custom sections. They do not link to applications or alter the insights examples.
The fixture units run structured rules and analyze actual server-rendered PDFs, without a browser, database, or AI service.
The draft triggers 20 distinct rules. The professional CV produces no structured errors or warnings and no PDF blockers or warnings.
English writing heuristics skip Arabic documents. The tests do not count skipped rules as findings.
The app extracts the custom cover-letter section into its separate letter editor.
The small PNG avatar is a local drawing of a fictional character. It uses the normal private storage upload path.
Every application includes its own stage history, dated notes, contacts, salary text, and a follow-up date.
Only eligible histories include past interviews. One Screening application includes a future appointment.
The fixture covers all six stages and four closure reasons. Two sent applications have no attached CV.
The other sends use 11 distinct tailored CVs and five base-CV links. Both saved jobs have base-CV links.
The expected insights show 18 sends, 11 replies, a rounded 61% reply rate, and a six-day median.
The funnel is `[18,10,6,2]`. The eight weekly totals are `[1,2,1,3,2,4,3,2]`.
The tailored comparison is 8/11 replies. The base comparison is 3/5. Two unlinked sends are excluded.
No AI service, external job site, real person, or email delivery participates in the seed.

To replace an older demo or discard demo edits, run `pnpm db:seed:demo --reset` with the same runtime variables.
Career facts use plain text. Resume descriptions keep their rich text formatting.
Visible career content does not label the invented people or employers as fictional.
Trash contains two extra cover letters, one Arabic and one English, deleted one and two days earlier.
The displayed retention countdown leaves at least 28 days after each reset.
The seed uses the document service to trash them. Restore and permanent deletion use the normal app procedures.
Active counts are 15 CVs and 11 letters. Two additional letters remain in Trash.
An extra trashed CV is blocked because the Start allowance counts all CVs, including Trash.
The owner approved a seed-only exception on 2026-11-19 for the reserved demo account and a loopback database.
The seed passes an explicit internal callback for ten additional application copies and the two showcase CVs through the document service.
The callback allows at most 13 job copies. It cannot bypass base-CV or language-copy limits.
Historical creation and replay use an internal service timestamp to preserve the injected clock.
The public application procedures keep their existing date-only inputs.
Product admission stays unchanged. The app server reads no new environment switch.

The completion marker is the CV tag `Career portfolio · November 2026 · Showcase`.
The former `Insights` marker requires an explicit reset. A plain seed never replaces the older content.
Reset requires the reserved email, username, verified identity, reserved name, and matching demo password.
The seed accepts the former reserved display name and changes it only after credential validation.
Reset first revokes the reserved account's sessions through Better Auth.
It removes that account's career content through owner-scoped deletes and creates the version 6 content in one transaction.
It keeps the reserved login and other accounts. It removes old demo pictures after the content transaction succeeds.

The master record contains contact details and an empty summary. The CV summaries remain complete.
This gives the demo record 85% completeness and shows the summary hint.
The shared calculation gives contact details 20%, summary 15%, experience 25%, education 15%, skills 15%, and languages 10%.
An experience needs a company, role, and description. Education needs a school and degree.
Only confirmed facts in the master record count. CV content does not affect the percentage.
Owned browser fixtures sign out their sessions during teardown. Session tests keep extra sessions only until their revocation test ends.
Run the plain command again to make sure that it reports `skipped` and preserves the new content.

Database integration tests use disposable administrator credentials only to create and migrate their own test database.
The seed itself always uses the restricted runtime role.

The seed checks the configured client endpoint and the restricted database role.
It does not require the PostgreSQL container address to use loopback.
