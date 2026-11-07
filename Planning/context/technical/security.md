# Master CV — Security and Privacy

**Version:** 0.7 · **Updated:** 2026-11-03 · **Status:** Working build reference; supplier qualification and release gates remain explicit  
**Owns:** Business privacy requirements, technical authorization, retention and approved processor/data-flow gates.  
**Start here:** [Documentation index](../README.md) · **Decisions:** [Status and approvals](../decisions.md)
**Launch contract (owner decided 2026-11-04):** In Arabic and English, launch uses email + password sign-up, email verification and email password recovery. Mobile sign-up, SMS verification/reset, password-recovery codes and S37-S39 are a later T014 increment, off at launch until company registration, sender approval and A14-A16. D20/D21 retain that increment's Phase 1/Phase 2 contracts; no implementation or gate approval is implied.


## Contents

- [Privacy and visibility](#privacy-and-visibility)
- [Identity, isolation and document security](#identity-isolation-and-document-security)
- [Privacy and data lifecycle](#privacy-and-data-lifecycle)
- [Provider approval](#provider-approval)
- [Operational implementation](#operational-implementation)
- [Sources and evidence provenance](#sources-and-evidence-provenance)

## Privacy and visibility

CVs contain personal data; not every CV field is legally classified as sensitive. The actual controller/processor roles, legal basis, disclosures, retention, and international transfers must be reviewed for the selected operating arrangement. A Saudi VPC alone does not establish compliance when AI, OCR, email, analytics, or support providers process data elsewhere. Saudi-only hosting is not assumed to be an absolute legal requirement for all CV processing. [B-S13](#b-s13), [B-S14](#b-s14)

Product requirements are private-by-default CVs and uploads; clear processing notices; purposeful data collection; correction, access/export, and deletion workflows; a defined retention schedule; and controlled operator access. In the design, AI-processing notices on S04, S11, S19 and S29 say that only the text needed is sent to the processor, without contact details, and final AR/EN S35 privacy/terms/notices require company identity/controller contact and Saudi lawyer review; see [screen references](../design/figma-handoff.md#3-quick-screen-references). Consent is not the only possible legal basis, but deliberate employer submission must explain who receives which information. Never silently add candidates to a searchable pool.

Employer members see only authorized applications. Log material access and reviewer actions; revoke access when membership changes. Support access must be limited, attributable, and tied to a real case. The S36 help form warns users not to send passwords, card data or ID numbers. Deletion includes a documented approach to source files, generated artifacts, shared application copies, backups, and lawful retention exceptions. Explain those boundaries before users rely on deletion or withdrawal.

Do not advertise “never used for training,” “zero retention,” “all processing stays in Saudi” or “PDPL compliant” until actual terms, settings, data flows and organizational controls support the statement. Implementation belongs in [the security implementation](#identity-isolation-and-document-security).

### Saudi storage and AI processing are separate decisions

**OWNER DECIDED 2026-11-04 (D09/D16):** core app, database and backups stay in Saudi Arabia: OCI Riyadh/Jeddah per the infrastructure plan. Processing/access/retention evidence and A08/A11/A12 remain required.

OpenRouter AI is an overseas transfer: features are opt-in with explicit consent before first use, a processing contract with PDPL transfer safeguards, minimized CV text and contact fields never sent. ZDR does not establish residency. Show notices before collection; legal entity/controller contact and Saudi lawyer review of final AR/EN S35/privacy/terms/notices remain company inputs.

There is an additional contract issue: OpenRouter's DPA defines employment information within its own “Sensitive Data” category, and requires agreement/amendment for processing that category. Obtain written coverage for this CV workflow; that contractual category is not the same as Saudi statutory sensitive-data classification. A privacy notice alone does not settle these questions. [B-S21](#b-s21)

When all inference must remain inside Saudi, evaluate a specifically Saudi-hosted API such as OCI Riyadh Command A instead; do not silently fail over to OpenRouter. The model and Arabic quality remain unselected. If neither arrangement is approved, development uses synthetic examples and real-CV AI processing stays disabled. [B-S22](ai.md#b-s22)

## Identity, isolation and document security

Reuse the existing Better Auth integration rather than add another identity store. Extend account recovery, MFA for administrators, session controls and account deletion deliberately. Candidates own their profiles and private variants. Future organization members see only authorized organization resources and submissions. Guest applications, if approved later, need scoped upload/session tokens and a defined path to recover or claim the submission. Google sign-in was an original proposal; enabling an external identity provider requires its own data-flow review. The design keeps it on S02 but marks it gated pending that review. Session expiry (`S14 · Sign in: session expired`) and email change (`S28 · Settings: email change pending`, where the current address stays active until the new one is confirmed) are drawn as states of existing routes; implement them with the existing session system.

Enforce ownership and membership on every API and worker operation, including downloads, exports and support tools. **F05 §4 explicitly asks for database row-level security (RLS); this remains a release requirement unless the owner explicitly changes it.** Existing owner-filtered queries alone are not proof this requirement is met. Use PostgreSQL policies and an appropriate non-bypass runtime role/context; keep migrations/administration separately privileged. Verify pooled-connection identity handling and worker access so one request cannot inherit another user's scope. RLS complements, not replaces, service authorization. [T-S25](#t-s25), [T-S64](#t-s64)

Use short-lived signed object URLs only after authorization. Default to private visibility. Public sharing requires an explicit action, an unguessable revocable identifier and a clearly defined exposed representation. A complete profile backup is unsuitable as a public or recruiter export.

Treat CVs and job descriptions as untrusted data. Their text must not change system instructions, request secrets or authorize tools. The analysis model does not need shell access, arbitrary network access or application database credentials. User-supplied URLs are text in the initial workflow, not automatic server-side fetch targets.

Limit parser resources, document decompression and page counts; reject active content and suspicious file mismatches. Isolate conversion processes with minimal permissions and constrained network access. Escape rendered text and sanitize allowed rich-text markup.

Keep secrets server-side. Use TLS in transit and encrypted database/object storage with restricted key access and protected backups. The database stores structured profile data and metadata; private objects store original and exported files. AI requests contain only the information required by the operation; contact fields must never be sent, and the original attachment is not sent to the model.

Default logs should contain identifiers, statuses, timing and redacted error codes, not CV text, prompts, access tokens or signed download URLs. Controlled diagnostic sampling requires an explicit purpose, access scope and retention policy. Support staff actions on private records must be authorized and auditable.

### Mobile authentication: proposed, disabled until A14-A16

**Later T014 increment:** the following mobile Phase 1/Phase 2 contracts do not gate launch. Launch in both languages uses email/password signup, email verification and email password recovery with enrolled MFA. Mobile signup, SMS verification/reset, recovery codes and S37-S39 stay off until company registration, sender approval and A14-A16.

**OWNER DECIDED 2026-11-04:** Phase 1 includes mobile/password signup, optional email, signup/settings SMS verification, mobile/email + password login, verified-mobile SMS reset and recovery codes. SMS reset risk acceptance is limited to that purpose; enrolled MFA remains required at next sign-in. SMS is not identity proof or MFA. SMS-code-only sign-in stays Phase 2 off; no provider failure authorizes an unreviewed route.

The [owner scope decision](../design/specs/otp-spec.md) governs Phase 1 reset and recovery. OTP-01..OTP-12 below are the single operating-control definitions; numeric values remain proposed pending security/load/shared-NAT acceptance, not implementation or gate approval.


| Control | Build contract |
| --- | --- |
| OTP-01 | Server flags default off and govern every route/UI, signup restrictions and purpose. Phase 1 includes verified-mobile reset; SMS-only sign-in remains Phase 2 off. Keep non-SMS login available. |
| OTP-02 | Cryptographically random 6-digit code; maximum 300 seconds from issue, single-use, expiry never extended by resend. Opaque challenge binds secure HttpOnly/SameSite cookie/session, canonical number, user/context, purpose, fixed expiry and provider request ID. No code/number/proof in URL/localStorage. |
| OTP-03 | Maximum 3 wrong submissions per challenge; consume on third. Independent 5 failures/15 minutes per number across challenges/resends, then 15-minute SMS cooldown. Shared atomic number/IP/browser controls; replacements never reset budgets. |
| OTP-04 | At least 60 seconds between sends per number. Send ceilings: number 3/15 minutes and 10/24 hours; trusted IP 10/15 minutes and 50/24 hours; browser 5/15 minutes. Verify ceilings: IP 30/5 minutes, browser 10/5 minutes. Apply all limits before provider calls; test shared NAT. |
| OTP-05 | Saudi destinations only, bounded payloads/timeouts, provider/global spend caps, alerts and kill switch from approved quotes. Fail closed for sends if shared controls fail; no unqualified failover. D21 fallback must pass A15 and share quotas/challenge authority. |
| OTP-06 | Only active bound challenge succeeds; invalidate on number/purpose change, cancellation, logout, expiry or success. Resend preserves expiry or explicitly replaces without resetting budgets. Concurrent redemption produces at most one accepted operation; do not promise new codes if supplier reuses them. |
| OTP-07 | Identical accepted-response shape/status/timing policy for syntactically valid known/unknown/conflicting numbers. No account preflight. Quota suppression never reveals existence; outages apply uniformly. Wrong/expired/limited errors are challenge-scoped. Reset and invalid/used recovery-code responses are enumeration-safe. |
| OTP-08 | Unique canonical verified auth number, transactional linking. Existing users prove existing account access before adding; never merge from CV contacts/name/email/SMS alone. Creation needs password, create intent and terms. Unknown sign-in numbers never create accounts. |
| OTP-09 | Preserve enrolled MFA. Signup verification/reset alone never issues a usable session; reset requires MFA at next sign-in. Client flags/direct plugin or password-reset routes cannot bypass purpose/session controls. |
| OTP-10 | Fresh independent existing-account proof plus new-number verification for changes; deletion/data export uses one-use purpose-bound proof, at most 5 minutes. D20 reset: 8 hashed single-use codes shown once, atomic redemption/regeneration invalidation; no number/codes/email means no self-service or claims-only support bypass. |
| OTP-11 | No OTP/recovery codes, full numbers, credentials or SMS bodies in logs/analytics/traces/support; no CV text in SMS. One code authority; provider-managed codes stay there, app-managed OTPs need approved keyed storage/atomic redemption. TLS, encryption, least privilege and controlled retention apply. |
| OTP-12 | Retain old number until authorized replacement commits; cancellation preserves it. Notify verified channels, revoke affected proofs/sessions and audit minimal metadata. Protect sole identifier/recovery path. Changed/removed numbers cannot reset; verification older than 12 months (proposed) needs re-verification with independent account proof. After reset notify all verified contacts, revoke all other sessions and preserve next-sign-in MFA. |

Bind challenge IDs to a secure browser cookie/current session, canonical number, operation intent, user where authenticated, provider request ID and fixed expiry. Apply shared atomic quotas before send/check, prevent replay and cumulative-attempt resets, and explicitly test simultaneous redemption/resend. Use one code authority. With managed Verify, do not deliver or accept Better Auth's unused generated placeholder; custom verification must enforce local expiry/limits/context because it overrides the plugin verifier.

Enforce phase policy on every exposed plugin endpoint: Phase 1 permits password login, password-bearing signup/settings verification and purpose-bound verified-mobile password reset. Verification/reset alone must never grant an SMS-only session. Server-deny SMS-only sign-in while Phase 2 is off. Binding changes need independent existing-account proof; deletion/full export require single-use purpose-bound proof expiring within five minutes. Validate pinned hooks and MFA continuation, not client flags alone.

Never derive bindings from CV fields or merge claimed details. Use uniqueness/transactions; preserve old number until replacement commits, notify verified channels and invalidate stale proofs. Reset uses enumeration-safe responses, sends security notices to all verified contacts and revokes all other sessions. A number unverified for 12 months (proposed) needs re-verification with independent account proof; changed/removed numbers cannot reset. Phone-only creation issues 8 hashed single-use codes shown once; atomic S15 redemption and fresh-proof Account recovery regeneration invalidate used/old codes. S28 persistently prompts add-email. No number/codes/email means no self-service; support never resets on claims alone. These reset codes do not replace enrolled MFA or its separate backup codes.

Normalize valid Saudi formats and Arabic digit input on the server; expose enumeration-safe pre-verification responses and challenge-scoped errors. Reuse Hono's trusted-IP derivation. Do not accept user-supplied X-Forwarded-For as identity. SMS sending fails closed when its shared abuse/spend controls are unavailable, rather than inheriting per-instance fallback as a complete spend control.

### ATS readiness processing (planned)

**D22 / OWNER DECIDED D23:** inspect actual exported PDF locally; server `POST /pdf-checks` is authenticated and owner-scoped only at launch. No public endpoint. Optional analysis retains bounded resources and A08/A11/A12/A13 controls; statelessness does not authorize anonymous processing.

Implement authentication and owner checks on `POST /pdf-checks`, including response/report/text access, resource caps, notices and retention. A shared artifact hash grants no access to private jobs/reports/previews/downloads/caches. A later browser-only free checker needs a separate decision. This documentation does not certify the inherited route as secured.

Do not put CV/job text, extracted text, contacts, prompts, model output or evidence snippets in application/access/error logs, traces or analytics. Retain minimal identifiers, rule/version, redacted status/error and timings. Redact parser exceptions and request/response capture as well as normal logs. Any exceptional diagnostic collection needs separate purpose/access/retention approval before collection and is outside this feature.

Extracted text/locations remain personal data. Dispose bounded temporary text on success/failure/cancellation; persisted text/reports/evidence need approved finite retention, private access and expiry/deletion jobs before real-CV use. Apply source/account deletion and backup policy; expired evidence reads unavailable. Caches must not become a second permanent CV store. See the lifecycle row below and [cache identity](architecture.md#ats-readiness-pipeline-planned).

Minimize the current contact-bearing writing-review payload before any approved real-CV route. Optional semantics retain A02/A03/A11/A13, exact approved routing and acceptance of each change. A single commercial Arabic parser is an optional benchmark only, separately approved for processing/procurement/data/retention; synthetic fixtures first. OCR, production commercial parsing and employer matching stay deferred.

## Privacy and data lifecycle

**Yes, persist the career data:** saving, future edits and version restoration require it. Do not make a model conversation the database. Use the following proposed storage policy, with concrete retention periods approved before real users:

| Data                                              | Store                                                        | Proposed lifecycle                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Confirmed career facts, CV variants, job analyses | Private PostgreSQL records, owned by the candidate           | Retain for the defined account/product purpose; support correction, export and deletion       |
| Uploaded PDF/DOCX                                 | Private object storage                                       | Retain for import, review and a bounded recovery window; avoid indefinite storage by default  |
| Generated PDF/DOCX                                | Private object storage or regenerate from the saved revision | Use a limited cache; expire old files under the policy while preserving the chosen CV content |
| ATS extracted text, geometry, spans and comparison evidence | Private bounded browser/worker memory by default; any persisted evidence/cache is owner-scoped | Clean temporary text on completion/failure/cancellation. Approve finite expiry/recovery periods before real-CV use; expire derived caches and apply source/account deletion, backup policy and unavailable-source handling. No indefinite extracted-text retention. |
| Conversion/OCR temporary files                    | Isolated processing storage                                  | Clean up after completion/failure under a short, bounded policy                               |
| Operational and access records                    | Restricted metadata stores                                   | Keep minimal identifiers/events, with a separate justified retention policy                   |
| Model input/output in transit                     | Selected external processor                                  | Send only the needed information; assess that provider's retention separately                 |
| Verified login number and verification timestamp | Private auth user record in PostgreSQL; canonical E.164, unique optional binding; protected storage/access | Retain only while a login purpose exists; correction/change/export/deletion supported. Do not copy into CV contact details automatically. Remove binding when authorized and another usable method remains. |
| Pending phone challenge | Restricted short-lived challenge store: cookie-token hash, number or protected number reference, purpose/intent, user if authenticated, provider request ID, expiry and counters | Authentication validity at most 300s. On expiry/consumption/cancel, invalidate immediately and purge live challenge material within a proposed 15-minute cleanup window; approval required. Never include actual codes in logs. |
| SMS anti-abuse identifiers/counters | HMAC-derived number key, trusted-IP/browser keys and bounded counters in shared protected storage | Proposed retention no longer than the active budget: up to 24h for daily counters, with cleanup within 1h thereafter. These remain personal/pseudonymous data. Approval required; no permanent number blacklist by default. |
| SMS audit/delivery metadata | Restricted event ID, user reference where applicable, provider message/request ID, coarse result, timing and minimum billing facts | Proposed 30-day support/security window, then delete or irreversibly aggregate; owner/legal approval required. Separate any legally required supplier/accounting records and approved incident hold. No code, full number or SMS body. |
| Supplier/carrier processing | Destination number, approved authentication template/code and minimal transport/status information | Supplier/carrier retention, support access, subprocessors and deletion must be recorded contractually before A15; no local table TTL purports to delete a carrier's records. |

Deleting an original file must mark its evidence links as unavailable rather than pretending the source can still be opened. Preserve only the factual record and provenance metadata justified by the approved policy.

The Saudi PDPL and transfer regulation require analysis of the actual data flows and circumstances. They do not justify a blanket statement that every record must always remain in Saudi Arabia. Cross-border processing can be subject to conditions; consent also has legally defined exceptions and requirements. Confirm lawful bases, roles, supplier agreements and transfer arrangements with qualified Saudi advice before real CV processing. This is not a legal certification. [T-S26](#t-s26), [T-S27](#t-s27), [T-S68](#t-s68)

**OWNER DECIDED 2026-11-04 (D09/D16):** core app/database/backups stay in Saudi Arabia (OCI Riyadh/Jeddah); OpenRouter AI is an overseas transfer requiring opt-in explicit consent before first use and a processing contract with PDPL transfer safeguards. Minimize CV text and never send contact fields. The direction is resolved; exact route/contract and A11 evidence still gate real-CV processing. [Provider approval](#openrouter-safeguards-and-release-blockers) owns that evidence.

Map uploads, optional OCR, inference, storage, backups, error reporting, staff mail, identity services, support access, payment processing and fallback providers. Include the existing gateway's location, remote developer/admin access, overseas SaaS dashboards, telemetry, externally loaded fonts/assets, CDNs and session-replay tools. A Saudi application server does not establish Saudi-only processing. Record the provider's processing locations and contract terms, including retention and model-training use. Removing names and emails reduces exposure but does not necessarily anonymize a distinctive career history.

Company inbox hosting and application email are different processors/functions. A notification delivered to a user's overseas mailbox leaves our infrastructure by design. Prefer minimal notices and authenticated links instead of attached CVs. No statement of “every byte always remains in Saudi” should ignore recipient delivery or remote access.

Implement purpose-specific notices and choices. Candidate improvement, employer submission, public sharing and optional product research are distinct purposes. Keep profiles private by default and do not enroll users into research or publish their information through an unrelated consent.

Define approved retention periods for originals, extracted text, profiles, variants, exports, temporary artifacts, model diagnostics, employer submissions and payment records. The schedule is unresolved; do not invent a universal duration.

Deletion must propagate to active stores, derived artifacts, queued work and approved processors as applicable. Backups need a documented expiration and restoration procedure that avoids unintentionally resurrecting deleted active records. Record minimal evidence of completion without retaining the deleted CV. The design shows the data-copy request on S29 (preparing, then a private link that requires sign-in) and deletion on S30–S31; their wording must match the approved retention schedule before release.

Correction, withdrawal and retention exceptions require explicit behavior for submitted applications. Preserve the original submission history where appropriate, annotate or propagate lawful corrections through the defined process, and explain relevant employer handling. Do not promise immediate deletion from every independent employer system. [T-S26](#t-s26)

Browser → Hono auth service → selected approved Verify/SMS endpoint → Saudi operator → user's handset. Only destination and authentication material go to that processor, not CV content, attachments, career history or payment data. Provider delivery callbacks, account dashboards, support, diagnostics, backups and remote administration are included in the processing map. The browser's IP need not be forwarded to the SMS provider unless a separately reviewed feature requires it. OTP/autofill consent and privacy/marketing consent are different controls.

Show purpose-specific notices before collecting real numbers; identify controller/contacts, recipients, locations/transfers, retention and rights. Phase 1 purposes include signup/settings verification, password reset and security notices; SMS-only sign-in stays Phase 2 off. Record applicable consent/version/time without marketing bundling. Review the SMS processing route separately from overseas AI; one route approval never approves another.

Deletion/export covers the auth number, pending proofs, identifiable audit references and supplier requests under the approved schedule. Explain supplier/carrier and backup exceptions. Expired/consumed challenges must never become usable after restore: restore with invalidated pre-auth/step-up namespaces and require new challenges. Continue enforcing daily spend/cooldown policy after recovery rather than silently treating lost counters as a fresh budget.

## Provider approval

### OpenRouter safeguards and release blockers

| Control / question      | Required behavior                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Account content sharing | Keep prompt/completion logging and optional model-training/product-improvement sharing disabled; verify actual organization settings      |
| ZDR                     | Enforce zero-retention-eligible routing at account and request level where supported; reject instead of using a noneligible endpoint      |
| Provider selection      | Allowlist reviewed endpoints, not an unrestricted “any cheapest provider” route; validate schema capability and route identity            |
| Fallbacks               | Start with cross-provider fallbacks disabled; any later fallback must independently satisfy location, contract and technical requirements |
| Data minimization | Never send contact fields; minimize CV text and omit photos/unrelated sections. Career history may still identify a person. |
| Extra processors        | No automatic remote PDF/OCR/web-search plugins or external tools without their own review                                                 |
| Our logs                | Do not store complete prompts, completions, tokens, signed URLs or original CVs in diagnostic logs by default                             |

The documented request-routing fields include `provider.zdr = true`, `provider.data_collection = "deny"`, `provider.only = [approved provider identifiers]`, `provider.allow_fallbacks = false`, and `provider.require_parameters = true` when supported. Verify them against the actual API route and write negative tests for an ineligible/unavailable provider. They express routing policy; none is a Saudi legal-approval flag. [T-S47](#t-s47), [T-S48](#t-s48)

**ZDR, no training and residency are different controls.** OpenRouter enforces routing to endpoints designated ZDR, relying on provider policies/agreements; it cannot independently guarantee the provider's internal behavior. Its documentation distinguishes content from retained operational metadata and certain transient processing/caching. Encryption in transit does not conceal the request from services that must process it. Published regional options reviewed here cover Europe/US, not a verified Saudi-only route. [T-S49](#t-s49), [T-S50](#t-s50), [T-S51](#t-s51)

**Contract gate:** OpenRouter DPA §1.15 includes employment information in its “Sensitive Data” definition; §2.6 requires agreement/amendment for that processing. Obtain written confirmation/coverage for our CV workload. That contract category differs from statutory Saudi sensitive personal data. Also settle the applicable Saudi transfer mechanism, downstream contractual chain, required assessment/notice and owner approval. A European contractual attachment or ZDR switch alone does not demonstrate Saudi compliance. [T-S50](#t-s50); [T-S26](#t-s26), [T-S27](#t-s27)


Until these gates pass, use synthetic CV fixtures with approved research credentials. Do not upload real customer examples to “test first and handle legal later.” The latest preferred route remains OpenRouter; the gate is unresolved, not a blanket assertion that overseas AI is prohibited.

### Saudi-only route

For the strict policy, select locally hosted on-demand inference in the Saudi region, restrict routing and disable overseas failover. Oracle says standard OCI Generative AI inference inputs/outputs are not retained by the service or shared with the model provider; this does not erase what our application intentionally stores or what we put in logs. Verify scope/exceptions against selected service terms and avoid externally hosted models labelled differently in the regional matrix. [T-S42](ai.md#t-s42), [T-S52](#t-s52)

### Payment-processing boundary

Moyasar is user-selected under T07; that choice does not approve every processor location or checkout integration. Under the existing data-minimization and B-C11/A09 requirements, send only order/payment information needed for the purchase. Do not put CV contents, career history, source documents or AI prompts in payment descriptions or metadata. Keep secret API keys, webhook secrets and server-side provider operations outside the React bundle; separate sandbox from live credentials. Store only the approved payment references and required accounting records, with their own retention policy. The design (S25, S27) sends users to the gateway's hosted page for payment and for updating a payment method, and states that card data is not stored. See [payment integration](architecture.md#payments).

### Approved-route register

Maintain an approved-route register containing: purpose; model/version; actual provider; location; permitted data classes; contract reference; retention/training policy; supported schema/modalities; max request/output; rate limits; cost basis; approved fallbacks; and approval date/owner. Changes to this register require review, not just changing a gateway alias.

For SMS add sender ID/registration expiry, approved message template/version and domain-bound host, API product and endpoint, operator coverage, request-ID/expiry/attempt semantics, callback validation, allowed purpose/data classes, contract and retention/support locations, cost basis/caps, approval owner/date and fail-closed behavior. Leave status OPEN until evidence is recorded; no route is approved by this proposal.

### SMS provider: independent approval gate

**Proposed bilingual template controls, not approved templates or implementation:** for every enabled email/SMS purpose, the copy inventory must identify reviewed `ar-SA` and `en-US` versions, subject/HTML/plain text or SMS body, typed interpolation and purpose/domain restrictions, with explicit identities in the existing template pipeline. Snapshot the initiating interface locale per request/challenge; resend retains that snapshot, with `ar-SA` fallback when absent. Email HTML uses matching `lang`/`dir`, plain text preserves logical order, and action links select that interface locale. SMS codes use Latin digits; validate the exact AR/EN bodies, encoding/segmentation and domain-bound autofill on provider/consented devices only after A15. Locale review is not supplier approval, delivery proof or permission for a real-number test. APIs expose stable error codes mapped to reviewed localized field/form copy; never surface raw provider/framework text or secrets. See [content contract](../design/design-system.md#transactional-copy-and-validation-proposed) and [integration paths](architecture.md#locale-and-bilingual-integration-proposed).

Before any real-number send, A15 requires supplier/DPA, locations/transfers/support/subprocessors/retention, entity eligibility, registered MasterCV sender, purpose-specific templates/domain, coverage and cost/abuse caps. D21 sets Taqnyat primary/Unifonic fallback; both routes need evidence. D20 accepts risk for Phase 1 password reset only; SMS-only sign-in remains Phase 2 off. Simulator only until A15; collect commercial registration, sender papers and written quotes from both. Google/Moyasar approval does not approve SMS.

## Operational implementation

Incident response must notify SDAIA within 72 hours of a personal-data breach; record detection, assessment, notification ownership and evidence. This is a build/runbook requirement under D09, not a compliance certification.

[Infrastructure operations](infrastructure.md#security-backup-and-deployment-operations) owns deployment, backup and restore configuration. [AI](ai.md) owns gateway topology and usage estimates. The product cannot claim a provider or jurisdiction is approved until the corresponding decision and release evidence are recorded.

## Sources and evidence provenance

`B-Sxx` identifies a business source and `T-Sxx` a technical source. Source labels, URLs, dates and limitations are retained below. A source link does not certify current pricing, legal compliance, model availability or product quality.

<a id="b-s13"></a>

- **B-S13 Saudi PDPL:** [official government-hosted English text](https://misa.gov.sa/app/uploads/2025/08/PersonalDataProtectionLaw.pdf), especially articles 4–8, 11–13, 18, and 29.

<a id="b-s14"></a>

- **B-S14 SDAIA:** [Regulation on Personal Data Transfer Outside the Kingdom](https://dgp.sdaia.gov.sa/wps/wcm/connect/e5bbede0-1119-4f70-b4ef-f043ce58d780/Regulation%2Bon%2BPersonal%2BData%2BTransfer%2BOutside%2Bthe%2BKingdom..pdf?CACHEID=ROOTWORKSPACE-e5bbede0-1119-4f70-b4ef-f043ce58d780-p6OMj1M&CONVERT_TO=url&MOD=AJPERES), version 2.0, August 2024.

<a id="b-s21"></a>

- **B-S21 OpenRouter DPA:** [definitions and processing terms](https://openrouter.ai/data-processing-agreement), particularly §§1.15, 2.4 and 2.6; reviewed 2026-10-19. Written CV-workload coverage and Saudi transfer review are pending.

<a id="t-s25"></a>

- **T-S25 — RLS and privileged access:** [Supabase PostgreSQL row-level security guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

<a id="t-s26"></a>

- **T-S26 — Saudi privacy law:** [Personal Data Protection Law, government-hosted English copy](https://misa.gov.sa/app/uploads/2025/08/PersonalDataProtectionLaw.pdf), including correction, retention and transfer provisions. Obtain qualified review of applicability.

<a id="t-s27"></a>

- **T-S27 — Saudi transfers:** [SDAIA Regulation on Personal Data Transfer Outside the Kingdom, Version 2.0, August 2024](https://dgp.sdaia.gov.sa/wps/wcm/connect/e5bbede0-1119-4f70-b4ef-f043ce58d780/Regulation%2Bon%2BPersonal%2BData%2BTransfer%2BOutside%2Bthe%2BKingdom..pdf?CACHEID=ROOTWORKSPACE-e5bbede0-1119-4f70-b4ef-f043ce58d780-p6OMj1M&CONVERT_TO=url&MOD=AJPERES).

<a id="t-s47"></a>

- **T-S47 — OpenRouter ZDR:** [zero-retention routing](https://openrouter.ai/docs/guides/features/zdr). Review endpoint eligibility and scope for caches/plugins/metadata.

<a id="t-s48"></a>

- **T-S48 — OpenRouter provider controls:** [provider selection](https://openrouter.ai/docs/guides/routing/provider-selection). Verify parameter support and actual fallback behavior.

<a id="t-s49"></a>

- **T-S49 — OpenRouter content/metadata controls:** [data collection](https://openrouter.ai/docs/guides/privacy/data-collection).

<a id="t-s50"></a>

- **T-S50 — OpenRouter processing contract:** [DPA](https://openrouter.ai/data-processing-agreement), especially §§1.15, 2.4 and 2.6. Employment information and amendment requirements are material to CV processing; legal/contractual approval remains open.

<a id="t-s51"></a>

- **T-S51 — OpenRouter regional routes:** [sovereign/regional routing](https://openrouter.ai/docs/guides/features/sovereign-ai). No Saudi-only route was verified here.

<a id="t-s52"></a>

- **T-S52 — OCI inference data handling:** [service documentation](https://docs.oracle.com/en-us/iaas/Content/generative-ai/data-handling.htm). Distinguish inference-service handling from our saved records and logs.

<a id="t-s64"></a>

- **T-S64 — Database policies:** [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html). Bypass/owner roles and policy context require careful implementation.

<a id="t-s68"></a>

- **T-S68 — Updated Saudi transfer publication:** [SDAIA transfer regulation page](https://dgp.sdaia.gov.sa/wps/portal/pdp/knowledgecenter/details/RegulationonPersonalDataTransferOutsidetheKingdom). Use with the PDPL and qualified review of the actual arrangement, not as an automatic authorization.
