# Master CV — AI Workflows and Economics

**Version:** 0.7 · **Updated:** 2026-11-03 · **Status:** Working build reference; supplier qualification and release gates remain explicit  
**Owns:** Extraction, bounded AI operations, gateway structure, model evaluation candidates and AI-cost assumptions.  
**Start here:** [Documentation index](../README.md) · **Decisions:** [Status and approvals](../decisions.md)

**OWNER DECIDED 2026-11-04:** OpenRouter AI is an overseas transfer, opt-in with explicit consent before first use and a processing contract with PDPL transfer safeguards. Core app/database/backups remain in Saudi Arabia (OCI Riyadh/Jeddah). Minimize CV text and never send contact fields. Show notices before collection; final AR/EN S35/notices require Saudi lawyer review and company identity/controller contact. A11 still gates real-CV AI.

## Contents

- [Document ingestion and review](#document-ingestion-and-review)
- [Analysis and AI editing](#analysis-and-ai-editing)
- [Model choices and AI economics](#model-choices-and-ai-economics)
- [Combined infrastructure and AI planning examples](#combined-infrastructure-and-ai-planning-examples)
- [Gateway routing](#gateway-routing)
- [Evaluation and durable execution](#evaluation-and-durable-execution)
- [Sources and evidence provenance](#sources-and-evidence-provenance)

## Document ingestion and review

T004 starts with native readable-PDF extraction and manual entry, reviewing extracted facts before use. Separate contacts before optional AI and deny inherited PDF/attachment-to-model paths server-side. If native DOCX input proves costly, defer it explicitly; legacy binary `.doc` is not implied. Determine size/page limits from ingestion tests; S06 10 MB/6 pages remain fixtures.

**OCR (Optical Character Recognition) reads text from images.** A normal text PDF/DOCX generally needs extraction, not OCR. A scanned PDF, photograph or document with image-only content may need OCR or a vision-capable model. OCR was an assistant-proposed technical fallback, not an explicit separate original business requirement. Default MVP behavior can reject/explain these inputs and offer manual entry. Enable scan processing only after format scope, Arabic quality, provider location, cost and security are approved; do not silently send the file to an extra cloud plugin.

The following is the intended Master CV ingestion contract, not a claim that upstream already implements every server-side quarantine/review step. Inspect existing browser/server import routes, reuse their tested capabilities and enforce the same authorization and approved-processor boundary; do not accidentally create two conflicting import sources of truth.

The ingestion pipeline should:

1. Authenticate the candidate upload. Guest employer applications belong to a future, separately approved workflow.
2. Store the file privately in quarantine; verify actual type, size and safety constraints.
3. Extract native text and basic location information.
4. Assess whether extraction is useful: empty pages, garbled text, broken reading order or missing content.
5. If extraction is unusable, explain the limitation and offer native-text/manual recovery. Apply OCR/vision only when that optional route has been approved, and only to the affected content.
6. Normalize the result into a versioned schema.
7. Present uncertain or conflicting fields for user review.
8. Commit confirmed information to the career profile.

Keep original extracted text and locators only for their approved retention period. Confidence is a routing signal, not proof. A numeric model confidence should not substitute for validation.

The schema needs typed sections such as experience, education, certifications, skills, projects and languages. Each extracted statement should carry provenance and a confirmation state:

```json
{
  "schemaVersion": 1,
  "factId": "generated-stable-id",
  "kind": "experience",
  "value": {
    "organization": null,
    "title": null,
    "startDate": null,
    "endDate": null
  },
  "evidence": [],
  "confirmation": "needs_review"
}
```

Use null for unknown values. Preserve date precision: “2023” must not become a fabricated day and month. Retain original date text when normalization is ambiguous, including calendar ambiguity. Conflicting dates should trigger review.

Validate both shape and meaning. JSON Schema can constrain fields and types, but cannot prove that a qualification or achievement is true. Structured-output APIs also need handling for refusals, truncated responses and unsupported schemas. [T-S09](#t-s09)

## Analysis and AI editing

The AI functions are deliberately bounded and follow the [usage contract](../business/requirements.md#usage-contract): one delivered user task per operation, no cost for failed/cancelled work or extra cost for automatic retries. Show cost and check/reserve limits before execution; T005 enforces Start, T010 adds paid grants.

| Operation                     | AI contribution                                                 | Application responsibility                                         |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Import normalization          | Convert extracted text into typed career information            | File parsing, validation, evidence locations and user confirmation |
| CV review                     | Identify unclear wording, repetition and unsupported statements | Present findings without silently editing the source               |
| Job comparison                | Extract requirements and map them to supplied evidence          | Preserve the exact job text and versioned analysis                 |
| Rewrite and summary           | Propose clearer bullets and a relevant summary                  | Restrict edits to supported facts and require acceptance           |
| Missing-information questions | Ask for useful evidence or clarification                        | Store answers as user-supplied information                         |
| Arabic/English transformation | Translate or adapt approved wording                             | Protect meaning, names, dates and each variant's freshness         |

PDF generation, billing, permissions and ordinary persistence are application functions, not tasks delegated to an unconstrained model. Reuse existing cover-letter generation with the same approved facts if its retained-feature release gate passes; it is not automatically later new-build work.

Expose three distinct dimensions:

| Dimension                    | What it can assess                                                           | Boundary                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| PDF readability              | Deterministic extraction/fidelity of the actual exported PDF; no AI required | Does not certify destination parser support or every ATS  |
| Writing and content findings | Deterministic content tips; optional approved semantic review                | Must not invent accomplishments or silently apply changes |
| Evidence for a selected job  | Deterministic term coverage; optional approved requirement/evidence mapping  | Missing evidence is not proof of missing ability          |

S10 labels the file result as PDF readability. WORKING D22 plans no universal ATS score, score badge, rejection prediction or “passes ATS” claim. Defined deterministic term coverage belongs only in selected-job evidence, with matched/unmatched terms and denominator, not a hiring probability. Destination Arabic parser support is unknown unless verified.

One concrete reason to test the exported file is Greenhouse's documented parsing difficulty with image-based files, columns and some header/footer structures. Its guide also distinguishes a failed parse from loss of the attached CV. This is evidence about one ATS, not a universal rejection rule. [T-S34](#t-s34)

For job comparison, extract requirements, distinguish essential from preferred where the text supports that distinction, and map each finding to candidate evidence and a job-description passage. “No evidence of Excel in this CV” is defensible; “you do not know Excel” is not.

Generate suggestions as proposed changes to an identified base revision. An edit includes its target, previous value, proposed wording, reason and supporting fact IDs. Validate the patch, show a human-readable difference, and require acceptance before it becomes authoritative. Reject a stale patch if the underlying section changed meanwhile.

The model must not create metrics, employers, tools, degrees, certifications or language proficiency. It may ask “Did you reduce processing time, and can you quantify it?” A user answer becomes user-supplied information with its own provenance. Even polished wording must not strengthen responsibility into unsupported leadership or expertise.

Treat translation and tailoring as controlled transformations of approved facts. Maintain job-specific variants without replacing the master record. Do not enable autonomous application submission or hiring rejection through this workflow.

### Optional ATS semantic review (planned)

**WORKING D22, not implemented or processing-approved:** extend existing writing/job review, not a second ATS agent. Deterministic rules, PDF.js actual-file checks and job-term matching are the foundation. AI may explain wording, ask missing-information questions and map the selected job's passages to confirmed fact IDs as supported/partial/no evidence/unclear. It does not measure PDF fidelity or rank candidates for employers.

D09/D16 require only needed selected-variant sections, confirmed facts, findings and exact job passages. Contact fields must never be sent; exclude photos/unrelated history. The contact-field follow-up is closed as a requirement, not an implemented control: test model-bound payloads and evidence locators for leaks under A11. Minimized employment history is not necessarily anonymous.

A02/A03 govern factual fidelity, job evidence and repeated-run evaluation; A11/D16 govern exact processor/endpoint, notices and lawful processing; A13 governs retained-route availability, with A08/A12 ownership/operations as applicable. Configured providers or successful credentials do not establish approval. No approved route means semantic review is not enabled; an outage means unavailable/retry, without silent provider fallback. Deterministic results remain usable.

Findings cite CV fact IDs and job/source spans or explicitly state absent evidence. Typed patches include target, base revision, previous/proposed text and reason. Require explicit acceptance of every change, reject stale patches and support reject/undo; preserve facts and AR/EN/job isolation. Use [private versioned caching and bounded/idempotent execution](architecture.md#ats-readiness-pipeline-planned). Evaluate unsupported claims, citation accuracy and 3-5 identical-input runs under [B-C07/A04](../business/requirements.md#ats-readiness-working); no evaluation ran here.

## Model choices and AI economics

**No production model has passed Master CV Arabic/English evaluation.** D16 selects opt-in overseas OpenRouter; real-CV use still requires explicit first-use consent, processing/PDPL transfer safeguards and A11 evidence. Other routes require a separate decision. Existing model-cost figures below are evaluation assumptions, not quotes or release approval.

### OpenRouter evaluation candidates

| Candidate route      | Standard input / output per 1 million tokens | Purpose                                            | Gate                                                                                              |
| -------------------- | -------------------------------------------: | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `openai/gpt-6-luna`  |                                $0.10 / $0.50 | First low-cost extraction/review/rewrite candidate | Actual eligible ZDR endpoint, schema behavior, Arabic fidelity and CV-contract approval           |
| `qwen/qwen3.8-flash` |                                $0.15 / $0.47 | Alternative to compare on quality/cost             | Same quality, terms and endpoint gates; Chinese origin alone neither approves nor disqualifies it |

These are advertised model-page rates; a routed provider, region or caching mode may have a different price. The model page is not proof that an acceptable ZDR endpoint is available for this account. Confirm the specific route before each production configuration change. [T-S39](#t-s39), [T-S40](#t-s40)

Earlier Sol/Sonnet/Gemini/DeepSeek discussions remain candidate history, not five required integrations or approved current prices. Start with one evaluated primary and, if needed, one separately approved fallback. Do not choose a coding model merely because it performs well on software benchmarks. Neither an alias called “Sol” nor a personal subscription proves the upstream model identity or permitted SaaS use.

### Planning workloads — totals across every call in a session

A session may include import normalization, CV review, job comparison, translation and selected rewrites. Repeated context, reasoning billed as output, extra variants and successful retry/repair calls increase usage. The figures below are **assumptions for arithmetic, not observations of typical customers**.

| Example       | Input / billable output tokens | Luna cost per session | Luna cost per 1,000 sessions |
| ------------- | -----------------------------: | --------------------: | ---------------------------: |
| Light         |                 10,000 / 3,000 |              $0.00250 |                        $2.50 |
| Planning case |                 30,000 / 8,000 |              $0.00700 |                        $7.00 |
| Heavy         |               100,000 / 25,000 |              $0.02250 |                       $22.50 |

Formula: `(total_input / 1,000,000 × input_rate) + (total_billable_output / 1,000,000 × output_rate)`. The same planning case with Qwen is **$0.00826/session, or $8.26/1,000**. Caching charges depend on the selected endpoint: the Luna page also lists a $0.125/million cache-write rate. Applying that higher rate to _all_ 30,000 input tokens gives the earlier alternate-rate arithmetic of **$7.75/1,000**; this is not a verified cache-billing model, an upper cost bound, or the standard uncached-input price. **The $7.00 planning case assumes plain, uncached input.** The current Luna page describes automatic caching for qualifying OpenAI prompts and separate cache-write billing; do not assume the uncached scenario is the default invoice. Confirm the chosen endpoint's cache configuration and measure uncached, cache-write and cache-read usage separately before setting retail limits. [T-S39](#t-s39), [T-S40](#t-s40)

**REC starter allowance:** $20 of OpenRouter credits for evaluation/early usage, with a proposed monthly planning allowance of the same size for roughly the assumed 1,000-session workload. It is not an unlimited plan, a measured capacity guarantee or a purchase commitment. Heavy workloads and stronger models can exceed it.

OpenRouter Standard adds **5.5% when credits are purchased**: buying $20 of usable credits costs **$21.10 before tax**. It is a funding fee, not a per-request add-on or one-time account fee. There is no mandatory monthly renewal in this prepaid model; enable auto-refill only with explicit limits and owner approval. Unused balance remains subject to the supplier's credit terms. Business/regional offerings have different fees; do not budget Standard for a paid tier required by the selected route. [T-S41](#t-s41)

### Saudi-hosted alternative — not an additional simultaneous subscription

Oracle documents **Cohere Command A (`cohere.command-a-03-2025`) on demand in Riyadh**. Confirm current account access and actual hosting; region tables distinguish local/on-demand options from dedicated-only or externally hosted routes. This is API usage, not renting a GPU cluster. [T-S42](#t-s42), [T-S43](#t-s43)

Its price-product mapping is **Large Cohere**, billed at **$0.0156 per 10,000 combined input/output characters**. At a proposed **52,000 characters per complete session**, the calculation is `52,000 / 10,000 × $0.0156 = $0.08112`, or **$81.12 for 1,000 sessions**. A **$100 usage allowance** is a recommendation, not a compulsory monthly fee. The character workload and OpenRouter token workload are independent scenarios; they are not a measured apples-to-apples quality comparison. [T-S43](#t-s43), [T-S44](#t-s44), [T-S45](infrastructure.md#t-s45)

Command A's current on-demand response cap is 4,000 tokens per call. Break workflows into bounded steps and handle truncation rather than promise a single unrestricted full-document response. Test schema support and Arabic quality through the actual route. [T-S43](#t-s43)

**alAPI / DEEP.SA:** earlier discussion identified advertised Saudi and international model routes. Retain it as an alternative to investigate, but its current pricing/retention details were not verified in the v0.2 reconciliation. Obtain a written quote and confirm the specific local endpoint. The earlier roughly $80/1,000-session figure was an assumption and is **not an approved budget line**. [T-S46](#t-s46)

### Unit economics and limits

Record model/endpoint, input/output usage, cache category, billed cost, retries, latency and task result without logging CV content. Cost per accepted result includes all billable model activity, optional OCR/vision, gateway charges, document work and operations. Track platform spending separately from customer credits and entitlements. Release reservations for failed user operations according to the agreed product policy even when an upstream attempt cost the platform money.

No OCR, paid search/tool plugin, GPU, legal review or tax is included in these text-inference examples. Set request-size/output caps, bounded repair attempts, per-user/global quotas and account alerts; a low token price is not a reason to offer unconstrained usage. Measure real sessions before retail pricing or capacity claims.

## Combined infrastructure and AI planning examples

The base infrastructure allowance is owned by [the infrastructure budget](infrastructure.md#budget-to-communicate-with-ai-separate). The following calculations are preserved examples from v0.2, not additional vendor quotations or commitments; recalculate them when either underlying allowance changes.

| Separate AI scenario                       |                                                                                                             Planning funding |                                                     Resulting monthly envelope before tax |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------: |
| OpenRouter, only after production approval |                                                         $20 credits + 5.5% Standard purchase fee = **$21.10** when topped up | **$81.10–$96.10** with the infrastructure envelope, if this top-up is budgeted each month |
| Saudi-hosted OCI inference alternative     | **$100** usage allowance, based on the [AI scenario](#saudi-hosted-alternative--not-an-additional-simultaneous-subscription) |                                            **$160–$175** with the infrastructure envelope |

These are alternative scenarios, not two subscriptions to buy together. API expenditure follows usage; no model-quality result or legal approval is implied. Do not append the $2 monthly mail equivalent again if using the envelope, or add the annual $24 on top of 12 fully allocated monthly equivalents. Annual cash billing and monthly cost allocation are different views.

## Gateway routing

### One approved route per operation

The gateway is an access/controls layer, not an automatic privacy guarantee. It may be our backend adapter or the existing gateway after inspection. Prefer the fewest processors needed; using OpenRouter does not also require OpenCode or another proxy.

```text
Preferred candidate, only after foreign-processing approval:
Saudi Master CV worker → approved gateway/adapter → OpenRouter → allowed provider endpoint

Strict Saudi-processing alternative:
Saudi Master CV worker → Saudi gateway/adapter → OCI Riyadh local inference endpoint
```

D16 selects the overseas OpenRouter route; the Saudi-hosted calculation is not a simultaneous subscription or fallback. Preserve data and show unavailable/retry when no approved route exists; never silently switch jurisdiction. Extract supported inputs locally and send only minimized selected text, never contacts. S11 assistant-not-enabled sends nothing; assistant-unavailable covers temporary outages. S04/S11/S19/S29 notices must match actual payload construction.

The [provider safeguards and approval gates](security.md#openrouter-safeguards-and-release-blockers) must pass before real CVs use this route. They are not implied by choosing a low-price model.

### OpenCode and existing subscriptions

The user's OpenCode idea was **model access behind the gateway**, not an autonomous coding agent running on every CV. Preserve this interpretation. OpenCode/free-model and personal-subscription routes are optional alternatives, not the current default and not an additional required purchase. Hosted and self-hosted access, provider logins and free endpoints can have different commercial, retention and regional rules. [T-S22](#t-s22), [T-S33](#t-s33), [T-S35](#t-s35), [T-S36](#t-s36) — earlier discovery sources; re-check before use

A direct approved inference API is preferable to starting a coding-agent process merely to relay text. Do not give CV-triggered workflows shell, filesystem or arbitrary tool permissions. A personal subscription or successful OAuth login does not automatically authorize a multi-user paid service. Verify credential type, resale/customer-facing rights, billing owner, rate limits and upstream data practices; there is no assumed “free forever” production capacity. Earlier direct-provider subscription discussions are historical options, not authority to bypass terms. [T-S19](#t-s19), [T-S20](#t-s20), [T-S21](#t-s21)

## Evaluation and durable execution

Use the [evaluation corpus and release gates](../business/requirements.md#evaluation-and-release-gates) for Arabic/English model comparisons. [Durable jobs and credit accounting](architecture.md#durable-jobs-and-credit-accounting) owns retry, cancellation and ledger behavior. The [approved-route register](security.md#approved-route-register) records the allowed processor chain.

## Sources and evidence provenance

`B-Sxx` identifies a business source and `T-Sxx` a technical source. Source labels, URLs, dates and limitations are retained below. A source link does not certify current pricing, legal compliance, model availability or product quality.

<a id="b-s22"></a>

- **B-S22 Oracle regional inference:** [models by region](https://docs.oracle.com/en-us/iaas/Content/generative-ai/model-endpoint-regions.htm); reviewed 2026-10-19. Select the actual hosting and endpoint mode, not just a provider brand.

<a id="t-s01"></a>

- **T-S01 — Retrieval:** [OpenAI retrieval guide](https://developers.openai.com/api/docs/guides/retrieval).

<a id="t-s09"></a>

- **T-S09 — Structured output boundaries:** [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

<a id="t-s10"></a>

- **T-S10 — Sol:** [OpenAI gpt-6.1-sol model and pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

<a id="t-s11"></a>

- **T-S11 — Sonnet:** [Anthropic Claude Sonnet 5.5 overview](https://platform.claude.com/docs/en/models/sonnet-5-5/overview).

<a id="t-s12"></a>

- **T-S12 — Gemini model:** [Google Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash).

<a id="t-s13"></a>

- **T-S13 — Gemini pricing:** [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing).

<a id="t-s14"></a>

- **T-S14 — Qwen pricing and deployment scope:** [Alibaba Cloud Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing).

<a id="t-s15"></a>

- **T-S15 — Qwen schema support:** [Alibaba Cloud structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output).

<a id="t-s16"></a>

- **T-S16 — DeepSeek identities:** [DeepSeek API documentation](https://api-docs.deepseek.com/).

<a id="t-s17"></a>

- **T-S17 — DeepSeek prices:** [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/).

<a id="t-s18"></a>

- **T-S18 — DeepSeek schema support:** [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/).

<a id="t-s19"></a>

- **T-S19 — ChatGPT access arrangements:** [OpenAI token sharing with open-source applications](https://developers.openai.com/siwc/token-sharing-open-source).

<a id="t-s20"></a>

- **T-S20 — Anthropic credential boundaries:** [Claude Code legal and compliance](https://code.claude.com/docs/en/legal-and-compliance).

<a id="t-s21"></a>

- **T-S21 — Legitimate subscriber API credits:** [Anthropic API credits for subscribers](https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers).

<a id="t-s22"></a>

- **T-S22 — OpenCode catalog and model-specific privacy:** [Console models](https://opencode.ai/v2/docs/console/models/).

<a id="t-s32"></a>

- **T-S32 — Evaluation method:** [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

<a id="t-s33"></a>

- **T-S33 — OpenCode direct protocols and authentication:** [Console Inference API](https://opencode.ai/v2/docs/console/api/inference/).

<a id="t-s34"></a>

- **T-S34 — ATS parsing limitations:** [Greenhouse unsuccessful resume parsing](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse).

<a id="t-s35"></a>

- **T-S35 — OpenCode hosted-service terms:** [Terms of Service](https://opencode.ai/legal/terms-of-service), effective 2026-08-15; applicable customer-facing inference rights require clarification.

<a id="t-s36"></a>

- **T-S36 — Other OpenCode access routes:** [Go](https://opencode.ai/v2/docs/console/go/), [server](https://opencode.ai/docs/server/), [SDK](https://opencode.ai/docs/sdk/), [providers](https://opencode.ai/docs/providers/).

<a id="t-s39"></a>

- **T-S39 — OpenRouter Luna pricing:** [model page](https://openrouter.ai/openai/gpt-6-luna). Standard token and cache categories observed 2026-10-19; selected provider/region can differ.

<a id="t-s40"></a>

- **T-S40 — OpenRouter Qwen pricing:** [model page](https://openrouter.ai/qwen/qwen3.8-flash). Standard advertised token rates observed 2026-10-19, not an evaluated CV workflow.

<a id="t-s41"></a>

- **T-S41 — OpenRouter funding/tier fees:** [pricing](https://openrouter.ai/pricing). Standard 5.5% credit purchase fee; other tiers differ. Check current credit/checkout terms before funding.

<a id="t-s42"></a>

- **T-S42 — Oracle model location and access mode:** [models by region](https://docs.oracle.com/en-us/iaas/Content/generative-ai/model-endpoint-regions.htm). Distinguish locally hosted/on-demand from dedicated-only or external calls.

<a id="t-s43"></a>

- **T-S43 — Command A:** [model, pricing-product mapping and response limits](https://docs.oracle.com/en-us/iaas/Content/generative-ai/cohere-command-a-03-2025.htm).

<a id="t-s44"></a>

- **T-S44 — OCI inference billing units:** [on-demand billing](https://docs.oracle.com/en-us/iaas/Content/generative-ai/pay-on-demand.htm). Character versus token metrics depend on the model.

<a id="t-s46"></a>

- **T-S46 — Alternative local gateway inquiry:** [DEEP.SA alAPI](https://www.deep.sa/products/alapi), [pricing endpoint](https://alapi.deep.sa/pricing). Earlier advertised local/global offering retained as a lead; current pages/pricing were not reliably retrievable in the v0.2 reconciliation. Quote, local route and retention terms required.
