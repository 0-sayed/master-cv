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
The banner reads **LOCAL REAL AI — dev only, provisional models**. Writer: Luna low/Azure;
verifier: DeepSeek Flash 1017 low/Together. ZDR, deny collection, no provider fallbacks, consent,
owner scope, durable accounting and fail-closed review remain enforced. This is not route/release approval.

Put `OPENROUTER_API_KEY=<app-key>` and, separately, `OPENROUTER_BENCHMARK_KEY=<benchmark-key>` in
`.env.openrouter.local`. The owner must set hard key caps in OpenRouter: **$3 app / $5 benchmark**.
The benchmark reads only its explicitly passed file's benchmark key, never the app key or inherited shell keys.
Set `LOCAL_REAL_AI_OWNER_ID=<local-account-user-id>` in `.env.local` to give only that account
50 operations in this launcher; without it the standard five apply. Production always retains five.
Operation allowances are not dollar limits; provider key caps are owner-managed.
Use synthetic/sample CVs only until Saudi processing compliance is approved. Each paid run still needs
explicit owner permission; launcher/test verification does not authorize paid calls.

Vitest, integration setups, browser CI, Playwright and the T005/T006 synthetic servers reject either key
variable when present (including empty values), before running tests. They never load `.env.openrouter.local`.
For offline launcher verification, `pnpm dev:real-ai --env-file /tmp/fake-openrouter.env` replaces the
credential file. Use a fake app key, `OPENROUTER_BASE_URL=http://127.0.0.1:<stub-port>/api/v1` and
`FLAG_ALLOW_UNSAFE_AI_BASE_URL=true`; only explicit numeric loopback HTTP stubs are accepted and redirects
are forbidden. Ordinary launches use the canonical OpenRouter endpoint. Do not export real keys into test shells.
