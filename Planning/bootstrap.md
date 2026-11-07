# Master CV — Bootstrap the Existing Reactive Resume Fork

**Planning bundle:** v1.2 · **Adapted:** 2026-10-21  
**Task:** [T000 — Project bootstrap](roadmap/tasks/T000-project-bootstrap.md) · **PR size:** L  
**Status:** Instructions, not executed setup. No repository settings, deployment or application tests are marked complete.

## Purpose and boundaries

**We already have an application. Bootstrap means inspect it, run it, preserve what works, and fill the setup gaps. It does not mean generate another application.**

This replaces the generic greenfield checklist in the earlier package. It preserves its 17-step structure, quality/security goals, worktree isolation and one-large-PR policy, but adapts the implementation to the existing full fork. The architectural source is [architecture.md](context/technical/architecture.md); release scope is [requirements.md](context/business/requirements.md). No new Master CV business behavior belongs in T000. Existing upstream accounts, tables, routes, editor and tests must not be deleted to make the application "empty."

Keep one product: existing React/Vite/TanStack Router, Hono/Node, shared packages, authentication and PostgreSQL. No new Next.js/Nest application, second editor, parallel UI library or additional queue framework during bootstrap.

### Read-only source observation, not a tested release

On 2026-10-21 the GitHub connector reported `0-sayed/reactive-resume` as **public**, with default branch `main`. The observed main commit was `44929ad102d382588eea8ed87d943e385fb9cf80`. These are dated observations; recheck before acting. This is not a command to reset your checkout or an endorsement of that commit for production.

At that commit:

| Observed source                                                                                                           | Consequence for T000                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root package.json declares version 6.0.4, Node 24.x, pnpm 12.14.0 and Turborepo                                           | Inspect the current checkout and use its compatible pinned toolchain/lockfile first; do not initialize a replacement workspace                                   |
| Scripts already include lint, format:check, typecheck, knip, test, test:e2e and build                                     | Reuse and verify them; add only missing orchestration or coverage                                                                                                |
| Lint/format use Oxlint/Oxfmt; `check` runs fix/write commands                                                             | Do not install ESLint/Prettier just to satisfy the old template; do not call the mutating `check` script a read-only CI gate                                     |
| AGENTS.md already contains substantial repository guidance                                                                | Merge Master CV rules, preserve useful technical guidance and redirect project issues/PRs to our repository                                                      |
| Existing instructions describe native Expo/mobile code as well as web/server                                              | Native iOS/Android delivery and upstream feature-parity rules are not implicitly part of this web-product roadmap; retain code and assess shared-build impact    |
| compose.dev.yml includes PostgreSQL, Redis and SeaweedFS, fixed host ports, a shared project name and floating image tags | Reuse required services, make worktrees isolated, and pin reviewed compatible images; do not remove a real dependency because an earlier plan called it optional |
| The development health probe uses `/api/health`; scripts load `.env.local`                                                | Use actual endpoints and environment precedence, not invented `/health` or hidden developer settings                                                             |
| Existing LICENSE is MIT with an upstream copyright notice                                                                 | Preserve required copyright and license notices; do not replace them with an unrelated fresh license                                                             |

Sources and limits are recorded at the end. Source reading is not installation, runtime verification or a complete repository audit.

## The approach in one view

```text
Existing Reactive Resume source + history
                    |
        Confirm owner and visibility
                    |
       Add Planning/ and merge AGENTS.md
                    |
    T000: one large bootstrap/adaptation PR
                    |
          Validate and merge into our main
                    |
   T001 Arabic engine + T002 shared UI become eligible
                    |
       Remaining tasks follow the dependency graph
```

**Default startup: branch-first.** Put the planning files in the first commits of `chore/t000-project-bootstrap`, complete bootstrap on that same branch, and merge one large T000 PR. No separate small planning PR is required. The optional main-seeded alternative is described in Step 3 for orchestrators that cannot read a bootstrap branch.

## Phase 0 — Adopt the Fork and Stage Planning

### Step 1 — Confirm ownership, visibility and planning inputs

