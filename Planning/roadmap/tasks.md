# Master CV — Task Roadmap

**Roadmap:** 1.1 · **Prepared:** 2026-11-03  
**Basis:** current context, v0.8 product/design baseline; Figma `K3UTevGCFBhsoSLXH7BDni`; fork-adapted bootstrap v1.2.  
**Scope:** full-fork personal product through paid-release qualification; not future employer B2B.  
**PR policy:** every row is one large (`L`) PR; no small/medium roadmap PRs.

Read [execution rules and bootstrap applicability](README.md) before running this graph. The decomposition, priorities and dependency edges are this roadmap’s implementation proposal; existing source requirements and unresolved approvals retain their authority. All briefs require owner review; they grant no implementation or release approval. T000 is marked complete by explicit owner instruction in the 2026-11-07 T001 closing round.

Read D35 and the handoff before every UI task. Share visual APIs across task ownership boundaries; feature-local implementation does not authorize local visual standards.

## Task Graph

| Done | Priority | Task                                                             | Size | Branch                                       | Depends On                     | Context                                                                                                                                                    |
| ---- | -------- | ---------------------------------------------------------------- | ---- | -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x]  | 0        | `T000` - Bootstrap the existing fork and isolated development    | L    | `chore/t000-project-bootstrap`               | —                              | `roadmap/tasks/T000-project-bootstrap.md`, `bootstrap.md`, `roadmap/README.md`, `context/technical/architecture.md`, `context/technical/infrastructure.md` |
| [x]  | 10       | `T001` - Prove and harden Arabic document compatibility          | L    | `feat/t001-arabic-document-engine`           | `T000`                         | `roadmap/tasks/T001-arabic-document-engine.md`, `context/technical/architecture.md`                                                                        |
| [x]  | 20       | `T002` - Implement the native design system and bilingual shell  | L    | `feat/t002-design-system-shell`              | `T000`                         | `roadmap/tasks/T002-design-system-shell.md`, `context/design/design-system.md`, `context/design/figma-handoff.md`                                          |
| [ ]  | 30       | `T003` - Deliver accounts and the private career workspace       | L    | `feat/t003-private-career-workspace`         | `T002`                         | `roadmap/tasks/T003-private-career-workspace.md`, `context/business/requirements.md`, `context/technical/architecture.md`                                  |
| [ ]  | 40       | `T004` - Deliver the complete native CV workspace                | L    | `feat/t004-cv-workspace`                     | `T001`, `T003`                 | `roadmap/tasks/T004-cv-workspace.md`, `context/business/requirements.md`, `context/technical/ai.md`                                                        |
| [ ]  | 50       | `T005` - Deliver bounded AI operations and usage accounting      | L    | `feat/t005-ai-runtime-usage`                 | `T004`                         | `roadmap/tasks/T005-ai-runtime-usage.md`, `context/technical/ai.md`                                                                                        |
| [ ]  | 60       | `T006` - Deliver reviewed AI extraction and CV improvement       | L    | `feat/t006-reviewable-ai`                    | `T005`                         | `roadmap/tasks/T006-reviewable-ai.md`, `context/technical/ai.md`                                                                                           |
| [ ]  | 70       | `T007` - Deliver job tailoring and independent language variants | L    | `feat/t007-job-language-variants`            | `T006`                         | `roadmap/tasks/T007-job-language-variants.md`, `context/business/requirements.md`, `context/technical/ai.md`                                               |
| [ ]  | 135      | `T008` - Deliver retained personal career tools                  | L    | `feat/t008-personal-career-tools`            | `T007`, `T013`                 | `roadmap/tasks/T008-personal-career-tools.md`, `context/business/product.md`, `context/business/requirements.md`                                           |
| [ ]  | 80       | `T009` - Complete account settings and data-rights workflows     | L    | `feat/t009-account-data-controls`            | `T005`                         | `roadmap/tasks/T009-account-data-controls.md`, `context/technical/security.md`                                                                             |
| [ ]  | 136      | `T010` - Deliver Moyasar billing and entitlement lifecycle       | L    | `feat/t010-moyasar-billing`                  | `T005`, `T013`                 | `roadmap/tasks/T010-moyasar-billing.md`, `context/technical/architecture.md`                                                                               |
| [ ]  | 110      | `T011` - Deliver the public landing and acquisition journey      | L    | `feat/t011-public-experience`                | `T007`, `T009`                 | `roadmap/tasks/T011-public-experience.md`, `context/business/product.md`                                                                                   |
| [ ]  | 75       | `T012` - Prepare Saudi deployment and operational recovery       | L    | `chore/t012-saudi-deployment-operations`     | `T005`, `T009`                 | `roadmap/tasks/T012-saudi-deployment-operations.md`, `context/technical/infrastructure.md`                                                                 |
| [ ]  | 130      | `T013` - Qualify the free beta                                   | L    | `test/t013-integrated-release-qualification` | `T007`, `T009`, `T011`, `T012` | `roadmap/tasks/T013-integrated-release-qualification.md`, `context/business/requirements.md`                                                               |
| [ ]  | 140      | `T014` - Activate mobile authentication                          | L    | `feat/t014-mobile-authentication`            | `T003`, `T009`                 | `roadmap/tasks/T014-mobile-authentication.md`, `context/design/specs/otp-spec.md`, `context/technical/security.md`                                         |
| [ ]  | 150      | `T015` - Qualify the paid release                                | L    | `test/t015-paid-release-qualification`       | `T008`, `T010`, `T013`         | `roadmap/tasks/T015-paid-release-qualification.md`, `context/business/requirements.md`                                                                     |

