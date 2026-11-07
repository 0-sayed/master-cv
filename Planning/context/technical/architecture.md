# Master CV — Architecture

**Version:** 0.7 · **Updated:** 2026-11-03 · **Status:** Architecture preserved; design integration contract points to the Figma file “Master CV: Design (v1)”  
**Owns:** The complete application fork, stack, module/data/document boundaries, durable work and payments.  
**Start here:** [Documentation index](../README.md) · **Decisions:** [Status and approvals](../decisions.md)
**Launch contract (owner decided 2026-11-04):** In Arabic and English, launch uses email + password sign-up, email verification and email password recovery. Mobile sign-up, SMS verification/reset, password-recovery codes and S37-S39 are a later T014 increment, off at launch until company registration, sender approval and A14-A16. D20/D21 retain that increment's Phase 1/Phase 2 contracts; no implementation or gate approval is implied.

> Existing architecture and supplier/release gates remain. This documentation update adds design-to-code routing; it does not choose another framework or claim a repository checkout.

**D09/D16 processing contract:** core app, database and backups stay in Saudi Arabia (OCI Riyadh/Jeddah). OpenRouter AI is overseas, opt-in with explicit consent before first use and a processing contract with PDPL transfer safeguards. Minimize CV text; never send contact fields. Show notices before collection; incident response notifies SDAIA within 72 hours. Legal entity/controller contact and Saudi lawyer review of final AR/EN S35/notices remain company inputs; A11 is not passed.

## Contents