- [ ] Confirm which business-controlled repository is the long-term Master CV home, and your authorized developer access. The existing `0-sayed/reactive-resume` fork can be the starting copy; no second application is required.
- [ ] Confirm whether the client permits public source and planning. **Do not push client-private planning to the current public fork without permission.** Public GitHub forks stay public; they cannot independently be made private while remaining in that fork network.
- [ ] For a private client product, recommend an owner-controlled private standalone repository populated from the same source and Git history, with an upstream remote for reviewed updates. This changes hosting/ownership, not the full-code reuse architecture. Obtain approval first; do not automatically delete, detach, transfer or rename the existing fork.
- [ ] Retain upstream notices and review dependency/asset conditions. A private repository is not permission to erase attribution.
- [ ] Extract the v1.2 planning ZIP into a temporary folder **outside** the checkout first. It contains planning only, not application source.
- [ ] Confirm these inputs are present: this file, `context/` (11 documents), `roadmap/` (Task Graph, DAG and 14 briefs), and the supplied root AGENTS.md merge input.

Expected repository structure after merging:

```text
master-cv/                        # local folder name, not a new app
├── .git/                         # existing Git history
├── apps/                         # existing upstream source
├── packages/                     # existing upstream source
├── docs/                         # existing upstream technical/product docs, if present
├── migrations/                   # existing migrations
├── package.json                  # existing workspace manifest
├── pnpm-lock.yaml                # existing dependency baseline
├── AGENTS.md                     # merged repository + Master CV instructions
├── CLAUDE.md                     # preserve/consolidate applicable existing guidance
└── Planning/
    ├── bootstrap.md
    ├── context/                  # Master CV product/technical/design authority
    │   ├── README.md
    │   ├── decisions.md
    │   ├── business/
    │   ├── technical/
    │   └── design/
    └── roadmap/
        ├── README.md
        ├── tasks.md
        ├── dependencies.mmd
        └── tasks/                # one scope/acceptance brief per large PR
```

The upstream `docs/` folder is **not** the superseded standalone Master CV docs package. Keep upstream documentation that explains the maintained code. Do not move or replace it with `Planning/context/`.

### Step 2 — Clone the approved destination and add planning safely

- [ ] Clone the approved product repository, or use an existing clean checkout. Preserve unrelated local work; never delete `.git`, reinitialize history, force-reset main or regenerate the root manifest.
- [ ] Check `git status --short`, `git remote -v`, the default branch and current commit. Record the starting SHA in the T000 PR. Stop if the actual source materially conflicts with the planned stack; do not silently rewrite it.
- [ ] Keep `origin` pointing to **our product repository** and `upstream` pointing to `reactive-resume/reactive-resume`. Fetch for inspection; do not automatically merge the latest upstream main or overwrite local Master CV changes.
- [ ] Review inherited workflow triggers, release/deployment jobs and GitHub App installations before the first push. Do not attach production secrets or enable publishing/deployment as a side effect of adding planning.
- [ ] From the selected product main, create `chore/t000-project-bootstrap` unless that task branch already exists. If it exists, inspect and resume the correct branch; do not overwrite somebody else's work.
- [ ] Copy `Planning/` from the staged package into the repository root. If it already exists, compare/merge changes; do not blindly overwrite task statuses or in-progress briefs.
- [ ] Merge the supplied AGENTS.md with the existing repository instructions. Preserve valid build/test/code conventions; resolve conflicts in favor of explicit Master CV scope/security decisions.
- [ ] Keep existing LICENSE, README, `.gitignore`, `.editorconfig`, package files and lockfile. Amend missing setup details in T000; create a missing file only after checking it truly is absent.
- [ ] Review staged paths and scan for credentials, personal CVs and private client material. Commit planning as part of T000. Do not add an extracted ZIP, `.env.local`, node_modules or a duplicate `docs/` tree.

Example preparation commands **only after the repository/visibility decision**:

```bash
# Example for the existing public fork ONLY if public publication is approved.
# For a private/client-owned destination, replace the repository URL.
# Skip clone/cd when already in the correct checkout.
git clone https://github.com/0-sayed/master-cv.git master-cv
cd master-cv

git status --short
git remote -v
git rev-parse HEAD

# Run only when upstream is absent; otherwise inspect its existing URL.
git remote add upstream https://github.com/reactive-resume/reactive-resume.git
git fetch origin
git fetch upstream
git switch main
git merge --ff-only origin/main
git switch -c chore/t000-project-bootstrap

# STOP here to copy/merge Planning/ and merge AGENTS.md from the staged package.
# If there is a conflicting branch/worktree or divergent main, resolve deliberately.
git diff --stat
git add Planning/ AGENTS.md
git diff --cached --stat
git diff --cached --check
git commit -m "docs: add Master CV planning and fork bootstrap"
```

