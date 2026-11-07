# T000 — Bootstrap the Existing Fork and Isolated Development

**Task:** T000 · **PR size:** L · **Branch:** `chore/t000-project-bootstrap`
**Depends on:** None · **Priority:** 0
**Status:** Proposed implementation plan, 2026-11-03; owner review required. No release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; keep [ ] until merged.

## Goal

The existing full Reactive Resume application is reproducible for our project: source baseline recorded,
planning/instructions merged, compatible toolchain and tests working, and two isolated worktrees proven. Do not
replace it with empty scaffolding or remove existing behavior to satisfy bootstrap.

## Scope (in)

- Copy/merge Planning and root guidance without overwriting upstream source, LICENSE, manifests, lockfile, useful docs
  or unrelated work. Keep upstream docs/ distinct from Planning/context/.
- Record owner/visibility, origin/upstream, starting commit, license, package manager, app/package graph and inherited
  instructions. Target project work at 0-sayed/master-cv, not upstream.
- Complete adapted bootstrap Steps 1-17 with verified-existing, changed, not-applicable-with-reason and blocked
  dispositions. Reuse actual pnpm/Turborepo, Oxlint/Oxfmt and test infrastructure.
- Align compatible runtime/package-manager versions, local/CI environment and validation scripts; preserve the
  lockfile baseline and avoid mass reformat/upgrades.
- Provide read-only format/lint/typecheck/dead-code/test/build validation, useful runtime smoke/integration checks,
  safe CI permissions, secret/dependency checks and verified Actions pins.
- Audit inherited publishing/deployment before pushing/enabling it; no live deployment, registry publication or
  production secrets merely to bootstrap.
- Reuse current Hono/web entrypoints, health/API docs, logging, connections and shutdown. Run necessary existing
  migrations only against isolated local databases.
- Prove two-worktree isolation for project namespaces, ports, DB/object/Redis state where used, port-derived
  frontend/backend/email/callback URLs, browser contexts and artifacts.
- Reconcile root/nested instructions and CLAUDE.md without deleting useful technical guidance; verify documented
  commands and complete startup/CI/cleanup evidence.

## Explicit exclusions

- No new app, framework migration, Master CV table/auth flow/job handler, AI runtime, CV feature, checkout or
  production deployment.
- No provider purchase, real-data processing, repository transfer/detachment or automatic upstream synchronization.

## Requirement IDs

**Owns:** Bootstrap preparation only; no business requirement owner.
**Consumes / contributes:** A07, A08, A12, A13.
Ownership includes evidence coordination; consumers must still meet applicable gates. Deferred requirements remain
deferred.

## Figma targets

- No owned product screen. Use a safe existing UI smoke path; bootstrap does not certify Arabic PDF/DOCX or
  implement/polish later screens.
- Read existing masters only if a bootstrap-level UI adaptation needs visual verification.
- Resolve current masters, product states and named dialogs in [figma-map.json](../../context/design/figma-map.json).
  Never hard-code node IDs in this brief. Verify target names and current renders using authorized access during
  implementation.
- Do not implement Popup Simulator/Note frames or infer application routes from prototype navigation.

## Source references

- [README.md](../../context/README.md)
- [decisions.md](../../context/decisions.md)
- [technical/architecture.md](../../context/technical/architecture.md)
- [technical/infrastructure.md](../../context/technical/infrastructure.md)
- [business/requirements.md](../../context/business/requirements.md)

## Ownership boundaries

- `Planning/`
- `AGENTS.md`
- `CLAUDE.md`
- `package.json`
- `pnpm-lock.yaml`
- `turbo.json`
- `.github/workflows/`
- `compose.dev.yml`
- `apps/web/`
- `apps/server/`
- `apps/mobile/`
- `packages/`
- `docs/development.md`
- `docs/agents/repository-guide.md`
- These are existing repository paths, not permission to replace their contents. Coordinate shared schemas,
  migrations,
  routes, environment definitions, package exports and lockfile changes with their task owners.
- Retain `apps/mobile/` and validate affected shared packages; native-store delivery is outside this web roadmap.

## Implementation notes

- Read ../../bootstrap.md in full and applicable root/nested instructions; dated source observations are not fresh
  local verification.
- Default Mode A: Planning adoption and bootstrap stay on chore/t000-project-bootstrap in one L PR. A focused executor
  may run on that branch; register main-driven scheduling only after merge.
- Mode B requires explicit permission for a one-time main seed; do not bypass protection or add a small planning-only
  PR. Both modes preserve the same 14-task graph.
- Preserve required backing services/native packages; retaining code does not approve integrations or native-store
  delivery. Generate secrets only in ignored files and bind local services to loopback.
- T001/T002 consume the merged foundation; T005 owns new durable AI/usage, T010 Moyasar and T012 production
  operations. Add no new Master CV business behavior here.
- Reuse the existing Reactive Resume React/Vite/TanStack Router, Hono, Better Auth and shared package conventions.
  No framework rewrite, second app, parallel UI library or unnecessary dependency upgrade.
- Use `Planning/context/design/copy-deck.json` as the English UI copy source, owned by T002; each feature adds its
  keys
  to that deck and existing runtime catalogs. Interface language never translates or overwrites saved CV content.

## Acceptance evidence

- A clean checkout installs with the pinned lockfile, starts the actual app on isolated resources, runs existing
  migrations, answers the correct health endpoint and shuts down cleanly.
- Two worktrees run concurrently with distinct URLs/state/browser contexts; stopping/restarting one does not affect
  the other. Cleanup leaves no task-owned stale processes/containers.
- Preserve history/notices, native/shared validation and unrelated configuration. Required CI names match real
  jobs/protection; unavailable permissions and security/image failures remain explicit.
- Record starting/tested commits, setup mode, checklist dispositions and actual commands/results. A second review
  checks repeatability, env/CI consistency, isolation and preservation; claim only reviews actually run.
- A07/A08/A12/A13 receive foundation contributions only; bootstrap smoke is not a business release gate pass.
- ALWAYS check Arabic RTL and English LTR at desktop 1440 and mobile 390, with the correct loaded fonts and direction.
  For non-UI work, exercise the affected consumer journey; document any unavailable browser/visual evidence as
  blocked.
- Record tested commit, commands/results, fixtures, browser artifacts and unresolved gates. Test real state and
  services;
  distinguish synthetic doubles, sandbox checks, document viewers and production evidence. This brief passes no A
  gate.

## Open approvals/blockers affecting the task

- Owner/visibility approval, repository access, toolchain/Docker and safe workflow/secret boundaries gate affected
  operations. Main registration is not a prerequisite for direct branch-first execution.
- D15/D16/T07 production purchases, real-CV inference and live payment activation remain independent of synthetic
  bootstrap.
- Existing evidence records protection access, native and security limitations; inspect and resolve them before
  claiming full acceptance or merge.

## Done definition

- The scoped implementation and recovery paths meet the stated acceptance evidence, with no fabricated completion.
- Requirement/screen ownership, source conflicts, unsupported cases and external approvals are recorded honestly.
- Required checks/reviews pass for the proposed merge scope; unresolved release gates remain explicit and disabled.
- Update the single graph status and Mermaid class only after authorized merge, preserving all 16 large PRs.

## Execution record

Existing execution is recorded in [T000 evidence](../../../docs/t000-evidence.md) and the [execution
ledger](../../../.superpowers/t000/progress.md). These records describe uncommitted execution and outstanding gates;
they do not establish fresh verification or approval. T000 remains [ ] pending until authorized merge.