- [Architecture direction](#architecture-direction)
- [Design implementation contract](#design-implementation-contract)
- [Full-application reuse and evidence status](#full-application-reuse-and-evidence-status)
- [Module layout and request flow](#module-layout-and-request-flow)
- [Domain model and versioning](#domain-model-and-versioning)
- [Durable jobs and credit accounting](#durable-jobs-and-credit-accounting)
- [PDF, Word and Arabic quality](#pdf-word-and-arabic-quality)
- [Payments](#payments)
- [Related implementation gates](#related-implementation-gates)
- [Sources and evidence provenance](#sources-and-evidence-provenance)

## Architecture direction

**WORKING, 2026-10-19: fork the entire Reactive Resume application and extend our maintained copy as Master CV.** Keep its existing account, editor and document infrastructure. Retain useful personal career features; expose them only after the applicable quality, privacy and support gates. No wholesale editor extraction or architectural rewrite is a prerequisite.

| Layer           | Working choice                                                                           | Meaning                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend        | React + Vite + TanStack Router; retain existing UI conventions                           | Our dashboard, pages and the existing editor belong to one product                                                                                                                                                          |
| Backend         | Hono on Node.js; retain the existing oRPC/service organization                           | One backend handles authentication integration, documents and Master CV rules                                                                                                                                               |
| Authentication  | Existing Better Auth foundation                                                          | Launch AR/EN email + password signup, email verification and email password recovery with enrolled MFA. T014 later adds D20/D21 mobile Phase 1 after company registration, sender approval and A14-A16; disabled at launch. |
| Database        | PostgreSQL + Drizzle                                                                     | Reuse schema/migrations; add business records and tested authorization                                                                                                                                                      |
| Documents       | Existing resume/schema/import/PDF/DOCX packages                                          | Reuse templates and formatting instead of a second builder                                                                                                                                                                  |
| Long operations | Existing mechanisms where sufficient; PostgreSQL-backed durable worker jobs where needed | Worker is another process of our application, not another product                                                                                                                                                           |
| Files           | Private OCI Object Storage; selected exports may be generated in the browser             | Stored originals/artifacts separate from database records                                                                                                                                                                   |
| AI              | Server-side approved provider adapter or approved existing gateway                       | External inference; no model GPU on our application VM                                                                                                                                                                      |

Upstream documents these frontend/backend and package boundaries. Its normal container serves the built web app and backend together; a separate worker is our proposed extension when durability is needed. [T-S02](#t-s02), [T-S04](#t-s04), [T-S37](#t-s37)

Hono is the HTTP framework, not the product's business model. Our service modules enforce plans, ownership, AI limits and future company access. A future B2B workflow does not itself require Nest. This is an engineering choice, not an assurance of unlimited capacity: scalability and isolation still depend on implementation, data design and operations.

The first product remains **personal-only**. Employer memberships, vacancies and recruiter-facing submissions need separate approval. Do not confuse an upstream personal application tracker with an employer ATS. Keep that distinction in migrations, naming and permissions.

Do not add Next.js merely because the UI uses React; retain the existing frontend and marketing-page approach. Nest/Fastify, a separate full resume service, and a fresh app consuming an extracted editor are **superseded alternatives**, not competing instructions for the build team.

No RAG, vector database, fine-tuning, autonomous coding agent or self-hosted GPU is required for the initial CV + job-description workflow. Use bounded model operations on known input. Revisit retrieval only when a real indexed-content/search requirement appears. [T-S01](ai.md#t-s01)

## Design implementation contract

Use the Figma file “Master CV: Design (v1)” (published S01–S39 plus mobile-only S08b, including S37–S39 OTP masters and S08/S10/S12 ATS targets) through [the coding-agent handoff](../design/figma-handoff.md), [design-system rules](../design/design-system.md) and [verified node registry](../design/figma-map.json). Read root [AGENTS.md](../../../AGENTS.md) for task entry. Mobile-auth behavior remains proposed and gated by A14–A16, D20 recovery and D21 supplier restrictions; D22/D23 ATS boundaries remain unchanged. Design publication does not approve implementation, activation or release and does not replace this architecture.

Implement screens in the maintained **React/Vite/TanStack Router + Hono** fork. Reuse existing components and schemas; inspect the checked-out repository before adding routes, fields or dependencies. Figma states such as `S26 · Payment: pending` and `S11 · Suggestion: accepted`, and the form dialogs on States & Patterns, are not instructions to create hundreds of routes, tables, services or duplicated pages. Represent states with the appropriate components and actual server/client state model.

Figma sample inputs, success screens, credit counters, timers and variable assignments are synthetic. Real ownership, RLS, persistence, queue recovery, entitlement enforcement and payment verification follow the technical requirements here and in [security](security.md). Do not use a prototype redirect as proof of payment or a static paper frame as a document renderer.

## Full-application reuse and evidence status

### What the fork means

Our fork is the whole maintained product source, not a second service behind another startup app. Preserve existing feature folders and reusable packages, customize identity/branding/UX, and add Master CV features where they belong. Existing career facts, provenance, approval or history facilities should be mapped before creating alternatives. A canonical schema conversion may be needed; a parallel career database should not arise accidentally.

The architecture describes internal packages rather than a standalone editor SDK. Retaining the working app avoids up-front extraction of routing, session, draft-state, autosave and UI dependencies. Normal service/module boundaries are still necessary, but do not turn them into a large speculative refactor. [T-S04](#t-s04)

Keep applicable MIT notices and review dependency, asset, font and trademark conditions. Rebrand the product; do not imply endorsement by the upstream author. Pin a release and exact commit, preserve a clean upstream remote, and make migrations/configuration changes reviewable. Updates are selective merges with tests, not blind pulls into production. [T-S03](#t-s03)

### Feature availability policy

Keep useful accounts, editor, templates, versioning and imports/exports. Evaluate existing cover letters, personal tracking and AI/career functions for retention. Disable or withhold unreviewed public sharing, arbitrary external fetching, provider-BYOK paths, plugins and API/MCP access. These can bypass product entitlements, expose data or introduce an unapproved processor even when present upstream. Full reuse is not universal feature approval.

### Document engineering checks

Qualify the actual checked-out build with executable Arabic/mixed-script fixtures; do not infer export quality from locale support.

| Fixture                                  | Required evidence                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Arabic + mixed phone `+966 50 123 4567`  | Display and extracted contact digits/order remain correct.                |
| Date range `2021–2024`                   | Display and extracted chronology remain correct.                          |
| Arabic words and mixed-script paragraphs | Compare PDF.js and Poppler extraction for intact, meaningful text.        |
| Arabic headings and imported calendars   | Preserve section meaning, date precision and labelled calendar ambiguity. |

Record fixtures, renderer/fonts/template versions and actual PDF bytes under A04. DOCX remains unavailable until A05.
Use the existing [Arabic export fixtures](#t-s38); current document capabilities do not replace qualification.

## Module layout and request flow

**One product, one repository, one login, one backend and one primary database.** The upstream workspace has multiple packages/apps; these are code organization, not two independent deployments users must sign into.

The following is a guide to integration locations, not a command to rename the repository:

```text
Master CV fork
├── apps/web/src/features/         existing editor + our onboarding/review/plans UI
├── apps/web/src/routes/           pages and route wiring
├── apps/server/src/http/          Hono HTTP, auth and upload composition
├── packages/api/src/features/    document services + our billing/limits/privacy rules
├── packages/auth/                existing authentication integration
├── packages/db/src/schema/       existing tables + deliberate new business records
├── migrations/                  reviewed schema changes
├── packages/resume, schema/      document/data operations and validation
├── packages/import, pdf, docx/   existing import/render/export implementations
└── worker process               persistent long jobs where we add/need durability
```

The paths above follow the documented application structure; pinning may reveal version differences. [T-S04](#t-s04) Business modules should expose clear functions/interfaces and avoid making billing or company access decisions inside template components.

```text
User's browser (React editor / Master CV pages)
                     |
           Master CV Hono backend
          /           |             \
  authorization   PostgreSQL     private files
                     |
             persistent job record
                     |
              Master CV worker
               /             \
     approved AI route    import/export/lifecycle work
                     |
          saved result → user review → accepted CV revision
```

**Example — Improve a CV:** the authenticated API checks ownership, base revision and remaining allowance; creates/resumes an operation; calls the approved AI route through a bounded worker step; validates the returned suggestion; exposes a reviewable difference; and saves only an accepted edit. Browser refresh/closure does not delete a persisted job. The renderer never decides who has paid.

Suggested module responsibilities: identity/access; career facts and variants; job evidence; suggestion approval; usage/entitlements; payment/webhook processing; exports; privacy/retention; support/audit. Future employer features add organization-domain modules; they do not become privileged shortcuts into every personal CV.

Use existing shared schemas and service conventions. A new worker can use the same service functions and database, with narrowly scoped authorization. Use `pg-boss` if existing persistence does not provide the required job recovery; avoid installing duplicate task orchestration without inspection. No Redis, Kubernetes or separate Nest server is mandatory. [T-S07](#t-s07)

### Locale and bilingual integration (proposed)

**WORKING contract; repository paths verified 2026-11-03, behavior changes not implemented or accepted here.** Reuse Lingui in `apps/web/lingui.config.ts`, existing PO catalogs under `apps/web/locales/` and the extraction/translation workflow in `crowdin.yml`. Keep `en-US` source/fallback and `zu-ZA` pseudolocale. Product-shipped locales are `ar-SA` and `en-US`; inherited catalog availability does not authorize additional product languages. The proposed [copy deck](../design/design-system.md#bilingual-copy-deck-contract-proposed) maps semantic keys/context/typed ICU messages to existing Lingui `msgid`/optional `msgctxt` and compiled identity, not a second runtime catalog.

Existing `apps/web/src/libs/locale.ts` resolves supported query locale/cookie and loads PO messages; `packages/utils/src/locale.ts` owns locale validation/default and URL/alternate helpers. Current inherited default is `en-US`. Extend this machinery to choose explicit supported URL locale, saved signed-in UI preference, cookie, then `ar-SA`; ignore unsupported values. Keep the signed-in UI preference separate from each CV's `ar`/`en` content language. Explicit switching updates the applicable preference/cookie without discarding unsaved forms, CV edits, focus or challenges. Source/fallback stays English while first-visit UI becomes Arabic under the proposed contract.

Reuse `apps/web/src/routes/__root.tsx` and its direction provider/root language handling: root and portals follow UI `lang`/`dir`; CV previews and known different-language passages override them by content language. UI switching never translates, reorders or rewrites CV content. Locale changes must not silently restart verification or change a challenge's snapshotted message language.

Retain query-locale public URLs (`?locale=ar-SA`, `?locale=en-US`) and configure existing `localizedUrl`/`getLocaleAlternates` in `packages/utils/src/locale.ts` with head handling in `apps/server/src/static/web.ts`. The inherited helpers currently use an English default and all catalog locales; explicitly configure Arabic default/`x-default` and only shipped product alternatives. Normalize an equivalent page's canonical URL consistently (including default-query normalization), emit reciprocal AR/EN alternates and use the same canonical addresses in the sitemap. Public landing/help/legal need reviewed localized titles/descriptions/content. Authenticated CV/editor/account routes stay out of indexable alternatives. Switching equivalent pages preserves locale; no new routing system or path migration is implied.

Implement the [numeric/date/search contract](../design/design-system.md#numeric-date-and-search-behavior-proposed) within existing schemas and helpers. `apps/web/src/features/career/knowledge/amount.ts` is an existing numeric-input integration point to inspect, not proof that all fields normalize digits. Application instants remain UTC; CV dates preserve source calendar and precision rather than becoming instants. D24 is OWNER DECIDED 2026-11-04: Gregorian/Latin/Asia-Riyadh display, both Arabic digit sets accepted; label/preserve Hijri or ambiguous imports, no picker or automatic conversion at launch. Extend `apps/web/src/features/documents/filter.ts` with derived NFC/harakat/tatweel/digit comparison, explicit UI-locale collator and stable ID ties; preserve stored names and align any server pagination. Keep this separate from ATS matching rules.

Extend `packages/email/src/templates/auth.tsx` and subjects/callbacks in `packages/auth/src/config.ts` for the proposed AR/EN transactional contract. Snapshot initiating UI locale per request/challenge, retain it on resend and use `ar-SA` when absent. Templates need reviewed subject/HTML/plain-text or SMS bodies, typed interpolation and purpose/domain restrictions; localized links and matching email `lang`/`dir` are required. Maintain explicit deck-to-template identities in the same copy inventory. APIs return stable error codes; map them in `apps/web/src/features/auth/pages/login.tsx` and shared `packages/ui/src/components/form.tsx` handling to reviewed localized field/form messages with preserved input and accessible associations. Raw provider/framework/Zod text is not product copy. [Security](security.md#sms-provider-independent-approval-gate) governs sending/approval; no real SMS is authorized.

Verification remains proposed: [AR/EN core journey matrix](../business/requirements.md#aren-core-journey-acceptance-matrix-proposed), catalog/ICU parity, pseudolocale, RTL/LTR captures after font readiness and independent CV artifact gates. Actual Noto asset delivery and shaping evidence must extend the existing self-hosted `packages/ui/src/styles/globals.css` pipeline; the currently imported upstream faces do not establish Noto readiness.

### Mobile OTP adapter and auth integration

**Later T014 increment only:** all Phase 1/Phase 2 mobile details below are off at launch. T003 finishes with email accounts; company registration, sender approval and A14-A16 precede mobile activation.

**OWNER DECIDED 2026-11-04; not implemented by this document:** Phase 1 includes verified-mobile SMS reset and recovery codes alongside mobile/password registration/login and settings. Email stays optional. SMS-only sign-in remains Phase 2 off. Validate the pinned plugin and A14-A16 before release.

React/TanStack auth UI → existing Hono auth boundary → intent/challenge/abuse coordinator → Better Auth phone-number integration → approved server-only SMS/Verify adapter → Saudi operator. Preserve the existing packages/auth, packages/api service organization, packages/db schema/migrations and apps/server HTTP composition. Put auth integration in packages/auth; locate reusable provider transport behind a server-only interface used by Hono/auth, following the existing billing/email adapter patterns. Do not create a separate auth server, Next/Nest app or browser-to-provider call.

Proposed managed-Verify interface: `start({ toE164, purpose, locale, challengeId, idempotencyKey }) → { providerRequestId, acceptedAt, expiresAt }`; `check({ providerRequestId, toE164, code }) → approved | invalid | expired | exhausted`; optional `cancel`/delivery-status handling only where the contracted product supports it. Map supplier-specific errors server-side; do not expose raw carrier/provider payloads to candidates. For the Taqnyat primary adapter after A15, normalize its no-plus transport format inside that adapter, preserving E.164 internally. D21 selects Taqnyat primary, Unifonic fallback and sender `MasterCV`; both routes remain simulator-only until A15, with company registration/sender papers and written quotes outstanding. The managed-Verify interface remains a proposed integration subject to T16. Protect callbacks according to provider capabilities and reconcile only known message IDs. A delivery callback never authenticates a user.

Use pinned `phoneNumber`/`phoneNumberClient` support with a fixed server OTP policy and validator. Phase 1 uses the phone-number plugin for phone + password sign-in and phone OTP verification within password-bearing sign-up and authenticated add/change; retain existing email + password sign-in. The create flow must establish the password credential and verify the mobile without requiring a real email or email link. Prove the pinned creation/verification hooks can do this before implementation. For managed Verify, `sendOTP` starts the bound provider challenge and ignores the plugin-generated placeholder; `verifyOTP` checks that request after local policy validation. Keep number verification separate from session issuance; only the coordinated create flow with a valid password or password login plus all required factors may establish a Phase 1 session. Do not assume unsupported session APIs.

`/sign-in/phone-number` is Phase 1 password login and must preserve enrolled MFA. `/phone-number/verify` must not issue a session from verification alone. Permit SMS password reset only through the purpose-bound verified-mobile coordinator and a one-use S16 continuation, then S14; MFA is still required on next sign-in. Raw plugin endpoints cannot bypass these rules. Server-deny SMS-only sign-in in Phase 2 off; signup honors password/signup restrictions and settings require independent fresh account proof.

Backend challenge creation/check, provider sends and callbacks have bounded timeouts and idempotency/deduplication. Disable duplicate UI submits. A transport timeout can mean the supplier accepted the request; do not blindly retry billable sends. Keep state recoverable and allow controlled resend after the server cooldown. Do not enqueue raw codes in the generic long-lived job queue or replay stale sends after worker restart.

## Domain model and versioning

**The central invariant is separation of career facts from their presentation.** A source-supported fact means the candidate or uploaded source supplied it. It does not mean the platform verified an employer, degree or qualification.

| Logical entity                              | Purpose and minimum relationships                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User / membership                           | Candidate identity; later organization membership and scoped role                                                                                       |
| Source document                             | Owner, private object key, hash, type, extraction version and retention status                                                                          |
| Career profile / fact                       | Stable fact ID, typed value, source references, confirmation state and profile revision                                                                 |
| Evidence reference                          | Document/page/span or explicit user confirmation supporting a fact                                                                                      |
| CV variant / revision                       | Language, purpose, selected facts, edited wording, template settings and base profile revision                                                          |
| Job description / version                   | Exact supplied text, source label, owner and version hash                                                                                               |
| Analysis / suggestion                       | Input revision hashes, rubric/prompt versions, findings, evidence links and proposed edits                                                              |
| Personal application record                 | B-C13 retained-feature candidate: candidate-owned company/role, external application status, notes and linked CV revision; no employer workspace access |
| Employer application / snapshot — future P3 | Later employer submission; submitted CV, job version, status and company access scope                                                                   |
| Export                                      | Input revision, renderer/template/font versions, artifact key and quality status                                                                        |
| Processing job / model run                  | Operation status, attempts, provider identity, usage and costs                                                                                          |
| Order / payment / credit ledger             | Purchased entitlement, payment state, reserved and settled credits                                                                                      |
| Consent / audit event                       | Purpose-specific choices and minimal evidence of important actions                                                                                      |

These are logical boundaries, not a requirement for one table per row or an instruction to recreate upstream tables. Map the selected fork's existing career, resume, history and approval schemas first; extend them with migrations rather than maintain duplicate sources of truth. The original F05 `resume_versions`, `job_matches`, `subscriptions` and `usage_events` names express requirements, not mandatory table names.

Organization membership, employer job postings and submission snapshots are future concepts outside the confirmed personal-only MVP. An existing personal job/application tracker can remain; distinguish it from employer records in code and permissions. Use relational columns for ownership and queryable states, with versioned JSONB for appropriate structured content.

Only an explicitly accepted master-fact correction increments the profile revision; ordinary CV edits remain local to that CV. Mark dependent variants or analyses potentially stale, show what changed and offer deliberate refresh. Track each language variant's accepted fact revisions independently; translation preserves names, dates, qualifications and meaning.

A job analysis is tied to the exact CV revision, job-description version and rubric version. Reanalysis produces a new result. Exports identify their source revision so a downloaded file can be reproduced.

A future employer submission freezes what was submitted, preventing later profile edits from silently changing recruiter evidence. A personal tracker record is instead the candidate's own job-search record and must not be interpreted as a submitted employer application. Its lifecycle still supports lawful correction, withdrawal, retention and deletion handling. Profile deletion must not imply that all independently held employer records have automatically disappeared. See [Privacy and visibility](security.md#privacy-and-visibility).

### Career data mapping

T003 owns this mapping; T004 consumes it. The fork's `packages/schema/src/career.ts` defines `CareerProfileData` as preferences (roles, locations, priorities, pay and availability), not a structured master CV. `packages/db/src/schema/career.ts` stores text facts with category/source/sourceKey/status and text revisions; `packages/db/src/schema/resume.ts` stores independent CV JSON.

| Existing record     | Build contract                                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Career profile      | Preserve preferences; add profile revision and section/order metadata where needed. Authoritative typed master facts stay in existing career-fact records, without duplicating them here or creating a second career database.                                                                     |
| Career fact         | Keep stable fact IDs and source links; extend with typed section/entity/field/value, confirmation state and a monotonically increasing revision. Master facts are user-scoped; an optional application association is context, not a separate CV master. Preserve text facts and their provenance. |
| Resume data/history | Each base CV and its language/job variants keep independent content and saved revisions. Store base-CV ID plus links to stable fact IDs and the fact revisions accepted by that CV.                                                                                                                |

Editing a CV changes only that CV and its revision. Offer an explicit, reviewed choice to update the master fact; only that choice increments the fact/profile revision. Mark linked variants stale and offer deliberate refresh; never overwrite another CV, language version or tailored copy. Test independent edits, accepted master corrections and stale-link handling without changing user facts silently.

### Import processing boundary

T004 owns native text extraction and contact separation before any optional AI normalization. In the current fork, `apps/web/src/features/resume/import/read-file.ts` sends original PDF/DOCX files through AI paths when available; `packages/api/src/features/ai/service.ts` builds file model messages for PDFs/attachments and model-bound DOCX text. Disable those inherited paths at the server boundary as well as in the UI. Keep original files private; only minimized, contact-separated extracted text may reach a consented approved model. Test direct endpoint bypass and verify payloads contain neither contacts nor original bytes. If native DOCX import proves costly, defer DOCX input explicitly and keep native readable PDF and manual entry.

### Proposed mobile identity and fresh-proof records

**Later T014 increment:** mobile records and optional-email compatibility below do not belong to T003 launch acceptance. Launch keeps the existing email account model.

Phase 1 extends existing auth users with optional unique canonical phone number, verification status/time and binding version through reviewed migrations; retain existing password credentials. Challenges bind account/session/browser, number, binding version and create/add/change/reset purpose; changes/removals invalidate old reset authorization. Password-reset proofs never issue sessions. Store only hashes of 8 recovery codes with consumed/replaced status; atomic redemption and generation replacement prevent replay. SMS-only sign-in purpose remains disabled.

The research snapshot reports non-null unique email, username and displayUsername; verify the pinned schema before implementation. Optional email at Phase 1 mobile + password sign-up needs a reviewed compatibility strategy. If that schema requires placeholders, use opaque random usernames and an unrouteable random email such as an opaque identifier at `accounts.master-cv.invalid`, explicitly marked `emailIsPlaceholder` (provisional). Never embed a number, mark a placeholder verified, show it as a mailbox or send verification/reset/billing mail there; guard every mail path. A placeholder is not recovery. Optional real email uses existing verification rules and independent access proof for later changes; no auto-merge. SMS verification, not an email link, gates mobile sign-up.

**D20 recovery contract, owner decided:** phone-only creation shows 8 single-use codes once (S39), hashed at rest; S15 accepts one instead of SMS for a lost number. Account recovery regenerates with fresh account proof and invalidates the prior set. S28 persistently prompts add-email. Verified-mobile reset checks the proposed 12-month verification-age rule; stale numbers need re-verification with independent account proof, changed/removed numbers cannot reset. Use enumeration-safe responses, notify all verified contacts and revoke all other sessions. Reset never bypasses enrolled MFA at next sign-in. No number/codes/email means no self-service; support never resets on claims alone. A16 must test the working implementation; MFA backup codes remain a separate purpose.

A step-up proof records user, session, action (`phone-change`, `phone-remove`, `data-export`, `account-delete`), method and issue/expiry time. It lasts no longer than five minutes and is consumed once by the matching protected API. Login verification and deletion confirmation cannot reuse a code/proof across purposes. The reported `freshAge: 0` must not be treated as fresh proof; implement explicit checked proof without globally changing unrelated flows in this increment.

## Durable jobs and credit accounting

**A durable queue is a saved to-do list in PostgreSQL.** When a user requests a long analysis, we save a job; a worker performs it and saves its result. Closing the browser or restarting a process does not intentionally discard the job. Ordinary editing/saving need not be queued.

**REC:** use pg-boss for new long-running operations that lack equivalent persistence, with a worker process on the initial VM. Inspect upstream mechanisms first; do not introduce two schedulers for the same task. The queue does not require a separate paid cloud queue or Redis. Persistence/retry does not guarantee that an external AI request or payment occurs exactly once. [T-S07](#t-s07)

Represent long operations as persisted jobs with states such as queued, running, waiting for review, succeeded, failed, cancellation requested and cancelled. Keep attempt history separate from the user-visible operation.

Use idempotency keys scoped to the user, operation, input revisions and relevant configuration version. Enqueue work and reserve entitlements transactionally where supported. Repeated browser requests must return the existing operation rather than start duplicate paid work.

Retry transient rate limits, timeouts and provider failures with bounded exponential backoff and jitter. Permit a small, explicit schema-repair budget. Unsupported formats, policy refusals and missing user evidence require a useful outcome or user action, not endless retries.

Workers need leases/heartbeats or equivalent queue recovery behavior. A recovered worker must check whether the external step already succeeded before repeating a side effect. Store completed artifacts under stable job/revision identities. Treat delivery and execution as potentially repeatable.

Maintain an append-only credit ledger with reservation, settlement and release entries under the [usage contract](../business/requirements.md#usage-contract). One successfully delivered user-requested task costs one operation regardless of internal calls. Settle once; failed/cancelled work costs zero, automatic retries add no charge. Show cost and check/reserve limits before execution. T005 owns Start enforcement; T010 adds paid grants.

Cancellation is best effort once an external request has started. Stop unstarted steps, preserve a clear final status, and reconcile reservations. The provider may still charge the platform for an in-flight request. Track that expense separately from the user’s entitlement.

## PDF, Word and Arabic quality

Retain the upstream export implementation initially. Current architecture uses **Forme/WASM**, with browser and server adapters; it does not require a Chromium/Browserless service. Do not use the earlier generic Chromium memory example as this fork's infrastructure sizing model. Measure the selected renderer under actual concurrency. [T-S04](#t-s04)

PDF/DOCX content comes from accepted structured records and trusted templates, not unrestricted model-generated HTML. Keep renderer/template/font versions, sanitize rich text, restrict embedded assets and reproduce the chosen CV revision. Browser-side downloads may not need permanent storage; stored originals and any server-generated cache belong in private objects with expiry.

### Source requirement versus implementation

F05 proposed server-generated PDF/DOCX. The latest whole-app reuse direction retains an upstream implementation that can generate downloads in the user's browser and exposes server export paths. This is an **explicit architecture adjustment**, not a claim that the original said browser-only. The retained business requirement is a faithful, usable export. Agree any requirement for a server-held final artifact or immutable employer submission when designing that workflow. [T-S05](#t-s05)

D05/D18 and the [usage contract](../business/requirements.md#usage-contract) require race-safe server-side base-CV/copy and AI limits. PDF is always free; all existing CVs stay readable, editable and PDF-exportable after downgrade or failed renewal. Only new base-CV creation above the limit is blocked. Live billing still needs Moyasar written quote/activation and A09.

### ATS readiness pipeline (planned)

**WORKING D22; not implemented or release-approved.** Extend the existing app, not a new ATS service/library. [B-C07/A04](../business/requirements.md#ats-readiness-working) own proposed acceptance.

| Boundary                                 | Planned responsibility                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/resume/src/ats`                | Versioned deterministic structured rules, Arabic/English heading aliases, date/digit handling and field evidence.                                                                                                                     |
| `packages/resume/src/ats-pdf`            | Extend the existing 76-rule harvester/analyzer for actual-file fidelity, RTL order, glyph/Unicode damage and fact/role/date associations. Separate file failures from content tips; internal scores do not define the product result. |
| `packages/pdf` and editor check panel    | Reuse generation/deep check but analyze the exact download Blob/artifact, not editor DOM or an equivalent re-render. Keep extracted-text/page evidence private.                                                                       |
| Existing PDF.js browser/worker path      | Bounded primary extraction of text runs, positions/direction, links and font/operator evidence; no external parser/model for deterministic checks.                                                                                    |
| CI/evaluation                            | Independent pinned Poppler `pdftotext` alongside pinned PDF.js, with recorded versions/options and comparison against labelled gold. Poppler starts in CI, not as a new production dependency.                                        |
| Existing job matcher and Hono AI adapter | Deterministic selected-job term coverage; optional semantic review through existing entitlements, approved-route and suggestion-acceptance services.                                                                                  |

Capture the immutable selected CV revision, included facts/sections, document language and renderer/template/font versions; generate and hash the **actual PDF bytes**. Compare with that selected variant, not all master facts. Findings carry rule/version, dimension, severity, certainty, expected/observed evidence, field/page/span or bounding box and action. Preserve raw extraction separately from conservative comparison normalization; neither changes saved facts/calendars. Imported files without confirmed ground truth report limitations, not certified fidelity.

Cache reports privately by **owner + artifact hash + checker/rule version + extractor version/options**, retaining source revision, template/font/renderer and language identity. Structured findings also key on selected revision; job coverage adds exact job hash/version and matching policy; optional AI adds prompt/model/endpoint versions. Reuse only exact valid keys within the same ownership scope. Changed inputs/versions mark affected results stale until rechecked; bounded retries/idempotency prevent duplicate work or paid calls. Matching hashes never authorize cross-user report/text reuse.

Authorize job creation, workers, status reads, evidence previews, caches and artifact downloads against current ownership, retaining existing persistence/job conventions and RLS requirements. Deterministic checks remain usable without an approved AI route. Model unavailability cannot silently select another processor. Each result distinguishes not checked/checking/complete/skipped or partial/stale/failed; unsupported input, truncation and timeout never mean successful full-file analysis.

Bound bytes, pages, decompression, memory, wall time, concurrency and retries; release worker resources on every exit. Report A observes a 25,000,000-byte cap, 30-page/30-second harvester defaults and 45-second server abort in source. These are not adopted product limits or the 10 MB/6-page design fixtures. Agree measured limits before availability copy; expose exhaustion honestly. Defer custom Arabic parsing, OCR, production commercial parsing and employer matching. A single commercial Arabic parser may be a separately approved benchmark, never a call on every user action.

**OWNER DECIDED D23:** launch `POST /pdf-checks` requires authentication and current document ownership; no public endpoint. Validate every report/text/artifact response, rate/compute limits and [processing controls](security.md#ats-readiness-processing-planned). A later browser-only free checker needs its own decision; these docs do not alter the running route.

### ATS readiness follow-ups

Tracked source observations from report A, **not fixed or runtime-verified here**:

| Follow-up                                                    | Observed location                                                                                                                                | Resolution required before affected availability                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading check runs only for English locale                   | `packages/resume/src/ats/rules.ts:219-222`; PDF section checks also skip non-English analysis in `packages/resume/src/ats-pdf/rules/sections.ts` | Add/evaluate Arabic heading aliases and applicable checks against A04 gold records; do not imply current Arabic coverage.                                                                                              |
| AI writing-review payload minimization requirement (D09/D16) | `apps/web/src/features/resume/editor/check/writing-tab.tsx` and `packages/resume/src/markdown.ts`                                                | Contact fields must never reach models; minimize selected CV text and evidence locators under A02/A03/A11/A13. The policy follow-up is closed as a requirement; implementation must prove exclusion before real-CV AI. |
| Download UI offers Word despite A05                          | `apps/web/src/features/resume/share/download-tab.tsx:45-51`                                                                                      | Reconcile exposure with A05, keeping DOCX unavailable until agreed Word tests pass; retain the exporter.                                                                                                               |

### Arabic and bilingual acceptance

Run the [document engineering checks](#document-engineering-checks). Test phone numbers, email, URLs, year ranges, calendars/date precision, mixed English job titles, punctuation, diacritics, Arabic shaping, paragraphs, links and page breaks. Interface translation/RTL is not document quality. Page locale can change generated labels/direction; it does not translate all candidate content. Keep interface language and each CV's language independently selectable. [T-S06](#t-s06)

For every enabled template, inspect appearance and extract text with at least the selected primary reader plus an independent reader for critical regression cases. Compare meaningful content and order, especially names, contact values, employers and dates. Test long names, multiple pages, wrapped headings, orphan sections, font embedding and missing glyphs. Keep fonts/assets locally hosted when required by our processing policy; validate licence/embedding permission.

For DOCX, verify editable content and directionality in the agreed Microsoft Word versions and any separately supported viewer. Upstream documents a simpler editable layout, not pixel-identical PDF pagination. A05 must pass before DOCX is marketed as available; until then the design shows Word (DOCX) on S12 as not available yet. Preserve existing implementation while fixing verified faults; do not create a second exporter without a measured reason. [T-S05](#t-s05)

No universal ATS score can substitute for output checks. A parser-compatible sample does not prove every employer system works. These are release tests to run, not tests certified by the v0.2 document update.

## Payments

**USER-SELECTED 2026-10-20: Moyasar (ميسر) is the intended payment gateway for Master CV**, replacing its previous candidate status. This is a product integration choice, not an activated merchant relationship. Its documentation covers mada and Apple Pay capabilities, and Apple Pay web setup includes domain registration. Confirm merchant approval, account terms, enabled methods, actual fees and settlement, with special verification of supported recurring methods, before production. [T-S28](#t-s28)[T-S29](#t-s29)

Keep prices and entitlements server-side and versioned. Store SAR amounts in the provider’s required minor units, validating currency and amount on the server. The original mock price and the later Figma fixtures are illustrative, not approved prices to hard-code; see [design-fixture boundaries](../design/design-system.md#illustrative-commercial-data--not-a-production-offer).

Use Moyasar's documented supported/hosted payment experience. Do not send raw card numbers or CVV to Master CV's backend, database or logs; the chosen browser integration and its compliance responsibilities still require review. Introduce a **narrow payment adapter** around its API; keep plan state, orders, invoices, entitlements and credit ledgers in Master CV, not embedded in client-side checkout or provider-specific UI. The browser submits a server-issued order/payment context with server-priced SAR amounts; the backend validates the authoritative provider result. A browser success redirect must never grant credits by itself. Use test credentials in development and never place secret API keys in the React client.

Persist each authenticated webhook in a durable inbox and deduplicate by provider event identity. Use the provider’s documented authentication mechanism: Moyasar’s reference describes a shared secret token, so do not assume a generic HMAC signature. Acknowledge only after durable receipt, then process asynchronously. Verify order ownership, merchant/environment, amount, currency and authoritative payment status. Reconcile pending records periodically because webhook delivery is bounded. [T-S30](#t-s30)

Handle duplicate and out-of-order notifications, refunds and late success after a user closes the page. Credit grants and reversals need idempotent ledger entries. Business policy must define refunds involving already consumed benefits.

Tokenization support does not guarantee unattended recurring billing for every card or wallet. The design's S27 renewal states (renewal off, renewal failed, update payment through the gateway page) assume a recurring subscription and stay fixtures until this check passes. Confirm scheme, issuer, authentication and provider requirements before implementing subscriptions. [T-S31](#t-s31)

### Payment lifecycle implementation checks

**Derived implementation clarification for B-C11/A09, not a new commercial policy:** keep an order separate from its payment attempts. Bind every provider payment to one authorized order, currency and expected amount; prevent a payment ID from granting entitlements to two orders or users. An uncertain initiation/response must be reconciled before automatically creating another charge. Grant access transactionally and at most once for the verified paid business operation; refund, cancellation and renewal events must not create contradictory access states. D05 sets cancel-anytime/no trial-to-auto-renew traps; exact refund/grace/tax/settlement details remain under T07 for approval.

**Fresh source spot-check, 2026-10-20:** Moyasar's webhook reference still documents the event ID, endpoint `secret_token`, `live` flag and bounded redelivery. Authenticate and durably record the event quickly, then do complex work asynchronously; reconcile unresolved orders even when delivery stops. A card-authentication event alone is not proof that an order was paid. This check confirms the documented interface, not merchant activation or a tested integration. [T-S30](#t-s30)

## Related implementation gates

[Delivery phases and acceptance criteria](../business/requirements.md#delivery-phases--engineering-dependencies) govern release sequencing. [Security](security.md) owns RLS, retention and provider approval; [infrastructure](infrastructure.md) owns deployment and cost assumptions. This document reorganization does not alter the application layout or require new services.

A14-A16 gate Phase 1 availability: test pinned auth/adapter/schema, password-bearing optional-email signup, verification, password login/MFA, settings, purpose-bound verified-mobile reset and single-use recovery codes. Cover enumeration, stale/changed/removed numbers, atomic redemption/regeneration, all-contact notices and other-session revocation; next sign-in still needs enrolled MFA. SMS-only sign-in stays server-disabled Phase 2. Retain A08/A11/A12/A13 evidence.

## Sources and evidence provenance

`B-Sxx` identifies a business source and `T-Sxx` a technical source. Source labels, URLs, dates and limitations are retained below. A source link does not certify current pricing, legal compliance, model availability or product quality.

<a id="b-s17"></a>

- **B-S17 Moyasar:** [documentation](https://docs.moyasar.com/), [save-card flow](https://docs.moyasar.com/guides/tokenization/save-card-in-payment), [tokenized cards](https://docs.moyasar.com/guides/tokenization/tokenized-cards); merchant and recurring production arrangements remain unverified.

<a id="b-s18"></a>

- **B-S18 Reactive Resume architecture:** [official application structure](https://docs.rxresu.me/contributing/architecture); reviewed 2026-10-19. The pinned source must be checked before implementation.

<a id="b-s19"></a>

- **B-S19 Reactive Resume licence:** [MIT licence and conditions](https://docs.rxresu.me/legal/license); reviewed 2026-10-19.

<a id="b-s20"></a>

- **B-S20 Reactive Resume exports:** [PDF, Word and data export behavior](https://docs.rxresu.me/guides/exporting-your-resume); reviewed 2026-10-19. Broader personal-tool inventory still needs a pinned-build feature check.

<a id="t-s02"></a>

- **T-S02 — Reactive Resume:** [Official repository and current stack](https://github.com/reactive-resume/reactive-resume).

<a id="t-s03"></a>

- **T-S03 — Reuse license:** [Reactive Resume MIT license](https://github.com/reactive-resume/reactive-resume/blob/main/LICENSE).

<a id="t-s04"></a>

- **T-S04 — Reuse architecture:** [Reactive Resume architecture](https://docs.rxresu.me/contributing/architecture).

<a id="t-s05"></a>

- **T-S05 — Export behavior:** [Reactive Resume export guide](https://docs.rxresu.me/guides/exporting-your-resume).

<a id="t-s06"></a>

- **T-S06 — RTL documents:** [Reactive Resume page format and language](https://docs.rxresu.me/guides/selecting-page-format).

<a id="t-s07"></a>

- **T-S07 — Durable queue:** [pg-boss official repository](https://github.com/timgit/pg-boss).

<a id="t-s08"></a>

- **T-S08 — Backend choices:** [Fastify scoped plugins](https://fastify.dev/docs/latest/Reference/Plugins/) and [NestJS Fastify adapter](https://docs.nestjs.com/techniques/performance).

<a id="t-s23"></a>

- **T-S23 — Browser PDF option:** [Playwright page.pdf](https://playwright.dev/docs/api/class-page#page-pdf).

<a id="t-s28"></a>

- **T-S28 — Payment capabilities:** [Moyasar official documentation](https://docs.moyasar.com/).

<a id="t-s29"></a>

- **T-S29 — Apple Pay web setup:** [Moyasar Apple Pay domain registration](https://docs.moyasar.com/guides/apple-pay/web-registration).

<a id="t-s30"></a>

- **T-S30 — Webhook behavior:** [Moyasar webhook reference](https://docs.moyasar.com/api/other/webhooks/webhook-reference). Verify exact event identifiers against the selected API version and sandbox.

<a id="t-s31"></a>

- **T-S31 — Tokenization limitations:** [Moyasar tokenized cards](https://docs.moyasar.com/guides/tokenization/tokenized-cards) and [saving a card during payment](https://docs.moyasar.com/guides/tokenization/save-card-in-payment).

<a id="t-s37"></a>

- **T-S37 — Upstream deployment:** [Reactive Resume Docker guide](https://docs.rxresu.me/self-hosting/docker). Version-specific configuration must be verified before provisioning.

<a id="t-s38"></a>

- **T-S38 — Arabic export fixtures:** [PDF text integration tests](../../../packages/pdf/src/forme/export-text.integration.test.ts). Extend these fixtures on the actual checked-out build; source presence is not a passing A04 result.