This planning commit is **not** a completion claim or a separate PR. Do not run `git add .` blindly. Audit workflow triggers before pushing the branch, and preserve required approvals.

### Step 3 — Safe GitHub settings and bootstrap start mode

- [ ] Configure or confirm main protection/rulesets under the owner's policy: require PRs, resolve conversations, block force pushes/deletion, and enable automatic head-branch deletion where appropriate.
- [ ] For a solo project, do not require an impossible self-approval; configure review policy to match the actual team. Do not bypass an existing required reviewer.
- [ ] Require actual existing check names, not assumed labels from the old template. Add the T000 check names after they exist and have run; verify the final protection settings before merging T000. No production-deployment requirement should be needed to merge a local bootstrap.
- [ ] Verify the repository/account plan supports the desired protection. A missing permission or unavailable feature is a blocker to resolve with the owner, not a reason to claim protection exists.
- [ ] Review CODEOWNERS, workflow destinations, badges and issue/PR links so project work targets our product repository—not the original upstream.
- [ ] Choose and record one start mode:

| Mode                                               | Where Planning is committed before T000 execution                                     | How to start                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Branch-first (default)**                     | On `chore/t000-project-bootstrap`                                                     | A focused bootstrap agent reads this branch and completes T000 there. If the orchestrator can safely select a bootstrap ref, register that ref and dry-run it; otherwise run T000 directly without starting the scheduler. After T000 merges, register/switch orchestration to our main. |
| **B — Main-seeded (only if explicitly permitted)** | One owner-authorized planning-only seed commit on main, before protection prevents it | Verify local main equals origin/main, register Planning on main, dry-run to confirm only T000 is runnable, then create the T000 task worktree. This is a setup commit, not another roadmap PR.                                                                                           |

Never disable protections or force-push merely to seed Planning. If direct main commits are forbidden, use Mode A. If the orchestration system cannot read a task branch, that blocks **automated bootstrap**, not safe execution of T000 by a focused agent. Full multi-task orchestration waits for the merged T000 foundation.

