# Master CV — Documentation

**Documentation version:** 0.8 · **Reviewed baseline:** 2026-10-24 · **Updated:** 2026-11-04  
**Visual baseline:** Figma file “Master CV: Design (v1)” (`K3UTevGCFBhsoSLXH7BDni`); the previous native v0.5 file stays unchanged as reference  
**Status:** Ready to begin implementation against this working reference. Not a production-release, merchant-activation or legal-approval certificate.
**Launch contract (owner decided 2026-11-04):** In Arabic and English, launch uses email + password sign-up, email verification and email password recovery. Mobile sign-up, SMS verification/reset, password-recovery codes and S37-S39 are a later T014 increment, off at launch until company registration, sender approval and A14-A16. D20/D21 retain that increment's Phase 1/Phase 2 contracts; no implementation or gate approval is implied.

## Start here

**Planning bundle v1.2 places this context under `Planning/context/`, with [fork-adapted bootstrap](../bootstrap.md), [roadmap execution guide](../roadmap/README.md) and root [AGENTS.md](../../AGENTS.md).** Extract outside the checkout first, copy/merge Planning into the **existing application**, and merge AGENTS.md without erasing useful repository guidance. Preserve the upstream `docs/` folder; it is different from Master CV's old standalone documentation. The default is one branch-first T000 PR containing planning adoption and bootstrap, followed by normal scheduling from merged main. Confirm owner/visibility before publishing client planning; see bootstrap Phase 0.

