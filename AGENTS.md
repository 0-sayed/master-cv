# Master CV — coding-agent entry point

**Planning bundle:** v1.2 · Fork bootstrap adapted 2026-10-21.
**Product/design context baseline:** v0.8 / Figma “Master CV: Design (v1)”; no new release approval.

This file routes implementation work. Read `Planning/context/README.md` before changing code.
The implementation planning package is this file plus `Planning/bootstrap.md`,
`Planning/context/` and `Planning/roadmap/`. Archives, root redirects, older ZIPs
and HTML prototypes are not required. Follow `Planning/roadmap/tasks.md` for the
16 large PRs (T000–T015); every scheduled PR is `L` and dependency-driven.
When adding this package to an existing repository, merge these instructions with
its current AGENTS.md; do not blindly overwrite existing project guidance.

## Required context

- Read `Planning/context/decisions.md`, `Planning/context/business/requirements.md` and the relevant
  sections of `Planning/context/technical/architecture.md`.
- For UI work, read `Planning/context/design/design-system.md`, `Planning/context/design/figma-handoff.md`
  and the target entry in `Planning/context/design/figma-map.json`.
- For AI, sensitive data, billing or deployment, read the corresponding technical
  reference and its approval gates. Do not infer permission from a mock screen.

## Roadmap and bootstrap

- Start with `Planning/roadmap/README.md`, `Planning/roadmap/tasks.md` and
  `Planning/bootstrap.md`. The first eligible large PR is T000.
- `Planning/bootstrap.md` is now the fork-specific checklist, not a greenfield
  template. Preserve history, license notices, working tooling and existing app code.
- Default: add planning on `chore/t000-project-bootstrap`, complete T000 in the
  same L PR, then start the normal scheduler from merged main. A main-seeded
  alternative requires explicit permission; never bypass protection.
- Confirm repository ownership/visibility before pushing client planning.
  Target PRs/issues at our product repository, not upstream.
- Keep upstream `docs/` and useful nested agent instructions. Merge this root
  guidance; do not replace the existing repository guide blindly.
- Reuse installed formatter/linter/test tools and runtime dependencies. No
  blanket latest-version upgrade, second app or mandatory native-mobile release.
- All scheduled PRs remain L; commit-sized steps stay inside their task PR.

## Design source

- Design file: https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni
- Start at Cover `0:1` and Dev Handoff `67:2` (a short pointer; full prototype navigation
  is in `Planning/context/design/figma-map.json`). Prototype flow 0 starts: desktop `57:11289`,
  mobile `58:4837`; flow 1 demo: desktop `54:11651`, mobile `58:2405`.
- Implement from the masters on Screens: Desktop (`2:11`) and Screens: Mobile (`2:12`),
  one per screen S01–S39 (S37–S39 mobile OTP, gated); states and form dialogs live on States & Patterns.
  Never implement `Popup · Simulator…`/`Popup · Note…` prototype frames.
- The JSON map supplies exact master, state, dialog and prototype IDs. These are
  dated observations; verify the current target name and render.
- The previous file (MLee5DqKgw3Gu0CgtnocTN) is an unchanged reference only.
- English (LTR) is a curated page of key screens; other screens use the same
  components with Dir=LTR variants and the Type collection in English mode.
  Interface strings (ar-SA and en-US) come from `Planning/context/design/copy-deck.json`.
- AR/EN means interface language. The English-document states are separate.
  Never translate or overwrite saved CV content merely to switch the interface.
- Read live Figma context through your own authorized connection. A link does not
  provide credentials. If unavailable, state the blocked visual verification;
  do not invent what an unseen frame contains.

## Invariants

- Extend one full Reactive Resume application using the existing React/Vite/
  TanStack Router and Hono foundation. Inspect the actual checked-out code first.
- Reuse current components, tokens, schemas and services; no new Next.js/Nest
  rewrite, separate editor app or parallel UI library without an explicit decision.
- Requirements/security/decisions govern behavior and release. Figma governs
  visual composition and interaction intent within those constraints.
- Figma state frames are not a one-to-one list of application routes or tables.
  Review launchers and error-simulation controls are not public product features.
- Prototype values and Start/Focus prices are fixtures, not approved production
  config. Their one current home is the design-system fixture section.
- Use the approved Saudi riyal vector and an accessible currency label. Latin digits
  in interface copy.
- Word (DOCX) appears as not available until A05 passes. Interface copy names a
  neutral Saudi payment gateway until use of the Moyasar name is approved.
- Preserve user facts, ownership, saved revisions, Arabic/English isolation and
  explicit approval of AI changes. Never fake saving, payment, export or deletion.
- Moyasar (ميسر) is the user-selected payment gateway. Use the planned payment adapter
  inside the existing Hono backend; selection does not establish merchant activation,
  recurring-method eligibility, an approved offer or a fee quote.
- Start with synthetic fixtures and test credentials. Do not deploy paid resources,
  enable real-CV processing or charge customers merely because these docs exist.
- Employer B2B, public sharing and unreviewed integrations remain gated.
- Old HTML/generator packages and archived docs do not override current guidance.

## Before completing a task

1. Record requirement IDs and exact Figma frames; inspect adjacent recovery states.
2. Implement in the actual fork using real validated state/services.
3. Run available repository checks and browser/interaction tests appropriate to
   the task; inspect AR/EN desktop/mobile output with correct fonts and direction.
4. Preserve A01–A16 gates as applicable. Figma renders cannot prove Arabic PDF/
   DOCX integrity, authorization, persistence or payment correctness.
5. Report code changes, frame links, actual tests and unresolved approvals.
   Do not claim subagents, user studies or tests that did not run.
6. Update affected docs when an agreed decision changes. Resolve material conflicts
   explicitly instead of silently inventing scope, fees, policies or data behavior.

## Existing repository guidance and reconciled scope

Use `docs/development.md` for the verified setup, worktree, validation and CI contract.
Read `docs/agents/repository-guide.md` in full before editing code. It preserves
upstream setup, app/package ownership, code conventions, tests, environment rules,
and deployment details. Paths in that guide are relative to the repository root.
The Master CV instructions above and these explicit scope rules take precedence
where inherited guidance conflicts:

- Product repository and PR/issue destination: `0-sayed/master-cv`. Keep `origin`
  there and `upstream` at `reactive-resume/reactive-resume`; review updates before merging.
- Retain native/mobile source and validate affected shared packages. Native store
  delivery and web/native feature parity are not requirements of this personal
  web roadmap; do not silently drop packages from validation.
- Retaining public sharing, provider/BYOK, API/MCP or integration code does not
  authorize exposing it. Apply the feature and processing gates in Planning.
- Inherited publication/deployment commands describe upstream capabilities.
  Audit and gate their workflows before pushing; no registry publication,
  deployment, production secrets or paid services are authorized by bootstrap.
- Start T000 with the existing toolchain and lockfile. No blanket dependency
  upgrades, mass reformat, framework replacement or new business behavior.
- `CLAUDE.md` remains a symlink to this file, sharing the same instructions.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
