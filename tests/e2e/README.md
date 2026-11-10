# E2E Tests

Reactive Resume uses Playwright for PR-gated browser coverage of deterministic core flows.

## Local setup

Install Poppler (`brew install poppler` on macOS or `sudo apt-get install poppler-utils` on Debian/Ubuntu). The browser PDF download test uses `pdftotext` to verify logical Unicode text, including `/ActualText` spans.

Start PostgreSQL:

`sudo docker compose -f compose.dev.yml up -d postgres`

Generate local test secrets:

`export AUTH_SECRET=$(openssl rand -hex 32)`

`export ENCRYPTION_SECRET=$(openssl rand -hex 32)`

Run database migrations:

`APP_URL=http://localhost:3000 PORT=3000 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres FLAG_DISABLE_SIGNUPS=false FLAG_DISABLE_EMAIL_AUTH=false FLAG_ENABLE_GUEST_LOGIN=true FLAG_DISABLE_API_RATE_LIMIT=true LOCAL_STORAGE_PATH=/workspace/data/e2e pnpm db:migrate`

Build the production app:

`APP_URL=http://localhost:3000 PORT=3000 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres FLAG_DISABLE_SIGNUPS=false FLAG_DISABLE_EMAIL_AUTH=false FLAG_ENABLE_GUEST_LOGIN=true FLAG_DISABLE_API_RATE_LIMIT=true LOCAL_STORAGE_PATH=/workspace/data/e2e pnpm build`

Run tests:

`APP_URL=http://localhost:3000 PORT=3000 DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres FLAG_DISABLE_SIGNUPS=false FLAG_DISABLE_EMAIL_AUTH=false FLAG_ENABLE_GUEST_LOGIN=true FLAG_DISABLE_API_RATE_LIMIT=true FLAG_ALLOW_UNSAFE_AI_BASE_URL=true LOCAL_STORAGE_PATH=/workspace/data/e2e pnpm test:e2e`

## Coverage

- Email/password sign-up, sign-out and sign-in through the UI.
- Guest login, and a guest's resume carried over when they create an account. Skips without `FLAG_ENABLE_GUEST_LOGIN=true`.
- Builder section editing, with autosave across reloads and a draft kept when saving during navigation fails.
- JSON export/import through the New dialog, including an older file whose resume still carries a cover letter.
- Public sharing: an anonymous visitor's PDF download and statistics, a renamed address that keeps redirecting, and
  a password-protected link.
- OAuth consent for MCP clients: deny, allow with PKCE, and the access token's audience at `/mcp`.
- The assistant, against a scripted OpenAI-compatible provider (`fixtures/ai-stub.ts`). It needs `FLAG_ALLOW_UNSAFE_AI_BASE_URL=true` so the server may call the stub on 127.0.0.1, and skips without it.

Visual regression, PDF/DOCX rasterization parity, thumbnail resolution, and import-fixture reproduction are
intentionally outside the PR gate to keep it fast.

### CI browser reproduction (required before a browser CI parity claim)

Use Node 24 and `pnpm exec playwright install chromium`. Supply a local synthetic PostgreSQL 17 admin connection as `E2E_DATABASE_ADMIN_URL` through your private environment, then run:

```sh
node tooling/local/ci-browser.mjs
# Same partitioning as .github/workflows/e2e.yml; run sequentially on local port 3030:
node tooling/local/ci-browser.mjs --shard=1/4
# Repeat for 2/4, 3/4 and 4/4.
# During iteration only, after a production build of the current source:
node tooling/local/ci-browser.mjs --skip-build tests/e2e/specs/auth.spec.ts
```

The runner always creates and migrates a new empty database and a restricted runtime role using the workflow's role provisioner. It uses production output, `CI=true` (one worker, CI reporters, zero retries), the workflow feature flags, fresh local storage/mail, and bundled Chromium. It ignores inherited product/provider settings, `PLAYWRIGHT_CHANNEL`, and server reuse. It only starts its own 3030/3033 processes and refuses occupied ports; it never touches 3000. Install the workflow's Poppler toolchain in `.cache/document-toolchain` first (see `docs/development.md`).

Each invocation, including each shard, gets a separate empty database. Its name and temporary artifact directory are printed; the synthetic database/role and artifacts remain for investigation, and are never reused. Keep the private admin connection outside tracked files. An installed-Chrome run against an already populated/reused runtime is a useful manual check, but does not reproduce CI.
