# Master CV — Roadmap execution guide

**Roadmap:** 1.1 · **Prepared:** 2026-11-03 · **Status:** Proposed implementation plan; owner review required.
**Delivery policy:** 16 large PRs, T000-T015; every Task Graph row has size `L`.
**Basis:** current context v0.8, Figma `K3UTevGCFBhsoSLXH7BDni`, fork-adapted bootstrap v1.2.

## What is source-derived and what is proposed

The [bootstrap checklist](../bootstrap.md) defines the Planning shape, exact Task Graph columns, numeric
priorities, dependency-driven concurrency, node colors and first bootstrap branch. The
[requirements](../context/business/requirements.md), [decisions](../context/decisions.md), technical references
and design handoff govern behavior and existing gates. This roadmap is an implementation proposal, not approval.

## Placement and context paths

Use one authoritative `Planning/context/` set alongside `Planning/bootstrap.md` and this `Planning/roadmap/`.
The [index](tasks.md#task-graph) is the only scheduling/completion authority; [dependencies.mmd](dependencies.mmd)
must mirror it. Each `tasks/Txxx-<slug>.md` is the execution brief for one large PR.

`Context` cells are Planning-root-relative, as in bootstrap. Markdown links are file-relative. Existing upstream
`docs/` remains distinct and useful; do not duplicate context there or overwrite repository/nested instructions.
The actual checked-out layout was listed for ownership boundaries, not certified as an implementation of this plan.

## Master CV fork bootstrap contract

The fork-specific [bootstrap](../bootstrap.md) supersedes the earlier generic greenfield checklist. Preserve its
17-step disposition/evidence structure, history, licenses, useful tooling and existing application code.

- Keep React/Vite/TanStack Router and Hono/Node. Reuse runtime, API docs/health, schema and installed test tools;
  no Next.js/Nest skeleton, second editor or parallel component library.
- Add no new Master CV business behavior in T000. Existing migrations may boot isolated local databases.
- Preserve actual PostgreSQL/Redis/object services needed by the fork; no additional queue/cache merely from examples.
  Isolate namespaces, state, ports, generated URLs, browser contexts and artifacts; keep local services loopback-bound.
- Default branch-first Mode A adopts Planning and completes T000 in `chore/t000-project-bootstrap` as one L PR,
  with PR title `chore: bootstrap project`. Register later main-driven scheduling after authorized merge.
- Main-seeded Mode B needs explicit permission and must respect protection. Do not add a small planning-only PR
  or pretend Planning exists on main. Confirm product ownership/visibility before pushing private planning.
- Product PR/issue destination is `0-sayed/master-cv`; preserve the reviewed upstream relationship. Audit inherited
  deployment/publication before pushing; bootstrap does not authorize publication, paid resources or live deployment.

Task rows and matching Mermaid classes change when the PR is first shipped (owner decision 2026-11-14). The checkbox records delivery bookkeeping; all release gates and branch protection still apply. Unshipped work stays pending.

## Why the dependency graph is shaped this way

T000 is the sole initial root. T001 proves document output while T002 supplies the bilingual shell.
T003 delivers email accounts/private workspace and the career mapping consumed by T004's native import/editor.
T005 owns free usage enforcement; T006/T007 add reviewed improvement, tailoring and independent language versions.
T009 delivers active deletion/durable records; T012 depends on T009 and owns backup restore/deletion replay.
T011 follows T007/T009 with a simple truthful landing page; T010 adds paid grants and the pricing section later.
T013 qualifies the free beta after T007/T009/T011/T012. T015 qualifies paid release after T008/T010/T013;
T008 may explicitly withhold either tool. S32-S34 and S24-S27 are post-beta.
T014 activates mobile authentication after T003/T009, independently of beta and paid critical paths.
Dependencies outrank numeric priority. After T005 merges, T006 and T009 may become eligible subject to
their blockers; T012 becomes eligible after T009 as well. T008 and T010 wait for T013 and have priorities
135 and 136, after T013 and before T014/T015. Preserve the exact
[scheduler contract](tasks.md#scheduler-contract): no waves, ID-only FIFO or fake completed setup nodes.

## Large-PR and ownership rules

Read D35 and the handoff before every UI task. Share visual APIs across task ownership boundaries; feature-local implementation does not authorize local visual standards.

Use task-specific migrations and feature-local changes. Coordinate shared schemas, package exports, global routes,
lockfiles and environment files before merge. No competing migrations, duplicate queues or credit counters.
Update onto merged dependencies, resolve conflicts and rerun affected checks without imposing a global wave.
Commit-sized implementation steps stay inside their task's L PR.

Requirement owners below coordinate implementation/evidence; consumers still implement their parts and satisfy gates.
T003 owns email accounts and the career mapping. T005 owns B-C11 free limits and AI accounting;
T010 consumes that contract and only adds paid grants. T014 owns B-C17/B-C18, S37-S39 and A14-A16,
including settings/recovery and supplier evidence. Mobile stays off at launch until company registration,
sender approval and the gates pass; it does not block T013 or T015. T009/T012 split deletion and restore evidence.
T004 owns B-C07 and the S10/S12 check panel. T001 owns A04 extraction qualification, T007 selected-job evidence,
and T006 reviewable semantic edits. Later consumers integrate through existing panel/runtime contracts, not cycles.
T002 owns the English interface copy contract at `Planning/context/design/copy-deck.json`; each feature adds its keys
there and to existing catalogs. The parallel source must be reconciled before English UI release.

## Shared definition of done

Reject newly added raw UI font/color/spacing/radius values and control-size overrides outside shared definitions; require semantic roles and shared variants. Verify equal header/body start edges and invariant sidebar width across dashboard routes, matching toolbar heights, full select-label fit and avatar inset. Check AR/EN, narrow/wide layouts and every changed dialog/state; record evidence separately from functional smoke.

- Record exact requirement IDs, map-resolved masters, named states/dialogs and current authorized Figma renders.
  Never hard-code node IDs in briefs or implement Popup Simulator/Note frames. Unavailable access blocks visual evidence.
- Inspect real existing React/Hono packages and reuse them; implement validated persisted state, ownership and recovery.
  Do not fake saving, charging, export, SMS/authentication or deletion.
- ALWAYS inspect Arabic RTL and English LTR at desktop 1440 and mobile 390 with correct fonts/direction. Keep UI
  language independent of CV language. Use Noto families per design/approval; retain document-font qualification.
- Run appropriate repository checks, real interaction tests and affected native/shared-package checks. Separate
  synthetic/sandbox evidence from real-route, Word-viewer and production evidence; record failed/unavailable checks.
- Preserve A01-A16 as applicable gates, never inferred passes. Record tested commits, fixtures/configuration,
  artifacts, unresolved decisions and unavailable features. Complete reviews required for the actual merge scope.
- Mark [x] when the task PR is first shipped (owner decision 2026-11-14); update the graph and Mermaid class together.
  Merging engineering work does not authorize external activation or complete open release gates.

## External gates and owner actions

These are preconditions for affected operations, not S/M tasks or fake completed nodes. Synthetic work with test
credentials/provider doubles may proceed; missing resources required for actual acceptance remain execution blockers.

| Boundary                 | Owner action / gate                                                                                                                                                                            | Affected tasks                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Repository/bootstrap     | Ownership/visibility, safe workflows, protection/access, setup mode and later scheduler registration                                                                                           | T000; all merges                        |
| Input/export             | D04 PDF-only launch: A01/A04 and agreed input/template/font evidence; Word unavailable, future A05 Word Windows/Mac and Google Docs matrix                                                     | T001/T004/T011/T013                     |
| Real CV/AI               | D09/D16 Saudi core/database/backups, opt-in overseas OpenRouter/first-use consent, PDPL transfer contract safeguards, minimized CV text/no contact fields; exact route and A11 evidence remain | T005-T009/T012/T013                     |
| Later mobile Phase 1     | Off at launch; company registration, sender approval, D20/D21 and A14-A16 before activation; A15 before any real-number send                                                                   | T014 only; not a beta/paid prerequisite |
| SMS Phase 2              | SMS-code-only sign-in stays off; separate owner risk decision and scoped A14-A16 evidence required                                                                                             | T014 disposition only                   |
| Live paid offer          | D05/D18 launch hypothesis/server AI+CV enforcement decided; Moyasar written rate card/merchant-method activation, T07 tax/refund/renewal details and A09 still required. PDF never paywalled   | T010/T015; T011 pricing added with T010 |
| Production resources     | D15 owner-controlled Saudi accounts, exact quote/region, retention/RPO/RTO and restore/operations evidence                                                                                     | T012/T013/T015                          |
| Retained/public features | D17/A13 privacy/availability/support evidence; D23 requires authenticated owner-scoped PDF checks only, no public launch endpoint                                                              | T004/T005/T013                          |
| Future scope             | D01 employer scope and D12 human review/public visibility need separate authorization; B-C14-B-C16/B-E01-B-E08 remain deferred                                                                 | T013 disposition only                   |

**Open company inputs:** legal entity name, commercial registration, controller contact and Saudi lawyer review of
final AR/EN privacy/terms/notices; SMS sender papers/provider quotes apply only to T014. Real users require company
registration and applicable real-data gates; before then the beta journey remains synthetic.

**Owner demand check:** alongside the build, run a small candidate validation of usefulness, interest at 49 SAR and
reasons to return, using no real CVs and taking no payments; decide subscription automation after it. No new framework.

Moyasar is the selected gateway; raw PAN/CVV and CV content never belong in our payment backend/logs/payloads.
Provider-authenticated durable webhooks plus retrieved status/amount/currency/ownership, not browser redirects, drive
idempotent entitlements. Tokenization does not approve all recurring methods. UI uses neutral gateway naming until
permission; design Start/Focus fixtures match D05/D18, while 49 SAR remains subject to the Moyasar quote/activation. Real charging/AI/data gates remain; DOCX is excluded from launch and unavailable until future reconsideration/A05.

## Validation and evidence limits

Run [check.py](check.py) for task/owner IDs, the acyclic dependency graph and local links/anchors.
Planning checks do not establish application behavior, visual fidelity, gate approval or activation.

## Requirement and screen coverage matrix

Exactly one primary owner is assigned per defined requirement and per observed inventory screen. Consumers are
evidence/integration participants, not additional owners. A gate owner coordinates evidence; this is not a passed gate.
B-C14-B-C16, B-E01-B-E08 and A10 have deferred-disposition ownership only, not personal-MVP implementation.

### Requirement ownership

| Requirement ID | Owning task                                            | Consumers / disposition                                                      |
| -------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| B-C01          | [T003](tasks/T003-private-career-workspace.md)         | T002, T009, T011, T013                                                       |
| B-C02          | [T004](tasks/T004-cv-workspace.md)                     | T001, T006, T011, T013                                                       |
| B-C03          | [T004](tasks/T004-cv-workspace.md)                     | T002, T006, T013                                                             |
| B-C04          | [T006](tasks/T006-reviewable-ai.md)                    | T004, T005, T007, T008, T013                                                 |
| B-C05          | [T004](tasks/T004-cv-workspace.md)                     | T003, T006, T007, T008, T013                                                 |
| B-C06          | [T007](tasks/T007-job-language-variants.md)            | T004, T005, T008, T013                                                       |
| B-C07          | [T004](tasks/T004-cv-workspace.md)                     | T001, T002, T005, T006, T007, T011, T013                                     |
| B-C08          | [T004](tasks/T004-cv-workspace.md)                     | T001, T011, T013                                                             |
| B-C09          | [T007](tasks/T007-job-language-variants.md)            | T001, T002, T004, T008, T011, T013                                           |
| B-C10          | [T008](tasks/T008-personal-career-tools.md)            | T005, T013                                                                   |
| B-C11          | [T005](tasks/T005-ai-runtime-usage.md)                 | T010 paid grants; T002, T007, T011, T013, T015                               |
| B-C12          | [T009](tasks/T009-account-data-controls.md)            | T003, T011, T012, T013                                                       |
| B-C13          | [T008](tasks/T008-personal-career-tools.md)            | T013                                                                         |
| B-C14          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-C15          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-C16          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-C17          | [T014](tasks/T014-mobile-authentication.md)            | Later increment, off at launch; T003/T009 contracts                          |
| B-C18          | [T014](tasks/T014-mobile-authentication.md)            | Later increment, off at launch; T009 settings/proof contracts                |
| B-E01          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E02          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E03          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E04          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E05          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E06          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E07          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-E08          | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| B-O01          | [T009](tasks/T009-account-data-controls.md)            | T003, T012, T013                                                             |
| B-O02          | [T012](tasks/T012-saudi-deployment-operations.md)      | T004, T005, T006, T008, T009, T013                                           |
| B-O03          | [T013](tasks/T013-integrated-release-qualification.md) | T006, T007                                                                   |
| B-O04          | [T010](tasks/T010-moyasar-billing.md)                  | T005, T012, T013                                                             |
| B-O05          | [T009](tasks/T009-account-data-controls.md)            | T012, T013                                                                   |
| B-O06          | [T011](tasks/T011-public-experience.md)                | T010, T012, T013                                                             |
| A01            | [T001](tasks/T001-arabic-document-engine.md)           | T004, T006, T013                                                             |
| A02            | [T006](tasks/T006-reviewable-ai.md)                    | T004, T005, T007, T008, T013                                                 |
| A03            | [T007](tasks/T007-job-language-variants.md)            | T004, T005, T006, T008, T013                                                 |
| A04            | [T001](tasks/T001-arabic-document-engine.md)           | T004, T007, T011, T013                                                       |
| A05            | [T001](tasks/T001-arabic-document-engine.md)           | T004, T011, T013                                                             |
| A06            | [T004](tasks/T004-cv-workspace.md)                     | T003, T005, T006, T007, T008, T009, T010, T013                               |
| A07            | [T002](tasks/T002-design-system-shell.md)              | T000, T001, T003, T004, T005, T006, T007, T008, T009, T010, T011, T013       |
| A08            | [T003](tasks/T003-private-career-workspace.md)         | T000, T001, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013       |
| A09            | [T010](tasks/T010-moyasar-billing.md)                  | T011, T012, T013                                                             |
| A10            | [T013](tasks/T013-integrated-release-qualification.md) | Deferred disposition only; separate future scope required                    |
| A11            | [T005](tasks/T005-ai-runtime-usage.md)                 | T001, T003, T004, T006, T007, T008, T009, T010, T011, T012, T013             |
| A12            | [T012](tasks/T012-saudi-deployment-operations.md)      | T000, T003, T005, T009, T010, T013                                           |
| A13            | [T013](tasks/T013-integrated-release-qualification.md) | T000, T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012 |
| A14            | [T014](tasks/T014-mobile-authentication.md)            | Later mobile increment only; no beta/paid dependency                         |
| A15            | [T014](tasks/T014-mobile-authentication.md)            | Company/sender/supplier evidence before any real-number send                 |
| A16            | [T014](tasks/T014-mobile-authentication.md)            | Later mobile/recovery integration evidence                                   |

### Screen ownership

S24-S27 billing and S32-S34 retained tools are post-beta; T008 may withhold either tool.

The published inventory and map contain 40 screen records: S01-S39 plus mobile pane S08b. S37-S39 each have
desktop and mobile masters linked in the handoff. T014 owns their reusable screens and the S28 mobile settings
instances; they are off at launch. Published designs do not close A14-A16, D20 recovery acceptance or A15 real-SMS restrictions. T002 supplies
the bilingual shell to every owner.

| Screen                     | Owning task                                    | Consumers / registry status                                                            |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| S01 Landing                | [T011](tasks/T011-public-experience.md)        | T002 shell/copy; T013 qualification                                                    |
| S02 Create account         | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S03 Verify email           | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S04 Welcome / first visit  | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S05 Start a CV             | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S06 Import CV              | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S07 Confirm imported facts | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S08 Editor: write          | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S08b Editor: preview       | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S09 Editor: design         | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S10 Review overview        | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S11 Review a suggestion    | [T006](tasks/T006-reviewable-ai.md)            | T002 shell/copy; T013 qualification                                                    |
| S12 Export                 | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S13 Export ready           | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S14 Sign in                | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S15 Forgot password        | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S16 New password           | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S17 My documents           | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S18 Career information     | [T003](tasks/T003-private-career-workspace.md) | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S19 Target a job           | [T007](tasks/T007-job-language-variants.md)    | T002 shell/copy; T013 qualification                                                    |
| S20 Job evidence           | [T007](tasks/T007-job-language-variants.md)    | T002 shell/copy; T013 qualification                                                    |
| S21 Language versions      | [T007](tasks/T007-job-language-variants.md)    | T002 shell/copy; T013 qualification                                                    |
| S22 Version history        | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S23 Save conflict          | [T004](tasks/T004-cv-workspace.md)             | T002 shell/copy; T013 qualification; later feature tasks reuse private/editor paths    |
| S24 Plans & usage          | [T010](tasks/T010-moyasar-billing.md)          | T002 shell/copy; T013 qualification                                                    |
| S25 Review purchase        | [T010](tasks/T010-moyasar-billing.md)          | T002 shell/copy; T013 qualification                                                    |
| S26 Payment confirmed      | [T010](tasks/T010-moyasar-billing.md)          | T002 shell/copy; T013 qualification                                                    |
| S27 Manage subscription    | [T010](tasks/T010-moyasar-billing.md)          | T002 shell/copy; T013 qualification                                                    |
| S28 Account settings       | [T009](tasks/T009-account-data-controls.md)    | T002 shell/copy; T013 qualification                                                    |
| S29 Privacy & data         | [T009](tasks/T009-account-data-controls.md)    | T002 shell/copy; T013 qualification                                                    |
| S30 Delete account         | [T009](tasks/T009-account-data-controls.md)    | T002 shell/copy; T013 qualification                                                    |
| S31 Deletion requested     | [T009](tasks/T009-account-data-controls.md)    | T002 shell/copy; T013 qualification                                                    |
| S32 Cover letter           | [T008](tasks/T008-personal-career-tools.md)    | T002 shell/copy; T013 qualification                                                    |
| S33 Applications           | [T008](tasks/T008-personal-career-tools.md)    | T002 shell/copy; T013 qualification                                                    |
| S34 Application details    | [T008](tasks/T008-personal-career-tools.md)    | T002 shell/copy; T013 qualification                                                    |
| S35 Privacy and terms      | [T011](tasks/T011-public-experience.md)        | T002 shell/copy; T013 qualification                                                    |
| S36 Help and contact       | [T009](tasks/T009-account-data-controls.md)    | T002 shell/copy; T013 qualification                                                    |
| S37 Mobile number          | [T014](tasks/T014-mobile-authentication.md)    | Later increment; off at launch until company registration, sender approval and A14-A16 |
| S38 Verify mobile          | [T014](tasks/T014-mobile-authentication.md)    | Later increment; off at launch until company registration, sender approval and A14-A16 |
| S39 Mobile verified        | [T014](tasks/T014-mobile-authentication.md)    | Later increment; off at launch until company registration, sender approval and A14-A16 |
