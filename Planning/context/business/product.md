# Master CV — Product

**Version:** 0.8 · **Updated:** 2026-11-03 · **Status:** Product baseline preserved; design references updated to the v1 Figma redesign  
**Owns:** Product direction, audience, scope boundaries and commercial contract.  
**Start here:** [Documentation index](../README.md) · **Decisions:** [Status and approvals](../decisions.md)
**Launch contract (owner decided 2026-11-04):** In Arabic and English, launch uses email + password sign-up, email verification and email password recovery. Mobile sign-up, SMS verification/reset, password-recovery codes and S37-S39 are a later T014 increment, off at launch until company registration, sender approval and A14-A16. D20/D21 retain that increment's Phase 1/Phase 2 contracts; no implementation or gate approval is implied.

> The source-derived product scope and current Figma design, Master CV: Design (v1), do not approve production prices, vendors or release quality.

## Contents

- [Project context and unresolved boundaries](#project-context-and-unresolved-boundaries)
- [Product scope](#product-scope)
- [Target users and outcomes](#target-users-and-outcomes)
- [Reusing the complete application](#reusing-the-complete-application)
- [Commercial model](#commercial-model)

Master CV's initial MVP is **personal only, explicitly confirmed by the user on 2026-10-19**. The proposed personal workflow helps someone turn their real career information and a specific job advertisement into a reviewed, tailored, reliably exported CV. Employer recruitment features are preserved here as future, separately scoped work; they are not part of the initial MVP.

## Project context and unresolved boundaries

**UC:** Sayed is evaluating a freelance project for a Saudi client's brother, can change technology and design, and explicitly confirmed the personal-only first MVP. He later preferred reusing the complete Reactive Resume application and extending it. The latest working architecture retains React and Hono; earlier custom Fastify/Next.js or two-application suggestions are superseded. Existing Hostinger/VPC/gateway assets were reported, not inspected. The owner wants ownership and Saudi compliance from day one.

**OWNER DECIDED 2026-11-04 (D05/D18, D09/D16):** entitlements follow the [usage contract](requirements.md#usage-contract). The core app, database and backups stay in Saudi Arabia; AI through OpenRouter is an opt-in overseas transfer with explicit consent, a processing contract and minimized CV text without contact fields. **Still to complete:** model qualification, supplier contracts and release evidence under the existing gates, plus the [open company inputs](../README.md#open-company-inputs), including merchant activation, and the demand check; release date and final brand approval are also open. **USER-SELECTED 2026-10-20:** Moyasar is the intended payment gateway, subject to merchant and method activation. Working visual tokens and native screen references now exist in [the design system](../design/design-system.md) and [handoff](../design/figma-handoff.md). Saudi market focus is not a Saudi-nationality eligibility restriction.

Email accounts are the launch default. The later mobile increment retains the [OTP contract](../design/specs/otp-spec.md), D20/D21 and A14-A16; it does not block the free beta or paid release.

## Product scope

There are two commercial products in the supplied material, with the first now selected for the initial MVP:

1. **Candidate product — confirmed initial product boundary:** CV creation, import, editing, improvement, job tailoring, versions, bilingual output, and file export. The detailed feature sequence remains proposed below.
2. **Employer product — future separate scope:** branded careers pages, jobs, applications, team review, and candidate status management. This is a small applicant tracking system, not just a jobs publishing page. No employer dashboard, jobs publishing, or applicant management is included in the personal MVP.

The proposed advantage is the quality of the whole workflow: trustworthy facts, strong Arabic and English output, useful job evidence, user control over changes, and dependable documents. “Uses AI” or “has an ATS score” is insufficient differentiation. This is a positioning hypothesis to validate, not a proven market advantage.

**ATS readiness, WORKING D22 (planned):** proposed promise: “Checks the readability of your exported PDF and gives specific fixes to review.” Present PDF readability, writing and content findings, and evidence for a selected job separately. Deterministic term coverage is not a hiring score; optional AI evidence review retains processing gates and explicit approval of every change. State that destination Arabic parser support is unknown unless verified. No guarantee of ATS acceptance, avoiding rejection or an interview. See [B-C07/A04](requirements.md#ats-readiness-working).

The first release should not promise universal ATS passage, interviews, job offers, automatic job applications, a scraped job marketplace, direct LinkedIn account import, or integrations with unspecified employer systems. The original LinkedIn fallback is a PDF downloaded by the user or pasted profile text. The supplied draft does not authorize employers to search every user's CV. A public professional profile or candidate discovery pool would require its own opt-in product design.

**Launch journey, AR/EN:** email + password sign-up → email verification → private workspace; email + password sign-in with enrolled MFA; forgotten password → email recovery link → new password → sign-in. Interface language never changes saved CV language.

Mobile/password signup, SMS verification/reset, recovery codes and S37-S39 belong to T014, disabled at launch until company registration, sender approval and A14-A16. National ID/Absher/Nafath, WhatsApp/voice, SMS as MFA, marketing and automatic merging remain excluded; SMS-only sign-in remains Phase 2 off.

Institution-sponsored candidate access (B2B2C) is a separate commercial choice with its own account and reporting needs; it is outside the personal MVP and is not an employer mini-ATS. Resolve original-source interpretation disputes by inspecting the original; do not invent unseen content.

## Target users and outcomes

| User                                       | Recommended starting need                                                                                     | Successful outcome                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Candidate                                  | Applying to administrative or technical roles in Saudi Arabia, with an existing CV and a real job description | A factually faithful, job-specific CV that can be reviewed and exported |
| Candidate starting from scratch            | Has experience, education, projects, or volunteering but no usable CV                                         | Guided factual entry without requiring invented professional experience |
| Future employer owner or recruiter         | Small team receiving applications through its own careers page                                                | Jobs and applications organized in a shared, controlled workspace       |
| Future applicant visiting an employer page | Wants to apply with a chosen CV                                                                               | Clear submission, receipt, visibility, and withdrawal rules             |
| Platform operator                          | Supports accounts, payments, document failures, and data requests                                             | Resolve cases without uncontrolled access to CV content                 |

Start with a narrow use case, not every profession and seniority level. Do not infer nationality from the target market or penalize graduates for lacking employment history. Student, executive, regulated-profession, and institutional workflows can be researched separately.

Validate email registration, verification, password recovery and enrolled-MFA continuation in Arabic and English. Mobile recovery acceptance belongs to T014 and is not a launch prerequisite.

## Reusing the complete application

**Working direction:** our maintained fork becomes Master CV. Preserve the working application and extend it; do not commission a new account system plus a separate Reactive Resume website. The exact implementation is owned by [the architecture reference](../technical/architecture.md). Upstream is commercially reusable under its MIT licence, with the required notices retained; bundled assets and dependencies also require review. [B-S18](../technical/architecture.md#b-s18), [B-S19](../technical/architecture.md#b-s19)

| Treatment                      | Product consequence                                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep and adapt                 | Accounts, CV editor, templates, saved documents, imports/exports and suitable existing career tools; verify the selected upstream version before promising availability |
| Add Master CV rules            | Saudi bilingual onboarding, approved AI routing, factual review, usage limits, payments, privacy/retention and operational support                                      |
| Review before enabling         | Public CV links, external integrations, optional AI tools, remote import, API/MCP access, external tracking and user-supplied provider credentials                      |
| Add later under separate scope | Employer workspaces, organization memberships, vacancies, reviewer permissions and submitted application snapshots                                                      |

The existing personal application tracker is a tool for **one person's job search**, not the future employer ATS. Keep useful cover-letter and tracker implementations rather than rebuilding them merely because an earlier roadmap placed them later. Their first-release availability remains a product/quality decision. D04 makes launch PDF only; retain DOCX code but keep Word unavailable. Reconsideration uses A05: Microsoft 365 Word on Windows/Mac plus Google Docs, single-column templates and default fonts. [B-S18](../technical/architecture.md#b-s18), [B-S20](../technical/architecture.md#b-s20)

**Full source reuse does not mean unconditional exposure of all features.** Every exposed feature must meet privacy, factuality, authorization and support requirements. Test each enabled Arabic template; keep unvalidated templates or integrations unavailable rather than advertising untested compatibility. No large component-extraction project is a prerequisite; normal module boundaries should keep our business rules maintainable as we extend the app.

## Commercial model

**OWNER DECIDED 2026-11-04 (D05/D18):** Start and Focus follow the [usage contract](requirements.md#usage-contract). Start includes one base CV and 5 once-only AI operations; Focus is the 49 SAR/month hypothesis with 10 base CVs and 100 operations each billing month. PDF export is free; existing CVs remain readable, editable and PDF-exportable after downgrade or failed renewal. Moyasar written rate card, merchant activation and A09 still gate paid launch; UI gateway copy stays neutral.

A slot counts one base CV, excluding its language versions, job-tailored copies and revisions. T005 enforces the free usage contract; T010 adds paid grants. Tax/refund/grace/settlement details still require approval.

Show total payable amount, billing interval, renewal behavior, cancellation, and limits before checkout. Define refunds, failed renewals, downgrades, grace periods, and access to existing documents. Avoid trapping user-created data behind a failed payment. Merchant eligibility, recurring payment behavior, fees, invoicing responsibilities, and production activation remain open. Documented payment methods or card tokenization do not settle those questions. [B-S17](../technical/architecture.md#b-s17)

### Gateway positioning — chosen Moyasar, unvalidated familiarity hypothesis

Use Moyasar through the planned payment adapter inside the existing Hono backend; selection is not merchant/method/recurrence activation or a fee quote. Obtain the written rate card and merchant activation. UI copy stays neutral: “a Saudi payment gateway.” No familiarity, endorsement, compliance or conversion claim is established.

### Current design example versus the production offer

The [single design-fixture section](../design/design-system.md#illustrative-commercial-data--not-a-production-offer) matches D05/D18. Use server-owned versioned entitlements; the 49 SAR hypothesis still needs written quote/merchant activation and A09. Prototype tax/counters are fixtures, not deployed billing configuration.
