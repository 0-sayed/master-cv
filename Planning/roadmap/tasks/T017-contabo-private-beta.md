# T017 — Private beta on Contabo

**Task:** T017 · **PR size:** L · **Branch:** `chore/t017-contabo-private-beta`
**Depends on:** T005, T009, T016 · **Priority:** 76
**Status:** Owner-directed launch scope, 2026-11-20; deploy only from `main` after a normal GitHub PR.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; pending until first shipped.

## Goal

Launch Stage 1 on the existing Contabo VPS in Portsmouth, UK (D43 host amendment 2026-11-20), with open sign-up and real users and CVs.
T012 remains the separate Saudi production deployment after T013 qualification and client approval.

## Scope (in)

- Use the existing application, backend and services with the T016 Sirawise name and approved domain.
- Allow registration without an invite list, including password and published Google sign-in.
- Include Google OAuth sign-in with approved credentials, redirect URLs and account-linking safeguards.
- Provide a public HTTPS URL for Moyasar test webhooks and SMS testing.
- Protect private user data while serving public authentication callbacks and provider webhook endpoints.
- Prepare proportionate database/private-object backups, a restore drill, rollback basics and operator recovery instructions.
- Replay applicable deletion records before restored data becomes available, using the existing T009 contract.
- Preserve existing security, authorization, processing and applicable A-gate controls.
- Allow real user accounts and real CVs under the owner decision recorded 2026-11-20.
- Hand the server to T014 for phone OTP testing, then T010 for Moyasar test-mode billing.

## Explicit exclusions

- Do not treat Contabo as Saudi infrastructure or as the approved Saudi production environment.
- Do not buy infrastructure, activate paid services or deploy merely because this planning task exists.
- Do not enable live payment credentials, production charging or paid release.
- Do not implement T014 phone OTP or T010 billing inside this task.
- Do not infer that Google OAuth, SMS testing or a public URL passes a security or processing gate.

## Requirement IDs

**Owns:** None; D43 adds pilot delivery without transferring requirement ownership.
**Consumes / contributes:** B-O02, A08, A09, A11, A12, A13, A14, A15, A16.
T012 retains B-O02/A12 ownership for Saudi production and consumes proportionate pilot recovery evidence.
T014 retains phone authentication ownership. T010 retains billing ownership.

## Figma targets

- Own no new product screens or prototype controls.
- Exercise mapped authentication, saved-work, service-failure and account deletion/export recovery states.
- Resolve current targets through [figma-map.json](../../context/design/figma-map.json) during implementation.
- Record exact frame links and current renders in implementation evidence through authorized access.

## Source references

- [D43 and D42](../../context/decisions.md)
- [Requirements and acceptance gates](../../context/business/requirements.md)
- [Architecture](../../context/technical/architecture.md)
- [Infrastructure](../../context/technical/infrastructure.md)
- [Security and processing](../../context/technical/security.md)
- [T012 Saudi production](T012-saudi-deployment-operations.md)
- [T014 phone authentication](T014-mobile-authentication.md)
- [T010 billing](T010-moyasar-billing.md)

## Ownership boundaries

- Extend the existing application and deployment tooling. Do not create a second application or authentication service.
- T017 owns the open-sign-up launch infrastructure, Google OAuth readiness, public test endpoints and proportionate recovery basics.
- T009 owns durable deletion records. T012 owns Saudi production recovery qualification.
- T014 owns SMS supplier qualification, sender approval, phone OTP and A14-A16.
- T010 owns Moyasar test-mode integration. T015 owns paid-release qualification.

## Implementation notes

- D43 order (amended): T008 -> T016 -> T017 -> T010 -> T013 -> T012 -> T015; T014 is post-MVP.
- The Contabo VPS is shared with unrelated workloads (Tebyaan, Najiz, LPA, a job-alert bot): isolate Sirawise containers, database, volumes, domain and reverse-proxy entry, set CPU/memory limits, and never modify other workloads.
- Record the Contabo location as Portsmouth, UK, and record storage and backup locations.
- Keep open registration consistent across password and Google OAuth entry points.
- Separate test credentials and pilot data from future Saudi production credentials and data.
- Preserve authenticated webhook handling and provider verification in the existing backend.
- Use proportionate backups and restore evidence for this pilot size, with explicit operator responsibilities.
- Record the owner-suggested Saudi SMS provider "T2" as unverified. Resolve its exact name and suitability during T014.
- D43 adds a bounded pilot stage to D09/D16. It does not waive production residency or international-transfer approvals.

## Acceptance evidence

- Record open password registration and published Google sign-in behavior.
- Record Google OAuth success, cancellation, failed callbacks and safe account linking.
- Record public HTTPS reachability for provider test callbacks without exposing private pilot data.
- Record a successful backup/restore drill with applicable deletion replay before serving restored data.
- Record recovery responsibilities and rollback steps for the live service.
- Inspect affected authentication and recovery states in Arabic RTL and English LTR at desktop 1440 and mobile 390.
- Inspect fonts and direction with approved interface strings from copy-deck.json.
- Use synthetic fixtures for automated checks. Record functional evidence separately from visual evidence.
- Record unresolved approvals. Do not claim that planned work or Figma renders pass application or legal gates.

## Open approvals/blockers affecting the task

- Owner decision 2026-11-20 allows real users and real CVs on the Contabo VPS in Portsmouth, UK.
- The owner selected `sirawise.io`, Resend SMTP from `noreply@sirawise.io`, and published Google sign-in.
- The owner selected Caddy as the shared front door with Tebyaan. Tebyaan's port change is recorded in [PR #50](https://github.com/BandAI-sa/tebyaan/pull/50).
- Verify the exact Saudi SMS provider name "T2" and its suitability later. Existing sender and A14-A16 approvals remain.
- Production charging requires T012/T015 and existing payment approvals.

## Done definition

- Deliver the open-sign-up service and the evidence above within existing security and processing gates.
- Hand public test endpoints to T014 and T010 without enabling production charging.
- Record remaining technical and owner actions separately from task completion.
- Tick this task and update its Mermaid class when the task PR is first shipped, per the roadmap contract.
