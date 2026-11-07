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

The web owns routes and React UI; the Hono server owns HTTP/startup/static serving. `packages/api` owns
authenticated business procedures; `auth`, `db`, `schema`, `resume`, `pdf`, `docx`, `ui`, `fonts`, `env` and
`email` retain their existing responsibilities. Mobile and native packages remain in the workspace.
See [the preserved repository guide](agents/repository-guide.md) for conventions and the detailed map.

## Local development

On a new checkout, run `pnpm local:init`, then `docker compose -f compose.yaml up -d --wait postgres`,
`pnpm db:migrate`, and `pnpm dev`. Docker Compose v2 with `include` support is required.
`local:init` generates ignored `.env` infrastructure inputs and `.env.local` application configuration,
with mode 0600. It refuses to replace hand-written `.env.local`. Keep an existing setup deliberately
or move its configuration aside before using the generator; never discard local credentials implicitly.

The default ports are web 3000, Hono 3001, email preview 3002 and PostgreSQL 5432. Set distinct
`PORT`, `SERVER_PORT`, `EMAIL_PORT` and `POSTGRES_PORT` in ignored `.env` before generation if occupied.
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

## Isolated worktrees

Use worktree-compose 0.2.0 with the `portStride` support verified in this environment. Run `wtc --version`
and `wtc --help` first. A broken local link must be repaired before using it; do not invent unsupported flags.
The main checkout supplies `.wtcrc.json`, `compose.yaml`, `compose.dev.yml` and an ignored base `.env`
containing synthetic `POSTGRES_PASSWORD`. WTC copies these infrastructure inputs into linked worktrees.
It does not copy `.env.local`; each worktree generates separate application secrets.

1. Create a linked branch worktree from the intended baseline and install with the frozen lockfile there.
2. From the main checkout run `wtc ls`, then `wtc start <index>`. It starts only PostgreSQL by default.
3. Inside that worktree run `pnpm local:init`, `pnpm db:migrate`, and `pnpm dev`.
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

Build before running browser tests against the production server. For a running development worktree, use
`pnpm exec dotenvx run --ignore=MISSING_ENV_FILE -f .env.local -- playwright test tests/e2e/specs/auth.spec.ts`.
The default uses Playwright Chromium; install it with `pnpm exec playwright install --with-deps chromium`.
An existing system Chrome can be selected with `PLAYWRIGHT_CHANNEL=chrome`; Playwright's matching ffmpeg
must still be installed for video artifacts. Browser smoke does not certify Arabic PDF/DOCX gates.

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
