# Master CV — Infrastructure and Operations

**Version:** 0.7 · **Updated:** 2026-11-03 · **Status:** Working build reference; supplier qualification and release gates remain explicit  
**Owns:** Ownership, deployment, Saudi cloud layout, procurement, costs, backups, email and operating controls.  
**Start here:** [Documentation index](../README.md) · **Decisions:** [Status and approvals](../decisions.md)
**Owner decisions 2026-11-04:** Phase 1 includes verified-mobile SMS password reset and recovery codes; SMS reset risk is accepted for this purpose only. SMS-code-only sign-in stays Phase 2, off. Taqnyat is primary, Unifonic fallback, sender `MasterCV`; simulator only until A15. Product direction is not implementation or release approval; A01-A16 still apply.

**D09/D16 residency contract:** core app, database and backups stay in Saudi Arabia (OCI Riyadh/Jeddah). Overseas OpenRouter AI requires explicit opt-in consent before first use and PDPL transfer safeguards in its processing contract; minimize text, never send contact fields. Notices precede collection; incident runbook notifies SDAIA within 72 hours. Legal identity/controller contact and final AR/EN lawyer review remain company inputs; no deployment or processing gate is passed.

## Contents

- [Infrastructure ownership and purchase scope](#infrastructure-ownership-and-purchase-scope)
- [Existing infrastructure and discovery](#existing-infrastructure-and-discovery)
- [Deployment, infrastructure and costs](#deployment-infrastructure-and-costs)
- [Sources and evidence provenance](#sources-and-evidence-provenance)

## Infrastructure ownership and purchase scope

Keep domain, cloud tenancy, mailbox organization, billing and the code repository under the business owner's control, with named, least-privilege developer access and MFA. Owning application records does not mean we own rented cloud hardware or can ignore customers' data rights.

The working purchase plan is the `master-cv.sa` domain through T2, a modest OCI Riyadh deployment and Saudi backup storage, a verified Saudi Zoho Mail organization for staff inboxes, and OCI Email Delivery for automatic product messages. The T2 SAR 75 annual figure is the user's quote, not an independently confirmed checkout or renewal. The latest suggested capacity, cost formulas, separate monthly/annual/AI budgets and exclusions are in [the deployment and cost plan](#deployment-infrastructure-and-costs). No purchase is represented as completed.

The smaller server replaces the earlier 4-vCPU/16-GB, 100-GB disk and 200-GB file allowance. Capacity is a load-test hypothesis, not a required minimum. The owner should approve the ongoing maintenance responsibility and the single-server availability tradeoff. Backups, restore testing and deletion handling are required operations, even when their storage charge is small.

Domain/mail annual billing must not be accidentally counted twice in the monthly budget. DNS, TLS and logs do not require separate paid subscriptions for the initial design if the selected included/free options suffice. API credits are separate usage funding, not a fixed infrastructure rental. Development, legal/privacy review, maintenance labour and payment fees need separate commercial consideration.

An owner-controlled SMS/Verify account and registered `MasterCV` sender support Phase 1 signup/settings verification, verified-mobile password reset and security notices. Taqnyat is primary, Unifonic fallback behind the existing adapter; simulator only until A15. Mobile/email + password login sends no login code. SMS-only sign-in stays Phase 2 off. Company inputs: commercial registration, sender registration papers and written quotes from both providers; no purchase, funding or activation is authorized here.

## Existing infrastructure and discovery

A VPC is a network configuration, not a server, database or ownership guarantee. The reported Hostinger server and gateway do not establish Saudi processing, available resources or permission to serve paying users.

| Asset / decision          | What we know                                                                   | Required confirmation                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Hostinger server | Owner D30: temporary test and client-demo server                               | VPS/root/container access, capacity and unrelated workload; synthetic data only under D30                                                                         |
| Existing AI gateway       | User-reported access to model aliases/subscriptions                            | Actual route, credentials, upstream rights, logging, schemas, limits, region and account owner                                                                    |
| Production cloud          | REC OCI Riyadh, Saudi backups in Jeddah                                        | Business tenancy, home/allowed regions, shape capacity, USD quote, IAM and support-access terms                                                                   |
| Domain                    | User found `master-cv.sa` at T2 for SAR 75/year                                | Availability, eligibility/documents, VAT, renewal, included DNS and business ownership                                                                            |
| Staff email               | REC Saudi Zoho Mail organization                                               | Correct Saudi organization region, mailbox plan and final annual invoice                                                                                          |
| Application email         | REC OCI Email Delivery in Riyadh                                               | Approved sender/domain, SMTP or supported API credentials, region, quotas and deliverability                                                                      |
| Model supplier            | D16 opt-in overseas OpenRouter; Saudi core/database/backups are mandatory      | Exact CV-data/PDPL transfer contract, endpoint, first-use consent and A11 quality/security evidence; no alternative route without a separate decision             |
| Payments                  | USER-SELECTED: Moyasar (ميسر), 2026-10-20; not activated by this documentation | Merchant eligibility, written fees/settlement, enabled recurring methods and sandbox/webhook verification; see [T07](../decisions.md#technical-decision-register) |

No service has been bought or configured by this documentation work. [Infrastructure](./infrastructure.md) is the purchase/run plan; [provider approval](security.md#openrouter-safeguards-and-release-blockers) is the model access gate. Retain existing subscriptions only where their actual terms authorize the product's use. A working login or free endpoint is not sufficient proof.

Choose development, staging and production environments deliberately. A separate always-on staging server is not included in the starter budget. CI builds should use synthetic fixtures and no production CVs. Review any overseas developer/support access as part of the processing map; a Saudi VM alone does not resolve it.

## Deployment, infrastructure and costs

### Working infrastructure plan

**REC:** use Oracle Cloud Infrastructure (**OCI**) for the core platform. OCI is Oracle's cloud service, not a requirement to use Oracle Database. We retain PostgreSQL. Do not split the MVP between AWS and OCI without an actual need. This recommendation uses operating Saudi regions rather than depending on another provider's future regional launch. [T-S53](#t-s53)

| Component                        | Proposed placement                                                                                          | Responsibility                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| React assets + Hono app + worker | Paid Linux VM in Riyadh, `me-riyadh-1`                                                                      | Serve the application, enforce permissions, run jobs                       |
| PostgreSQL                       | Same initial Riyadh VM; private container/internal connection                                               | Accounts, career data, variants, jobs, entitlements and audit metadata     |
| Boot/server disk                 | Attached OCI boot/block volume in Riyadh                                                                    | OS, deployed code, database and bounded local logs/temp files              |
| Private CV objects               | OCI Standard Object Storage in Riyadh                                                                       | Original uploads and any retained generated artifacts; private bucket      |
| Backup copies                    | Separate restricted storage in Jeddah, `me-jeddah-1`                                                        | Encrypted application-consistent database backups and required file copies |
| Logs, credentials and monitoring | Approved regional services/local configuration in Saudi                                                     | Minimal diagnostics and secrets; no CV prompt logging                      |
| Product email                    | OCI Email Delivery configured in Riyadh                                                                     | Verification, reset links and service notifications                        |
| Staff inboxes                    | Verified Saudi Zoho Mail organization                                                                       | Human correspondence on the company domain                                 |
| Domain/DNS                       | `master-cv.sa` registered with T2; use included DNS if confirmed                                            | Domain ownership and records; registration does not host CV files          |
| AI                               | The approved route from [gateway routing](ai.md#gateway-routing), not implicitly every OCI/OpenRouter model | Model processing location and contracts must match owner policy            |

**Server vs disk vs object storage:** CPU/RAM run software. The attached disk holds PostgreSQL and the OS. Object storage is a separate file service accessed over an API, not another partition on the VM. A database row records ownership and object keys; it need not contain the entire PDF. Backups are explicitly scheduled copies, not something created automatically because object storage is durable.

### Initial sizing — recommendation, not a load-tested minimum

Start by evaluating **1 E5 OCPU (2 x86 vCPU), 8 GB RAM and a 50 GB boot volume**. The operating-system image can require a larger boot volume; confirm during provisioning. Budget for actual private-object usage, initially modelled as **50 GB of primary objects**. To avoid hiding backup cost, the v0.2 baseline separately models **50 GB of stored backups**; both are usage assumptions, not reserved minimum purchases. [T-S54](#t-s54), [T-S55](#t-s55)

The earlier 4-vCPU/16-GB, 100-GB boot, 200-GB object proposal was conservative capacity headroom and is superseded as the starter recommendation. Models run at the external API, not in this VM. Current upstream PDF rendering is Forme/WASM rather than a required browser farm. Neither statement proves the smaller server's throughput: test the selected deployment and cap heavy job concurrency.

Monitor memory pressure, CPU saturation, disk free space, PostgreSQL growth, queue age and export/API latency. Scale from measurements; reassess file retention before capacity expansion. One VM is a **single point of failure**, not a high-availability deployment. More RAM does not remove that. Resizing/replacement can involve downtime and capacity limits; plan maintenance windows and recovery.

### Monthly resource estimates — USD, before tax

**Price basis:** Oracle's Global PaaS/IaaS USD price list, observed 2026-10-19, explicitly labels the relevant page “Prices in US Dollar.” E5 CPU SKU **B97384** is **$0.0300/OCPU-hour** and E5 memory SKU **B97385** is **$0.0020/GB-hour**. Using 730 hours: `(1 × 0.0300 + 8 × 0.0020) × 730 = $33.58/month`. [T-S45](#t-s45)

**Correction of earlier chat estimates:** the later $44.01 compute / $47.42 three-resource calculation used higher rates shown on another Oracle highlights page. It is not the USD baseline adopted here. That page/source discrepancy was not fully resolved; use this explicitly USD list as a planning basis and obtain a Riyadh account/checkout quote before procurement. The original $67.16 figure corresponds to twice the CPU and memory at the USD rates, not the downsized configuration. [T-S45](#t-s45), [T-S56](#t-s56)

| Monthly consumption item              | Assumption / calculation                               |         Estimate |
| ------------------------------------- | ------------------------------------------------------ | ---------------: |
| Compute                               | 1 OCPU + 8 GB RAM, 730 hours                           |       **$33.58** |
| Boot disk, Balanced                   | 50 GB × $0.0425/GB-month                               |  **about $2.13** |
| Primary private objects, Standard     | 50 GB × $0.0255/GB-month                               |  **about $1.28** |
| **Three-resource subtotal**           | Calculated from unrounded rates                        |       **$36.98** |
| Separate backup storage assumption    | 50 GB × $0.0255/GB-month                               |  **about $1.28** |
| Transactional email                   | 10,000 small single-recipient units × $0.085/1,000     |        **$0.85** |
| **Illustrative cloud/email subtotal** | Before extra requests, traffic, logs or other services | **about $39.11** |

Balanced volume pricing includes capacity and performance; object storage is usage-based. The table does not subtract any potentially available free allowances, so do not charge them twice or assume they are necessarily available to this tenancy. Backup volume formats, snapshot options, request operations, replication traffic and retention can change actual costs. [T-S57](#t-s57), [T-S58](#t-s58), [T-S59](#t-s59)

### Annually billed items — do not count them twice

| Annual item                       |                                                                                    Planning amount | Verification status                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------- |
| `master-cv.sa` through T2         | **SAR 75/year quoted by user**, approximately **$20/year** at the planning conversion 3.75 SAR/USD | Availability, normal renewal, eligibility and VAT not independently confirmed; T2 is on SaudiNIC's registrar list |
| Two Zoho Mail Lite staff accounts |                                Earlier global reference **$24/year total**, equivalent to $2/month | Provisional reference, **not a verified Saudi checkout quote**; confirm plan, Saudi region and annual invoice     |

Use the owner/business as registrant and service-account owner where applicable. Two independent staff inboxes need two accounts; extra addresses that deliver to the same person may be aliases rather than additional paid users. The reference above must be replaced by the actual Saudi offer before a binding proposal. [T-S60](#t-s60), [T-S61](#t-s61), [T-S62](#t-s62)

Zoho documents Saudi primary/secondary data centres in Riyadh/Jeddah, but the organization must actually be created in that region; Sayed's own Egyptian location does not determine the client's desired organization. Verify the organization and relevant service terms, not merely a local domain. Ordinary Zoho mailbox use is not our transactional-message delivery path. [T-S61](#t-s61), [T-S63](#t-s63)

### Budget to communicate, with AI separate

**REC planning envelope:** **$60–$75/month before tax** for core infrastructure, backups, staff email's monthly equivalent, product email and operational headroom. This remains a conservative operating allowance above the roughly $41/month illustrative resource/mail total, not an exact recurring vendor subscription. **The domain is additional annually. AI is additional and separate.**

AI scenarios and combined budget examples are maintained in [AI economics](ai.md#combined-infrastructure-and-ai-planning-examples). Do not add both inference alternatives to the purchase list. Staff-mail annual cash billing and monthly allocation must not be counted twice.

Tax is excluded throughout. Where a 15% VAT planning allowance is applicable, multiply relevant taxable lines by 1.15 and confirm the actual invoice treatment with the business's accountant. Exchange/card conversion charges can differ from the simple domain comparison. Do not represent the allowance as a determination of the client's tax obligations. [T-S65](#t-s65)

### DNS, logs and other charges

DNS connects the domain to the server and mail services; logs describe technical events. Neither requires a separate paid product just because it appears in the architecture.

| Item                 | Initial approach                                                                                | Budget implication                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| DNS                  | T2's included DNS **if confirmed**, otherwise choose a priced alternative                       | $0 assumed, not guaranteed by a domain registration alone                            |
| HTTPS certificates   | Automated free certificate option such as Let's Encrypt                                         | No paid certificate subscription proposed; renew and monitor correctly               |
| Logs/metrics         | Minimal local structured logs with rotation plus included OCI monitoring/logging where eligible | No separate logging subscription proposed; keep ingestion/retention within allowance |
| Requests / network   | Monitor storage requests, replication, outbound traffic and optional services                   | Variable usage can exceed included allowances; part of budget headroom               |
| Backups              | Scheduled, verified jobs and separately accounted storage                                       | Required operational work, not just a storage line                                   |
| Payment transactions | Separate merchant/provider pricing and reconciliation                                           | Not included in infrastructure or AI figures                                         |

Oracle's public list includes free logging/monitoring quantities; verify the actual service tier and tenancy before depending on them. The earlier $5.50 “logs/DNS/incidental” row was a **discretionary buffer**, not a mandatory package to purchase. A public-IP, NAT/load-balancer, managed service or extra disk should be priced if introduced; none is silently assumed free. [T-S66](#t-s66)

Not included: development/maintenance labour; Saudi legal/privacy review; formal security assessments; paid support; SMS/WhatsApp; optional OCR/vision/search tools; separate always-on staging; redundant application/database nodes; domain alternatives; payment/invoicing fees; or paid premium gateway tiers. Flag these when scope or risk requires them rather than hiding them under a small buffer.

### Security, backup and deployment operations

Use reproducible container builds and separate secrets per environment. Keep PostgreSQL off the public network, restrict administrative ingress, use TLS, private object buckets and short-lived authorized downloads. Pin images, migrate deliberately, patch security issues and retain license notices. Reuse the upstream production shape without adding a browser service, Kubernetes or managed database merely by habit.

Run encrypted PostgreSQL backups with a consistent snapshot/log strategy, plus required object copies, to restricted Saudi backup storage. Set and approve retention, recovery point (acceptable data loss) and recovery time targets. A second-region bucket alone is not a restore plan. Test restoration into an isolated environment and include keys/configuration needed for recovery. Backups must outlive an accidentally destroyed VM and have credentials that an ordinary application user cannot delete through the app.

Deletion rules cover originals, exports, active data, pending jobs and expiry of backups; after restoration, reapply deletion records before serving recovered data. Consider the tradeoff between tamper-resistant backup retention and deletion obligations with the approved policy. Do not promise immediate erasure from all backups without implementing it.

Configure application health, database capacity, queue-age, failure and spending alerts. **OCI budgets are soft alerting thresholds, not hard spending caps.** Enforce application/provider quotas and concurrency limits separately; payment/AI retry budgets also need bounds. [T-S67](#t-s67)

For email, set approved senders and SPF/DKIM/DMARC, verify domain alignment, handle bounces/complaints and avoid exposing CVs as attachments. The design's product emails (S03 verification, S15 reset link, S28 new-address confirmation, S29 data-copy ready) carry links, not files; the S29 link requires sign-in. Staff inboxes are for people; transactional delivery is for the product. Minimal notifications can still reach foreign recipient providers, so disclosures must match that reality. [T-S59](#t-s59), [T-S63](#t-s63)

**Planned mobile configuration, not deployed:** Phase 1 includes verification, mobile + password access, verified-mobile SMS reset/recovery codes and security notices. Phase 2 SMS-only sign-in stays off; both flags default false until their gates pass.

| Proposed variable / setting                                  | Secret?                                       | Purpose and rule                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FLAG_ENABLE_MOBILE_OTP` / `FLAG_ENABLE_MOBILE_AUTH_PHASE_2` | No, server-enforced config                    | Both default false. First gates Phase 1 password-bearing mobile access, signup/settings verification and verified-mobile password reset/recovery. Second gates SMS-code-only sign-in only and needs a separate owner risk decision plus A14-A16 evidence. A client flag cannot authorize routes. |
| `SMS_PROVIDER`                                               | No                                            | Existing adapter: Taqnyat primary, Unifonic fallback under D21. Failover only between separately A15-qualified routes with shared quotas, fixed challenge authority and duplicate-send prevention. Simulator only until A15.                                                                     |
| `SMS_API_BASE_URL`                                           | No, controlled config                         | Allowlisted HTTPS endpoint/product/region from the approved route, not a browser/user-supplied URL.                                                                                                                                                                                              |
| `SMS_API_TOKEN`                                              | **Yes**                                       | Provider-specific server credential, separate per environment, least privilege and rotation procedure.                                                                                                                                                                                           |
| `SMS_APP_ID` / `SMS_VERIFY_SERVICE_ID`                       | Provider-dependent; treat as protected config | Only identifiers required by the chosen provider; do not require unused provider variables.                                                                                                                                                                                                      |
| `SMS_SENDER_ID` and `SMS_TEMPLATE_ID` / versions             | No, controlled config                         | Approved transactional sender/template only; registration expiry monitored.                                                                                                                                                                                                                      |
| `SMS_OTP_DOMAIN`                                             | No, controlled config                         | Actual approved web hostname for final SMS line; do not assume `master-cv.sa` is owned/provisioned. Validate against deployed public origin.                                                                                                                                                     |
| `SMS_WEBHOOK_SECRET` / provider signing config               | **Yes where supported**                       | Authenticate delivery callbacks according to provider capabilities. If no shared secret product exists, document its supported authentication; do not invent one.                                                                                                                                |
| `SMS_NUMBER_KEY_SECRET`                                      | **Yes**                                       | Separate key for pseudonymous number-rate-limit keys; defined rotation/overlap so rotation does not reset budgets.                                                                                                                                                                               |
| OTP policy and `SMS_DAILY_SPEND_LIMIT`                       | No, controlled server config                  | Versioned, approved limits; no client overrides. No live activation until owner approves a concrete monetary cap.                                                                                                                                                                                |

Add only required provider variables through existing server schemas/secrets; no VITE_ secrets or real committed values. Separate synthetic/test/live credentials and audit owner access. A15 gates both primary and fallback. Phase 1 leaves SMS-only sign-in server-disabled. SMS outages/kill switches must not unnecessarily block password login; failover cannot reset quotas or challenge authority.

Reuse existing Redis/coordination where suitable; enforce shared atomic SMS counters and circuit breaker instead of adding a new infrastructure product by habit. If shared SMS safeguards are unavailable, stop billable sends. Restore must invalidate pre-auth and step-up proofs; purge old challenge data before accepting traffic and preserve/reconcile abuse/spend ceilings. Alert on low balance, sender expiry, error/delivery spikes, verification failure, budget threshold and circuit-breaker activation; define the operator and response runbook.

### Before-purchase and first-data checklist

1. Confirm business ownership/recovery/MFA for T2, OCI, Zoho, repository and billing, including the selected Moyasar merchant account; grant named developer permissions rather than sharing root credentials.
2. Confirm the domain's renewal/VAT/eligibility/DNS and Saudi Zoho organization's invoice/region.
3. Obtain a USD Riyadh quote for the exact shape, image/boot size and storage performance; check limits, support plan and the Jeddah backup route.
4. Approve the provider/data-flow arrangement, remote access, privacy notices and retention. Resolve the OpenRouter CV-contract/transfer gate or select a tested Saudi-only route.
5. Configure private access, secrets, TLS, email, backups, monitoring and spend controls; run restore and isolation tests before real customer CVs.
6. Validate Arabic/export and model acceptance; approve the feature/entitlement list before marketing it or activating paid plans.

Purchasing every possible service on day one is not required to own/control the product. Establish owner-controlled accounts and the needed paid resources; leave expensive optional infrastructure disabled until justified. This review establishes no completed purchase, account provisioning or live activation. Moyasar selection is settled; its merchant terms and the other procurement checks remain open.

Before Phase 1 real SMS, complete A15 evidence for Taqnyat/Unifonic, registered MasterCV sender, processing/DPA/locations/transfers/subprocessors, purpose-specific verification/reset/security-notice templates/domain and written quotes/caps. D20 reset direction/risk is decided; validate A14/A16 recovery/MFA controls and obtain bounded pilot authorization under A15. No public test-send endpoint. SMS-only sign-in stays Phase 2 off.

### SMS authentication: conditional variable cost

**OWNER DECIDED 2026-11-04:** Taqnyat first, Unifonic fallback behind the existing adapter, sender `MasterCV`. Simulator only until A15; commercial registration, sender papers and written quotes remain company inputs.

Budget SMS separately: sender registration/renewal, platform/minimum commitments, billed Unicode segments, carrier/Verify fees and quoted taxes. Phase 1 includes signup/settings verification, reset, resend and all-contact security notices. Password login sends no SMS; Phase 2 SMS-only sign-in volume remains excluded. Use written Taqnyat/Unifonic quotes and spend/abuse caps; no firm total is approved.

Research-date signals only: Unifonic publishes SAR 299/year including tax for sender registration; Msegat publishes SAR 230/year and point-based SMS; Taqnyat needs a current written unit quote; Twilio Verify's USD 0.05 success fee excludes destination delivery and is not proof of domestic KSA eligibility. Store the final dated quote and renewal terms here after selection rather than copying this research as a purchase approval.

## Sources and evidence provenance

`B-Sxx` identifies a business source and `T-Sxx` a technical source. Source labels, URLs, dates and limitations are retained below. A source link does not certify current pricing, legal compliance, model availability or product quality.

<a id="t-s45"></a>

- **T-S45 — Oracle explicitly USD price basis:** [Global PaaS/IaaS Price List](https://www.oracle.com/sa/a/ocom/docs/corporate/pricing/oracle-paas-and-iaas-global-price-list.pdf), observed 2026-10-19. Visually checked the AMD Compute page showing E5 SKUs B97384/B97385 and the Cohere page showing B108077. The rendered download and indexed text had differing page counts; identify rows by SKU/section rather than relying on a permanent page number.

<a id="t-s53"></a>

- **T-S53 — Saudi OCI regions:** [regions and availability domains](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm).

<a id="t-s54"></a>

- **T-S54 — Compute units and shapes:** [OCI compute shapes](https://docs.oracle.com/en-us/iaas/Content/Compute/References/computeshapes.htm). E5 x86 OCPU/vCPU mapping and actual capacity/shape support matter.

<a id="t-s55"></a>

- **T-S55 — Boot volume:** [boot-volume concepts](https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/bootvolumes.htm), [free-tier resource documentation containing boot-size guidance](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). Confirm selected image; do not assume this paid plan inherits free-tier benefits.

<a id="t-s56"></a>

- **T-S56 — Conflicting earlier pricing surface:** [Oracle IaaS/PaaS highlights](https://www.oracle.com/cloud/iaas-paas/). Higher E5 values were displayed in the v0.2 research; not the explicitly USD calculation adopted in [the infrastructure estimate](#monthly-resource-estimates--usd-before-tax). Obtain an account quote rather than infer the cause of the difference.

<a id="t-s57"></a>

- **T-S57 — Balanced storage pricing components:** [Oracle block-volume performance explanation](https://blogs.oracle.com/cloud-infrastructure/elastic-performance-with-the-next-generation-block-storage-on-oracle-cloud), [current cloud price list](https://www.oracle.com/cloud/price-list/). Capacity/performance settings determine the charge.

<a id="t-s58"></a>

- **T-S58 — Object storage unit-price reference:** [Oracle storage FAQ](https://www.oracle.com/cloud/storage/archive-storage/faq/). Standard storage, requests and transfer are separate dimensions.

<a id="t-s59"></a>

- **T-S59 — Product email:** [OCI Email Delivery FAQ](https://www.oracle.com/application-development/email-delivery/faq/). Unit size/recipients and approved sender/service limits matter.

<a id="t-s60"></a>

- **T-S60 — Registrar status:** [SaudiNIC licensed registrars](https://www.nic.sa/en/registrars). This does not independently verify the user's domain availability or SAR 75 price.

<a id="t-s61"></a>

- **T-S61 — Zoho region:** [know your data centre](https://www.zoho.com/know-your-datacenter.html). Confirm the actual Saudi organization and service terms.

<a id="t-s62"></a>

- **T-S62 — Staff mailbox plans:** [Zoho Mail pricing](https://www.zoho.com/mail/zohomail-pricing.html). The earlier $1/user/month annual-billing reference is provisional; localized pricing did not establish a verified Saudi quote in the v0.2 reconciliation.

<a id="t-s63"></a>

- **T-S63 — Mailbox use restrictions:** [Zoho Mail usage policy](https://www.zoho.com/mail/help/usage-policy.html). Ordinary staff mail is not the application's transactional bulk-sending service.

<a id="t-s65"></a>

- **T-S65 — Saudi tax reference:** [ZATCA VAT FAQs](https://zatca.gov.sa/en/HelpCenter/FAQs/Pages/FAQArchiveEservices.aspx?page=Tax-FAQs-9). A 15% planning allowance does not determine the client's actual invoice/tax treatment.

<a id="t-s66"></a>

- **T-S66 — Included observability/public pricing:** [OCI price list](https://www.oracle.com/cloud/price-list/). Verify actual logging, metric, request and networking tiers in the tenancy; no blanket “everything is free” assumption.

<a id="t-s67"></a>

- **T-S67 — Budget alerts:** [OCI Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm). Budgets are soft limits/alerts, not enforcement of a hard spend cap.