[Task Graph](roadmap/tasks.md#task-graph) remains the only scheduling/status authority: 16 rows, every size `L`, three-digit IDs T000–T015, dependencies before numeric priority, no execution waves. The Mermaid graph mirrors status: unchecked `[ ]` = gray, checked `[x]` = green. Do not mark T000 done just because planning has been committed.

## Phase 1 — Audit and Adapt Existing Tooling

For each checklist item record **verified existing**, **changed**, **not applicable with reason**, or **blocked**, with a command/file/evidence reference in the PR. The checklist does not assume everything needs to be installed again.

### Step 4 — Runtime and language configuration

- [ ] Read the current `.nvmrc`, engines, packageManager, Dockerfiles and CI setup. Align compatible runtime/package-manager versions and record the exact versions actually used.
- [ ] Install using the existing lockfile (`pnpm install --frozen-lockfile` when still applicable). Do not delete the lockfile to make installation succeed.
- [ ] Preserve workspace TypeScript aliases/export maps and strict checks. Evaluate additional compiler flags incrementally; no mass rewrite to match a generic tsconfig.
- [ ] Preserve generated/build boundaries and validate actual app/package builds, not only a root TypeScript invocation.

### Step 5 — Preserve workspace tooling

- [ ] Inspect and retain the existing pnpm catalog/workspaces and Turborepo task graph. Do not replace them with Nx or scaffold a second monorepo.
- [ ] Map the web/server/shared-package responsibilities from actual source.
- [ ] Retain native-mobile or integration packages unless an explicit decision removes them. Responsive web Figma screens are not approval to deliver native app stores, voice tools, upstream plugins or employer B2B.
- [ ] Document shared-build impacts. Any intentional change in supported validation targets must be explained and approved; do not silently skip a failing package.

### Step 6 — Adapt quality gates, not the tool brand

- [ ] Reuse the installed formatter/linter (observed Oxlint/Oxfmt), typechecking and Knip. Add narrowly justified missing checks instead of a parallel ESLint/Prettier pipeline.
- [ ] Distinguish check-only scripts from fix/write scripts. CI must fail on formatting drift rather than fix it.
- [ ] Avoid repository-wide formatting churn, blanket config ignores, global test exemptions or mass unsafe-cast changes merely to satisfy a template.
- [ ] Establish a read-only validation command for formatting, lint, typecheck, dead-code analysis, appropriate tests and application/package build. Generated build outputs are allowed; tracked source rewrites and Docker image builds are not part of this routine command.

### Step 7 — Review and adapt existing CI

- [ ] Inspect every relevant inherited workflow, trigger, permission and secret reference before enabling it in our repository.
- [ ] Keep usable jobs, add missing validation, pin verified Actions revisions, and use least privilege (`contents: read` by default).
- [ ] Ensure PR metadata actions do not check out/execute untrusted PR code with privileged credentials.
- [ ] Disable or explicitly gate inherited publishing, deployments and upstream-specific automations. Never reuse upstream registry names or deployment targets for Master CV.
- [ ] Keep conventional PR-title checks, appropriate dependency review and author assignment where supported. Configure one compatible dependency-update service; do not add duplicate bots.
- [ ] Use actual unique check names and record the required-check mapping for Step 3. Confirm package-manager caching, timeouts and stale-run cancellation.

## Phase 2 — Make the Existing Fork Reproducible and Isolated

### Step 8 — Inspect existing application entrypoints

- [ ] Start from existing web/server/auth/data/document code. Do not generate new app/module skeletons that duplicate it.
- [ ] Locate health, startup, shutdown, OpenAPI/oRPC and static-serving behavior. Reuse actual routes; observed `/api/health` is not automatically `/health`.
- [ ] Keep existing API generation/documentation where suitable. Do not install Nest/Swagger or add competing `/docs` routes solely because the generic checklist named them.
- [ ] Record what runs locally and what is intentionally disabled. Preserve existing business behavior; implement no new Master CV auth flow, table, AI handler or payment endpoint in T000.
- [ ] Necessary existing migrations may run against isolated test databases. Never run them against production during bootstrap.

### Step 9 — Local infrastructure and full-stack worktree isolation

- [ ] Use existing Compose/env conventions (`compose.dev.yml` and `.env.local` were observed). Include only the services required by the selected runtime path.
- [ ] Keep required PostgreSQL/Redis/object-storage services until inspection proves a supported alternative. Redis appearing upstream is not permission to add a second queue; "no Redis required" in earlier planning is not proof it can be removed.
- [ ] Replace unreviewed floating image tags with tested compatible pins without accidentally upgrading database data formats.
- [ ] Use worktree-compose with the installed version's documented configuration. Verify generated settings and commands rather than inventing CLI flags.
- [ ] Give every worktree a unique Compose project namespace; no hardcoded `container_name` and no shared fixed project name overriding isolation.
- [ ] Parameterize host ports and bind local-only services to loopback. Isolate database data, object files/buckets, Redis state where used, app logs and browser/test artifacts.
- [ ] Isolate frontend, backend, email-preview, proxy and callback URLs too. Account cookies/browser storage require separate browser contexts or equivalent isolation; ports alone do not isolate cookies.
- [ ] Ensure environment URLs resolve correctly in both host-run and container-run modes. Derive worktree URL overrides from allocated ports and local secret inputs, not committed credential-bearing URLs.
- [ ] Keep `.env.example` documented and secret-free, with explicit placeholders. Generate required local secrets in ignored files; pass CI test-only values through its isolated environment, never live credentials.
- [ ] Verify migration/seed commands use the correct worktree's environment. Audit Docker build contexts/watch mounts and `.dockerignore` so private planning/credentials are not unintentionally shipped.
- [ ] Provide reliable stop/restart and stale-process cleanup without deleting unrelated worktrees or development data.

### Step 10 — Observability and lifecycle

- [ ] Reuse the current structured logger; add missing request correlation, redaction and error handling without introducing a second logger gratuitously.
- [ ] Normalize/validate inbound correlation IDs. Do not log CV text, AI prompts, secrets, payment-card data or signed URLs.
- [ ] Verify health/readiness behavior, dependency failure reporting, connection-pool runtime errors and graceful shutdown.
- [ ] Confirm background dev processes, pools and containers stop cleanly.

### Step 11 — Test foundation on the real stack

- [ ] Reuse existing Vitest, browser tests and source conventions where present. Check the installed versions' official guidance before adding APIs.
- [ ] Have at least one real pure-unit example, one integration test with an isolated backing service and one smoke/e2e path against the actual Hono/web runtime.
- [ ] Use a suitable HTTP test client and existing integration harness; no "booted Nest app" test and no second framework.
- [ ] Add Testcontainers only where it fills a genuine missing isolation/integration need; do not duplicate an adequate existing harness.
- [ ] Preserve useful existing tests and coverage. Record baseline failures and fix/bootstrap-scope causes; do not delete tests, weaken gates or claim a Figma simulation as a runtime pass.
- [ ] Record coverage scope and an agreed non-regression baseline rather than forcing an unexplained global percentage across inherited code.
- [ ] Keep synthetic fixtures. No real OpenRouter calls, real charges, production infrastructure or customer CVs are needed for T000.
- [ ] Detailed Arabic import/PDF/DOCX qualification belongs to T001/T004; bootstrap smoke tests do not certify those release gates.

### Step 12 — Developer workflow and agent instructions

- [ ] Merge root AGENTS.md with the supplied Master CV guidance and preserve applicable nested instructions. Document actual scripts, env/worktree traps, module ownership and Planning paths.
- [ ] Aim for a root entry point under 200 lines by linking detailed repository guidance in suitable existing docs, not deleting useful technical rules.
- [ ] Explicitly reconcile upstream-wide native-app parity, public-sharing, external-provider and issue-tracker instructions with Master CV's personal web scope and approval gates.
- [ ] Inspect existing CLAUDE.md. If its useful guidance is consolidated, use `@AGENTS.md`; do not overwrite unique existing instructions without preserving/reconciling them.
- [ ] Reuse the existing task runner or add a thin convenience wrapper. Every documented command must exist and be tested; no duplicate Makefile just for appearances.
- [ ] Update README setup/branding context carefully while keeping license attribution and upstream maintenance guidance.

### Step 13 — Security baseline

- [ ] Audit gitignore and staged files for `.env` variants, keys, certificates, secrets, local data and personal documents. Preserve intentionally public test fixtures; broad ignores must not hide required source assets.
- [ ] Reuse/add staged secret scanning through the existing hook manager; fail clearly when required tooling is missing. Test hook installation without overwriting unrelated global hooks.
- [ ] Confirm tool commands against installed versions; do not copy obsolete secret-scanner flags or fabricate Actions SHAs.
- [ ] Preserve the supplied dependency-policy intent to reject unapproved GPL-3.0/AGPL-3.0 additions; review actual dependency licenses and approved exceptions. Do not replace the upstream MIT notice.
- [ ] Keep dependency vulnerability checks separate from fast local validation. Evaluate their availability for the repository plan; document missing permissions or a reviewed alternative.
- [ ] Keep private data outside public source, test artifacts and CI logs. Provider selection does not authorize real-data processing.

### Step 14 — Complete CI and image verification

- [ ] Verify format-check, lint, typecheck, Knip, applicable tests and app/package builds run against the selected lockfile.
- [ ] Give integration/browser jobs the required isolated backing services and synthetic env values.
- [ ] Run security audits in a dedicated network-dependent job; no claim of successful audit when registry access failed.
- [ ] Verify container builds in a separate job. PRs must not publish runnable images or deploy; use supported cache-only verification where appropriate.
- [ ] Publish immutable images from approved main workflows only after the owner-controlled registry, credentials and destination are explicitly configured. Publication is not required just to finish local bootstrap.
- [ ] Ensure cancellation/concurrency behavior cannot interfere with another worktree or active release. Never enable production jobs just to obtain a green check.

### Step 15 — Targeted dependency and configuration audit

- [ ] Preserve the known baseline first. **Do not run a blanket latest-version upgrade** or regenerate the entire dependency graph as a bootstrap step.
- [ ] Make only justified compatibility/security/tooling updates, with their lockfile diff and regression evidence.
- [ ] Resolve Action pins from real upstream revisions using a verified resolver or the GitHub API; retain version annotations. Do not invent hashes or automatically upgrade every action.
- [ ] Re-run actual validation and dedicated security/image checks after changes. Document what was changed versus already present.
- [ ] Check instructions, scripts, environment templates and CI agree. Remove unsupported numerical claims inherited from the generic checklist rather than treating them as requirements.

### Step 16 — Clean-checkout smoke test and second review

- [ ] On a clean checkout, install with the pinned lockfile, provision synthetic local configuration, start required services, run existing migrations and validate the application.
- [ ] Start the real Hono/web runtime, verify the actual health endpoint and one safe minimal UI/API path, then stop cleanly.
- [ ] Run two worktrees together. Show distinct URLs/ports/data and browser contexts; stopping one must not stop or alter the other.
- [ ] Inspect the final diff for duplicate infrastructure/frameworks, broken instructions, secrets and unintended publishing targets.
- [ ] Perform a second review of fork/history preservation, setup repeatability, CI names, environment consistency and cleanup evidence. Separate reviewers are useful when available; do not claim subagents that did not run.
- [ ] Record actual commands/results, starting/tested commits, known failures and remaining external blockers. A partial run is not a pass.

### Step 17 — One large bootstrap PR and handoff

- [ ] Use branch `chore/t000-project-bootstrap` and PR title `chore: bootstrap project`.
- [ ] Target **our product repository's main**, not the upstream project's main. Explicitly verify the PR repository, base and head.
- [ ] Keep clean commits inside this single L PR: planning/instruction merge; tooling/CI adaptations; local runtime/worktree isolation; validation/documentation fixes. Do not create a separate small planning PR.
- [ ] Include the adaptation record, commands/results, actual checks, environment/worktree evidence, preserved notices and explicit absence of newly implemented Master CV business behavior.
- [ ] Resolve required review/conversation/check obligations before merge. Never bypass protection to make bootstrap appear finished.
- [ ] After merge, synchronize local main to origin/main, point orchestration at merged `Planning/`, and reconcile T000 status through the authorized process. Update the single Task Graph and Mermaid color together; do not invent a separate status system.
- [ ] Confirm the next eligible tasks from the real graph: T001 and T002 after T000. Start concurrent work only after isolation has been demonstrated.
- [ ] Keep production purchases, real-CV AI, merchant activation and charging disabled until their separate gates pass.

## What comes later, not in bootstrap

| Work                                                         | Owning roadmap package                   |
| ------------------------------------------------------------ | ---------------------------------------- |
| Arabic document engine acceptance/fixes                      | T001; complete native CV journey in T004 |
| Design system and product surfaces                           | T002–T004 and later feature packages     |
| Approved OpenRouter adapter, durable AI and usage accounting | T005; feature workflows in T006–T007     |
| Moyasar integration and billing                              | T010                                     |
| OCI Saudi deployment, mail, domain, backup/restore           | T012                                     |
| Integrated release qualification                             | T013                                     |

Local Docker support is bootstrap infrastructure. Buying or deploying the Saudi production platform is not.

## Sources and review limits

This adaptation is derived from the user's original bootstrap checklist, the existing Master CV context/roadmap, and the following limited read-only checks on 2026-10-21:

- [Observed fork metadata](https://api.github.com/repos/0-sayed/reactive-resume) and [main reference](https://api.github.com/repos/0-sayed/reactive-resume/git/ref/heads/main). Recheck ownership, visibility and head before acting.
- Pinned source: [package.json](https://github.com/0-sayed/reactive-resume/blob/44929ad102d382588eea8ed87d943e385fb9cf80/package.json), [AGENTS.md](https://github.com/0-sayed/reactive-resume/blob/44929ad102d382588eea8ed87d943e385fb9cf80/AGENTS.md), [compose.dev.yml](https://github.com/0-sayed/reactive-resume/blob/44929ad102d382588eea8ed87d943e385fb9cf80/compose.dev.yml), [LICENSE](https://github.com/0-sayed/reactive-resume/blob/44929ad102d382588eea8ed87d943e385fb9cf80/LICENSE).
- GitHub: [fork visibility](https://docs.github.com/en/pull-requests/reference/forks), [upstream remotes](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/configuring-a-remote-repository-for-a-fork), [protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [PR creation options](https://cli.github.com/manual/gh_pr_create).
- GitHub's [fork detachment documentation](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork) explains a separate ownership/visibility operation with metadata-loss risks. No detachment is authorized or performed by this checklist.

These checks establish selected source facts, not a full checkout, verified package availability, applied repository settings, successful CI, Word output, provider activation or cloud deployment. New setup recommendations are labeled above; inherited requirements and the 14-task dependency graph remain intact.