For visual work, open the [Cover](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=0-1) and [Dev Handoff](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=67-2) (a short pointer; the full prototype navigation is in [figma-map.json](design/figma-map.json)), or press Play from the [desktop](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=57-11289) or [mobile](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=58-4837) prototype. Implement from the masters on [Screens: Desktop](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=2-11) and [Screens: Mobile](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=2-12) using [the coding-agent handoff](design/figma-handoff.md) and its exact map. The design stays in Figma; a separate coding environment needs its own authorized access. Never overwrite the design file using an older generator; the previous file ([MLee5DqKgw3Gu0CgtnocTN](https://www.figma.com/design/MLee5DqKgw3Gu0CgtnocTN)) is a read-only reference, not an implementation source.

## Documentation map

| File                                                               | Authoritative responsibility                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [README.md](README.md)                                             | Starting point, topic ownership and blockers                                                                         |
| [decisions.md](decisions.md)                                       | D01-D24 and T01-T16, status vocabulary and dated choices                                                             |
| [business/product.md](business/product.md)                         | Product scope, audience, commercial hypotheses and original-source inventory                                         |
| [business/requirements.md](business/requirements.md)               | Journeys, B-C/B-E/B-O identifiers, phases and A01-A16 acceptance gates                                               |
| [technical/architecture.md](technical/architecture.md)             | Full-fork stack, modules, data, jobs, documents and Moyasar integration                                              |
| [technical/ai.md](technical/ai.md)                                 | Bounded AI workflows, provider candidates, evaluation and cost assumptions                                           |
| [technical/security.md](technical/security.md)                     | Authorization/RLS, private data lifecycle and processor/location approval                                            |
| [technical/infrastructure.md](technical/infrastructure.md)         | OCI, domain/mail, storage/backups, procurement and operating budgets                                                 |
| [design/design-system.md](design/design-system.md)                 | Typography, colors, RTL, components and illustrative commercial values                                               |
| [design/figma-handoff.md](design/figma-handoff.md)                 | How to inspect, implement and test the Figma design; screen table; verification                                      |
| [design/figma-map.json](design/figma-map.json)                     | Published map IDs for S01-S39 plus S08b, product/snapshot states, OTP/ATS components and tokens                      |
| [design/copy-deck.json](design/copy-deck.json)                     | Arabic/English interface strings, typed ICU messages, Lingui identities and transactional copy; owner review pending |
| [design/specs/otp-spec.md](design/specs/otp-spec.md)               | Mobile-auth phases, state contracts and A14–A16 boundaries                                                           |
| [design/specs/ats-design-spec.md](design/specs/ats-design-spec.md) | Published ATS states and feature acceptance contract                                                                 |
| [AGENTS.md](../../AGENTS.md)                                       | Small root instruction file directing coding agents to the relevant context                                          |

## Current working baseline

| Topic                 | Position                                                                                                                   | Status / authority                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Product               | Individuals first; no employer recruitment in the first MVP                                                                | D01 confirmed; employer P3 separately authorized                                                                           |
| Build approach        | Extend the complete Reactive Resume app as one Master CV product and login                                                 | D14/T01; inspect and pin the actual fork                                                                                   |
| Stack                 | React/Vite/TanStack Router + Hono/Node, existing identity, PostgreSQL/Drizzle                                              | Working architecture; no new Next/Nest or separate editor app                                                              |
| Design                | Figma “Master CV: Design (v1)” with current Markdown/token reference                                                       | D11 working; final brand approval remains open                                                                             |
| Payment gateway       | **Moyasar (ميسر), explicitly selected by the user on 2026-10-20**                                                          | T07; merchant activation, enabled methods, fees and recurrence still open                                                  |
| Commercial offer      | Prices, quotas, refund/renewal policies and final availability unapproved                                                  | D05; Figma fixture values are not production approval                                                                      |
| Infrastructure        | Owner-controlled Saudi operations; OCI Riyadh core/Jeddah backups recommended                                              | D15/T02; exact tenancy, quote and procurement unconfirmed                                                                  |
| AI route              | Opt-in overseas OpenRouter, explicit first-use consent, PDPL transfer safeguards, minimized CV text/no contact fields      | D09/D16 decided; exact route/contract and A11 evidence required                                                            |
| Runtime quality       | Arabic imports/exports, persistence, permissions and payment behavior must be proved on the app                            | A01-A16 as relevant; A14-A16 govern proposed mobile auth, not supplier/Phase 2 approval; prototype checks do not pass them |
| Mobile authentication | Phase 1 password-bearing signup/login, optional email, verification/settings, verified-mobile SMS reset and recovery codes | D20/D21 decided; A14-A16 evidence required; SMS-only sign-in Phase 2 off                                                   |

## What to start now

Follow the [task roadmap](../roadmap/tasks.md) and the existing [P0 engineering dependencies](business/requirements.md#delivery-phases--engineering-dependencies). T000 bootstraps the full fork; do not begin another planning or framework-selection project.

1. **Run and pin the full fork with synthetic fixtures.** Inspect actual components, schemas, scripts and services. Record the commit, environment and tests; verify the actual checked-out source baseline.
2. **Prove one complete document path:** import/manual facts → review → edit → save/reopen → free PDF export; retain Word as unavailable at launch. Check Arabic, English and mixed-direction contacts/dates. Retain existing code; fix measured defects instead of rewriting the stack.
3. **Connect bounded AI and the selected payment adapter as their prerequisites pass.** Start Moyasar in the sandbox; keep real data and real charging disabled until their gates below are met. Final retail terms do not need to be invented to build a sandbox integration.

### ATS readiness planning increment

**WORKING D22, 2026-11-03; proposed acceptance, not implemented or release-approved.** Extend the existing structured checker, 76-rule PDF engine, PDF.js actual-export deep check and deterministic job-term matching. Show PDF readability, writing and content findings, and evidence for a selected job as separate issue lists; no universal ATS score or pass guarantee. Destination Arabic parser support is unknown unless verified.

[B-C07/A04](business/requirements.md#ats-readiness-working) specify Arabic extraction quality, labelled-corpus and pinned PDF.js/Poppler checks. [Architecture](technical/architecture.md#ats-readiness-pipeline-planned) owns modules/cache/limits and required source-control follow-ups. Optional AI stays gated; **D23 requires authenticated owner-scoped `/pdf-checks` only at launch**, with no public endpoint. S08/S10/S12 ATS design targets are published in the [handoff](design/figma-handoff.md#ats-readiness-planned) and [ATS design spec](design/specs/ats-design-spec.md). No acceptance evidence is implied.

## Open decisions and release blockers

This is a compact index to existing gates, not new scope or a request to stop safe development.

| Before                                  | Required evidence / decision                                                                                         | Until then                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Buying production services              | Owner-controlled accounts, exact region/resources, written quote, maintenance and recovery plan                      | Use the current budget only as an estimate; no purchase is authorized by the document                         |
| Accepting real CVs                      | Approved processing map, locations, contracts, retention/deletion and access controls                                | Synthetic fixtures only; follow A08/A11/A12 and security                                                      |
| Enabling real-CV AI                     | Approved specific endpoint chain, CV-data contract coverage, fail-closed routing and quality evaluation              | No unapproved provider, OCR or overseas fallback                                                              |
| Advertising supported formats/templates | Agreed input limits, Arabic/English output and Word tests; explicit release list                                     | Do not turn a Figma export button into an availability promise; Word stays “not available” until A05; A04/A13 |
| Charging customers                      | Moyasar merchant/method activation, approved offer/tax/renewal/refund policy and A09 sandbox/reconciliation evidence | Test credentials and fixtures; server-verified payment required                                               |
| Final visual/feature release            | Owner review, keyboard/mobile/browser checks and resolution of source-to-mock gaps such as proposed Google sign-in   | Use the current working design; do not silently delete requirements or add unseen features                    |

Exact rates, entitlements, dates and legal policies remain in their owning topic files. These gates do not change the personal-only MVP or make future B2B requirements prerequisites for a personal release.

| Enabling real-number mobile authentication | A14-A16 evidence for Phase 1 verified-mobile SMS reset/recovery codes, mobile + password and settings; A15 before every real send. SMS-only sign-in remains Phase 2 off | Synthetic simulator only until gates pass; product decisions do not activate services |

## Owner decisions (2026-11-04)

Product direction only; implementation and release remain subject to A01-A16. The [decision register](decisions.md#open-business-decisions-and-risks) owns the full contracts.

| ID        | Decision                                                                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D24       | Gregorian, Latin digits, Asia/Riyadh; normalize both Arabic digit sets; preserve labelled imported dates; no Hijri picker/conversion.                              |
| D20       | Phase 1 verified-mobile SMS reset plus 8 one-time recovery codes, MFA preserved; SMS-only sign-in stays Phase 2 off.                                               |
| D21       | Taqnyat primary, Unifonic fallback, sender `MasterCV`; simulator until A15.                                                                                        |
| D09 / D16 | Saudi core/database/backups; explicitly consented overseas OpenRouter AI with PDPL safeguards, minimized CV text and no contact fields.                            |
| D23       | Authenticated, owner-scoped `POST /pdf-checks` only; no public launch endpoint.                                                                                    |
| D04       | PDF-only launch; Word unavailable. Future A05: Microsoft 365 Word Windows/Mac, Google Docs, single-column/default-font matrix.                                     |
| D05 / D18 | Start free: editing/PDF/ATS, 1 CV, 5 AI operations. Focus: 49 SAR/month hypothesis, 10 CVs, 100 AI operations, cancel anytime; server limits, PDF never paywalled. |

## Open company inputs

1. **The company is not yet registered.** Complete company registration before real SMS, real CV data, live payments or the production cloud account; then provide the legal entity name, commercial registration and controller contact.
2. Saudi lawyer review of AR/EN privacy, terms, S35 and collection notices.
3. Written SMS quotes (Taqnyat, Unifonic) and sender registration papers.
4. Moyasar written rate card and merchant activation.

## Reading and task routing

Read decisions, product, requirements and architecture before implementation. For UI work, then read design-system and figma-handoff, find the target in figma-map and inspect the live frame and adjacent states. For AI, payment, sensitive data or deployment, read the corresponding technical contract and gate before touching the feature.

**Requirements/decisions/security govern behavior and release; Figma governs appearance and interaction intent within those limits.** Figma state frames are not one route or table each. The actual checked-out code is the implementation source. If a frame and the written rules conflict, record both and obtain a decision rather than silently rewriting the architecture or weakening a requirement.

For mobile authentication, read B-C17/B-C18, D20/D21/T16, [OTP scope](design/specs/otp-spec.md) and the security/architecture/infrastructure contracts. Phase 1 includes verified-mobile SMS reset and recovery codes alongside mobile + password registration/login and settings; email remains optional. SMS-only sign-in stays Phase 2 off. Recovery preserves enrolled MFA and never allows support to reset on claims alone; A14-A16 still gate availability.

## One authoritative home per detail

Business behavior and release gates belong in requirements; decision status in decisions; infrastructure prices in infrastructure; model economics in AI; privacy/processing gates in security; visual meanings and mock-commercial values in design-system. The handoff and this index link those topics rather than inventing competing values.

The JSON tokens and frame IDs are a dated observation, not a second editable palette, generated CSS or live synchronization. Refresh the snapshot after agreed Figma changes. Do not copy mock prices or test state assignments into live service configuration.

## Update rules

1. Preserve B-C, B-E, B-O, A, D and T identifiers. Distinguish original requirements, user decisions, recommendations and verified observations.
2. Update the authoritative topic and affected references together; record the date, reason and approval status in decisions.
3. Re-read current Figma and actual source before implementing a mapped target. Links do not grant access or install a connector.
4. Recheck vendor prices and account-specific terms before purchase or production activation. Source references are not supplier quotes.
5. Record real test outputs with implementation changes. Do not claim browser tests, user research, subagents or service behavior that did not run.

## Implementation verification

Current design routing covers S01–S39 plus S08b, including published OTP/ATS targets. See [saved-design verification and limits](design/figma-handoff.md#verification-status-2026-11-04).

Source labels and URLs remain beside their owning contracts; they are not all freshly verified. Older Arabic runtime reports are reproduction leads, not passing acceptance. Application import/export, persistence, authorization, payment and all applicable A01–A16 gates still require implementation evidence.
