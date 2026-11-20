# T017 — Private beta on Hostinger

**Task:** T017 · **PR size:** L · **Branch:** `chore/t017-hostinger-private-beta`
**Depends on:** T005, T009, T016 · **Priority:** 76
**Status:** Owner-directed planning scope, 2026-11-16 (D43); no deployment or processing approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; pending until first shipped.

## Goal

Prepare Stage 1, a closed client pilot on Hostinger outside Saudi infrastructure, for invited users only, under about 50 users.
Stage 2 is T012 Saudi production deployment after T013 qualification and client approval of the pilot.

## Scope (in)

- Use the existing application, backend and services with the T016 Sirawise name and approved domain.
- Enforce invitation-only access, including registration and Google OAuth sign-in.
- Include Google OAuth sign-in with approved credentials, redirect URLs and account-linking safeguards.
- Provide a public HTTPS URL for Moyasar test webhooks and SMS testing.
- Keep the pilot private despite public authentication callbacks and provider webhook endpoints.
- Prepare proportionate database/private-object backups, a restore drill, rollback basics and operator recovery instructions.
- Replay applicable deletion records before restored data becomes available, using the existing T009 contract.
- Preserve existing security, authorization, processing and applicable A-gate controls.
- Restrict data to synthetic/consenting-tester data until the owner/legal question below is resolved.
- Hand the server to T014 for phone OTP testing, then T010 for Moyasar test-mode billing.

## Explicit exclusions

- Do not treat Hostinger as Saudi infrastructure or as the approved Saudi production environment.
- Do not authorize real personal CV uploads through pilot access or tester consent alone.
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
- T017 owns closed-pilot infrastructure, Google OAuth readiness, public test endpoints and proportionate recovery basics.
- T009 owns durable deletion records. T012 owns Saudi production recovery qualification.
- T014 owns SMS supplier qualification, sender approval, phone OTP and A14-A16.
- T010 owns Moyasar test-mode integration. T015 owns paid-release qualification.

## Implementation notes

- D43 order: T008 -> T016 -> T017 -> T014 -> T010 -> T013 -> T012 -> T015.
- Record the actual Hostinger location and processor/storage/backup locations before any approved pilot deployment.
- Keep invitations effective across password and Google OAuth entry points.
- Separate test credentials and pilot data from future Saudi production credentials and data.
- Preserve authenticated webhook handling and provider verification in the existing backend.
- Use proportionate backups and restore evidence for this pilot size, with explicit operator responsibilities.
- Record the owner-suggested Saudi SMS provider "T2" as unverified. Resolve its exact name and suitability during T014.
- D43 adds a bounded pilot stage to D09/D16. It does not waive production residency or international-transfer approvals.

## Acceptance evidence

- Record invited-user access and rejection of uninvited password and Google OAuth users.
- Record Google OAuth success, cancellation, failed callbacks and safe account linking.
- Record public HTTPS reachability for provider test callbacks without exposing private pilot data.
- Record a successful backup/restore drill with applicable deletion replay before serving restored data.
- Record recovery responsibilities, rollback steps and the data restriction for the closed pilot.
- Inspect affected authentication and recovery states in Arabic RTL and English LTR at desktop 1440 and mobile 390.
- Inspect fonts and direction with approved interface strings from copy-deck.json.
- Use synthetic fixtures and test credentials. Record functional evidence separately from visual evidence.
- Record unresolved approvals. Do not claim that planned work or Figma renders pass application or legal gates.

## Open approvals/blockers affecting the task

- Owner/legal question: can real personal CV data be hosted outside Saudi Arabia under PDPL and applicable A-gate approvals?
- Decide that question before real users upload real CVs. Until then, use synthetic/consenting-tester data only.
- Tester consent alone does not establish approval for unrestricted real-CV uploads or cross-border processing.
- Owner inputs include the pilot domain, Hostinger location, invited cohort and Google OAuth credentials/consent configuration.
- Verify the exact Saudi SMS provider name "T2" and its suitability later. Existing sender and A14-A16 approvals remain.
- T012 requires explicit client approval of the pilot. Production charging requires T012/T015 and existing payment approvals.

## Done definition

- Deliver the invitation-only pilot foundation and the evidence above within existing security and processing gates.
- Hand public test endpoints to T014 and T010 without enabling production charging.
- Record the remaining owner/legal questions and subsequent client pilot approval separately from task completion.
- Tick this task and update its Mermaid class when the task PR is first shipped, per the roadmap contract.