## Scheduler contract

- `Context` paths are relative to the `Planning/` root, exactly like the supplied bootstrap example. Markdown links inside briefs are relative to those files. Resolve all paths before registration.
- At the initial all-pending state, **only T000 is graph-ready**. Its manual Phase 0 prerequisites still have to be completed; creating this file does not complete bootstrap.
- A task becomes runnable when every `Depends On` task is done and the task has no unresolved execution blocker. Pick the lowest numeric `Priority` among runnable tasks up to the actual configured `maxConcurrency`. Dependencies outrank priority.
- When several PRs are genuinely merge-ready, prefer the lowest numeric Priority whose prerequisites are already on main; do not wait for a blocked or still-running task merely to preserve numerical order.
- No waves, fixed wave merge order or FIFO based solely on task ID. Start another unblocked task as soon as a slot is available. Priorities are tie-breakers, not barriers that require unrelated lower-priority branches to finish first.
- `[ ]` includes pending, in-progress and blocked tasks; runtime ownership/attempt state belongs to the orchestrator, with blockers/evidence in the brief or PR. Use `[x]` only after the PR is merged into main and the task’s acceptance obligations are accounted for honestly. Preserve production-gate status separately.
- Never mark a task done merely because a branch exists, the old Figma prototype passed a simulation, or code was generated. Do not insert extra fake completed tasks for the already-written planning files.
- Apply completion updates through the existing authorized orchestration/reconciliation workflow. Do not invent extra small feature PRs or bypass branch protection to change a checkbox.
- Keep [dependencies.mmd](dependencies.mmd) synchronized with this table in the same status change: pending gray, done green, exactly one class per task. Arrows go prerequisite → dependent.
- Task IDs `T000`–`T015` are three-digit implementation IDs. They are not the two-digit technical decisions `T01`–`T15` in `context/decisions.md`.

## Task briefs

The `Context` column points to the complete scope, source references, Figma keys, ownership boundaries, acceptance evidence and explicit exclusions for each PR. Share visual APIs across feature/task ownership boundaries under D35. Internal steps and clean commits stay within the large PR; they are not separately scheduled small/medium PRs.

- [T014: Activate mobile authentication](tasks/T014-mobile-authentication.md)
- [T015: Qualify the paid release](tasks/T015-paid-release-qualification.md)

## Release is not the same as merge

This graph organizes engineering PRs. It does not encode human procurement or legal approvals as fake feature tasks. Follow [external gates](README.md#external-gates-and-owner-actions) before real data, purchases, enabled formats or live charging. T013 qualifies the free beta and T015 the paid release; T014 independently qualifies later mobile activation. None authorizes automatic activation.
