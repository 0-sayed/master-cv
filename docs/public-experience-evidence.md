# Public experience evidence

## Scope and source

Baseline: `1276e45bbb7da24980eb6c2ad1a79364ea3cff69`, branch `feat/t011-public-experience`. This record covers the unstaged diff from that baseline. T007 and T009 are merged. No commit, push, deployment or publication is authorized.

Owner direction: 2026-11-15. Original Arabic-first landing, complete English, one synthetic comparison, three steps, review/privacy/independent-version trust statements, free-access FAQ. The visible footer credit was removed by owner decision 2026-11-15; the MIT LICENSE file is kept in the repository. No paid offers, payment names, customer proof, analytics or new consent collection. Existing shared controls and T002 tokens own visual details.

Owns B-O06. Consumes B-C01, B-C02, B-C07, B-C08, B-C09, B-C11, B-C12 and A04, A05, A07, A08, A09, A11, A13. All other applicable gates remain in force.

## Frame and interaction inventory

Figma file: https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni

| Target       | Frames                                                                                                                                                                                                                                   | Elements and recovery                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01          | [39:3454](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=39-3454), [49:2147](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=49-2147), [63:2](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=63-2) | Public header, visible sign-in/free entry/locale, hero, synthetic comparison, three steps, trust, free FAQ, footer. No owned dialog or sheet.      |
| S35 privacy  | [82:3746](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-3746), [82:3869](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-3869)                                                                           | Draft notice, privacy tab, lifecycle sections, rights/help links, footer.                                                                          |
| S35 terms    | [82:8933](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-8933), [82:9025](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=82-9025)                                                                           | Deep-linkable terms tab, draft notice, capability limits and rights/help recovery.                                                                 |
| S02 consumed | 25:677, 41:692                                                                                                                                                                                                                           | Existing email registration, real validation and verification. Mobile-unavailable 565:34696 / 565:34821 remains gated.                             |
| S14 consumed | 22:478, 41:629, 63:234                                                                                                                                                                                                                   | Existing login. Password-changed 80:29813 / 80:30208; session-expired 89:19694 / 89:19755. Mobile-unavailable 565:34929 / 565:35046 remains gated. |
| S36 consumed | 82:3791, 82:3910, 82:8976, 82:9064                                                                                                                                                                                                       | Real support form, validation, failure with retained input/retry, saved receipt. No SMS-help activation.                                           |

Authorized live metadata confirmed all seven owned S01/S35 names on 2026-11-15. Renders were fetched for those seven frames and the email/login/help masters and adjacent desktop recovery states. Screenshots are in the owner evidence folder as `figma-<node>.png`. Render inspection does not prove persistence, legal approval or gate qualification. Remaining mobile recovery renders require inspection before any change to their UI.

All seven owned renders received visual inspection. The newer owner direction replaces prototype pricing, payment and processing promises. No upstream animation or marketing chapter was adapted. Existing license notices remain intact.

## Claim-to-gate record

| Claim                            | Evidence source                                           | Boundary                                                                                                                      |
| -------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Writing and review               | T007 implementation/evidence and explicit apply workflow  | No live AI, job-matching or hiring-score promise.                                                                             |
| PDF access                       | B-C08/B-C11, existing export entitlements and A04 records | Qualified PDF only; no universal template qualification or unlimited allowance claim.                                         |
| Separate Arabic/English versions | T007 independent variants and B-C09                       | Interface switching does not change saved document content.                                                                   |
| Email account entry              | Existing T003 registration/login/verification services    | No mobile OTP, Google, guest or anonymous processing activation.                                                              |
| Private documents and rights     | `docs/t009-data-lifecycle.md`, T009 privacy/help services | Account proof required. Support receipt means saved, not resolved. Deletion stages and backup/processor work remain distinct. |
| Word / DOCX                      | A05 and T004 gate records                                 | Word output unavailable. No DOCX intake claim.                                                                                |
| Payments and offers              | A09/T010/D05/D18                                          | No price, gateway, method, renewal or payment badges.                                                                         |
| Legal and release                | D09/D16, D11, T013                                        | Legal text stays a review draft; final controller, location, retention, brand and publication approval remain open.           |

Transactional email review uses the existing locale-preserving account/security templates. This task does not add marketing email, subscriptions or a mailing list. Metadata, JSON-LD and discovery documents must follow the same claim boundaries.

## D36 deviations

Landing redesign (owner handed over the design on 2026-11-15; four review rounds the same day):

- Keep the header and hero light in light theme and follow the theme in dark mode because the owner rejected a dark first impression.
- Narrow the header into a floating, blurred bar once the page scrolls (wide screens; height unchanged, so no layout shift) because the owner asked for a livelier header.
- Use a larger fluid `type-hero` display headline with one accent word and a drawn stroke because the 48px display role could not carry the hero; it is defined once in the shared type layer.
- Replace the hero's paper stack with one wide CV that builds itself in a short loop (PDF imported, facts fill in, a suggestion is accepted, job evidence found, PDF ready) because it shows the real flow at a glance; it rests on the finished CV under reduced motion.
- Drift synthetic CV fragments from common Saudi jobs behind the hero (transform only, static under reduced motion) to adapt upstream's fragment field.
- Draw threads only in the job section, from each supported requirement to its exact CV line, re-anchored when the job changes, because the owner found threads elsewhere overused (round 5).
- Add an ATS section and ATS mentions (hero line, steps, languages, FAQ, pricing) stating only what is checked: the exported PDF's selectable text, embedded fonts, password protection and size (ats-checker rules), D31/D33 Western digits and extractor-order dates, findings without a score or pass guarantee (round 5).
- Simplify the review mock to original, suggestion, reason and open question, with no buttons or animation, because the owner found the interactive version busy (round 5).
- Lay the job, bilingual and pricing sections out side by side and trim section padding so each fits a 1440×900 screen (round 5).
- Show date ranges in the Arabic landing mock in reading order (earlier year on the right). This is display-only on the landing; exported PDFs keep D33's unspaced start-end with the start on the left for extractor order (round 5, flagged difference).
- On phones the landing header keeps the logo and one primary action, with sections, language and sign in in a bottom menu sheet, because the crammed four-control row was too small to use (round 6).
- Use the shared segmented control, with a new shared accent selected state, for the job picker and the bilingual toggle; the bilingual example always opens on Arabic (round 6).
- Fix the mobile QA findings at their cause: one-row public headers (mark-only logo on narrow screens), job rows with the status under the requirement, hero status chips in normal flow under the card on phones, a fading snap strip for the job picker, unbroken filenames, 14px minimum hero text, phone anchors landing at the section top, and tablet mocks capped at a readable width (round 7).
- Round header controls to the bar's pill shape and make header anchors scroll smoothly below the sticky header (instant under reduced motion) (round 5).
- Use a synthetic accountant persona and non-technical sample jobs because Master CV is for everyone in Saudi Arabia, not only software engineers.
- Cut copy to one headline and one line per section at larger type roles because visitors look rather than read.
- Turn the three steps into mini product scenes with large numerals and no connector line because the owner disliked the icon line.
- Make the job mock a picker of three sample jobs with found/partial/missing evidence and Show in CV, because trying beats reading; nothing is saved or sent.
- Show one bilingual example CV with an Arabic/English toggle because flipping the same facts makes the independence obvious.
- Add a pricing section (owner decision 2026-11-15): the free plan lists only the allowances enforced in `packages/api/src/features/ai/usage.ts`; the paid plan is "Coming soon" with planned items from D05/B-C11, and no price, payment name or buy button, because D05/D18 prices are unapproved and T010 owns paid offers.
- Use warm Saudi wording only in Arabic headlines, eyebrows and calls to action; explanations, FAQ answers and privacy facts stay in standard Arabic so no capability reads ambiguously.
- Keep scroll reveal, a slow light in the closing band and subtle border/shadow hover (no lift); all motion is transform/opacity, armed only by script and fully static under reduced motion.
- Move privacy into a deep-green trust band with the bounded 3% Sadu texture because Figma places "your data is under your control" there; export and deletion points link to existing controls only.
- Present the FAQ as an accordion whose answers stay in the HTML, add the Figma guarantee and invented-facts questions, and end with a closing call-to-action band.
- Remove visible "illustrative example" notes (owner decision 2026-11-15); each mock keeps that disclosure as its accessible name and uses an obviously synthetic persona.
- Redesign the footer with brand, product/support/legal columns, a language choice and the copyright line; the visible upstream credit was removed by owner decision 2026-11-15 and the MIT LICENSE file stays in the repository.
- Extend the existing bounded 3% Sadu accent and shared 800ms logo to landing entry because the owner approved this scope on 2026-11-15.
- Keep S35 lifecycle facts visibly draft and omit unsupported storage/processor/payment policy because Figma text is not legal or operational approval.
- Use existing routes and a shared responsive shell because prototype geometry and paths do not override validated services or D35 controls.
- Narrow legal paragraphs to the shared prose measure because the live detector found desktop lines above 110 characters.

The newer root bookkeeping instruction from 2026-11-14 governs the final shipping handoff. The older T011 brief says to wait for merge. No roadmap row changes before implementation and verification.

## Functional results

Task 1 RED: public copy contract failed on the inherited hero sentence. Task 1 GREEN: delivered-copy and copy-contract suites passed, 35 tests, 0.502 seconds test wall time. Formatting and source lint passed. These are copy-contract results only.

## Visual and interaction results

The final focused layout run passed 17 cases in 8.7 seconds, with four automatic workers and zero retries. Screenshots cover home, privacy, terms and signed-out help in AR/EN at 1440×900 and 390×844. The owner evidence folder contains 16 default captures, four keyboard-focus captures, four independent English-example captures, four dark landing captures and one reduced-motion capture. All 29 captures received manual inspection. Arabic text shapes correctly, labels fit, and the public header and body share start edges. No changed authentication recovery UI required new visual captures.

Geometry JSON records loaded self-hosted Noto Sans Arabic and Noto Sans fonts, correct language/direction, zero horizontal overflow and 44px public targets. Default header top is zero. Keyboard navigation reaches the main content. Interface switching leaves the synthetic saved CV data and revision timestamp unchanged. The landing logo plays once, and reduced motion leaves the final static mark without a boot overlay.

Local Chromium measurements use viewport sizes only, without CPU or network throttling. The final 16 capture records measured LCP from 64 to 144ms and CLS of 0. Scripted click-to-frame timings range from 31.3 to 69.6ms. These are local measurements, not field INP or proof of production Core Web Vitals. Resource records contain no third-party requests, heavy hero media or remote fonts.

Impeccable refinement corrected undersized tabs through a shared touch variant. The existing mobile display token reduces excess hero wrapping. Absolute skip-link positioning removes an inherited 42px layout gap. A shared Help composition removes differences between initial HTML and client rendering. Preloads prioritize the five existing self-hosted UI fonts after a measured Arabic mobile Help layout shift. Retained ATS navigation now updates its owned metadata. Each logic correction has a failing regression followed by a passing run.

The first detector audit failed before live inspection. Source scan: exit 0, 50ms. All 16 live launches: exit 1, 111–136ms each. Chrome reported a read-only crash-report location and an excessive socket-path length. The full browser run exposed the same socket failure in its zoom tests. A runner regression measured 125 bytes against the Unix limit of 108. Short repository-owned runtime folders fixed the launch cause. No installed package, external file or sandbox permission changed.

The recovery audit then reached all 16 live URLs. Its findings identified four long-line warnings on desktop legal paragraphs. The legal panel now uses the shared prose measure. The final audit passed its operational contract in 40.2 seconds, or 74.83 seconds with the build. Source scan returned 0. Each live scan returned 2 with only the cream-palette heuristic. This warning matches the deliberately approved T002 background, `rgb(241, 240, 235)`, so it is a false positive for this design. All four long-line warnings cleared. `detector-results.json` and individual JSON/stderr files contain the final arguments, exits and findings. The audit is separate from the default behavioral suite.

Tasks 2–5: shared-shell unit passed. The seven existing shell/help browser cases and keyboard skip target passed. Homepage render/progress units passed. Legal tab validation passed five cases. Legal deep-link/history and real unauthenticated rights denial passed. Server HTML/SEO passed 25 tests. Client metadata/help units passed 17 cases. Eight public HTML/metadata/protected-root browser cases passed in 8.0 seconds. Local browser retries were zero.

Task 6: auth/verification/redirect units passed 45 cases in 2.12 seconds. Real AR/EN account creation reached unverified recovery, captured email verification and a verified session with the chosen locale. Returning users and hostile callbacks stayed on internal workspace routes. Expired-session recovery retained the synthetic draft. Its first test assumed an alert; the rendered notice correctly uses status. The corrected exact status/heading assertion passed in 5.3 seconds. No authentication behavior changed.

Normal validation: server units passed 184 cases in 14.54 seconds. Delivered-copy passed 3 cases in 0.526 seconds. Web units ran 1081 cases in 105.94 seconds: 1080 passed, one old policy-link expectation failed. After updating that expectation to the new draft-policy destination, all 6 affected cases passed in 2.16 seconds. Static validation rejected obsolete token allowances from the removed chapters. Removing those allowances tightened the existing guard; static validation then passed. No test or scanner was disabled.

Final review found that HEAD skipped the public GET cache policy and returned 200 for missing prerender artifacts. Three new cases failed, then passed after HEAD reused public representation selection without a body. All 26 server HTML cases passed. Protected-root and resume HEAD requests retain their early return. Arabic canonical URLs omit the locale query. English URLs use `?locale=en-US`. Legal tabs share one canonical resource and remain `noindex, follow`. Saved account preferences use `private, no-store`; public representations vary on Cookie.

The How it works anchor now transfers keyboard focus to the steps. Both locale browser cases failed before the target became focusable, then passed in 5.0 seconds. Independent document examples retain interface-language labels with explicit language and direction. Both label cases failed first; all four homepage render cases then passed in 1.82 seconds.

## Deep validation and recovery

The disk check before Deep showed 9.7GB free on root and 4.4GB on storage. Every command used the repository isolation preload and synthetic local databases. No environment file or paid provider was used. Logs remain in the ignored execution workspace for this plan.

The full `pnpm test:ci` ran once and exited 1 after 1056.14 seconds. Fifteen workspaces passed. Tooling passed 2789 cases, failed two Arabic glossary assertions and retained 32 existing skipped cases. The two new legal translations used the wrong word for provider. Both now use the approved `مزوّدي` in the PO catalog and copy deck. The affected Arabic, copy, delivered-binding and runner suites passed all 64 cases in 0.596 seconds. The added socket-path regression passed with the other 25 runner cases.

Deep stopped before three workspaces completed. The targeted continuation used `pnpm exec turbo run test:ci --concurrency=1 --filter=web --filter=server --filter=@reactive-resume/mcp`. It passed in 102.22 seconds: web 1084, server 187 and MCP 20. Across the original run and targeted recovery, 6824 current cases passed and 32 existing tooling skips remain. No test was deleted, disabled or relaxed. Unchanged successful workspaces did not run again.

The database variables were `COVER_LETTER_TEST_DATABASE_URL` and `INTEGRATIONS_TEST_DATABASE_URL` at `postgresql://postgres:postgres@localhost:55432/postgres`, plus `OAUTH_TEST_DATABASE_URL` at `postgresql://postgres:postgres@localhost:55432/job_language_oauth_current`. Browser runs used `E2E_DATABASE_ADMIN_URL=postgresql://postgres:postgres@localhost:55432/postgres` with Node 24.22.1 on PATH. Each runner created a fresh synthetic database and restricted runtime role.

The full browser command was `node tooling/local/ci-browser.mjs`, without a spec list or worker override. It selected 565 cases with four automatic workers and zero retries. It exited 1 after 721.83 seconds: 551 passed, 13 failed and one existing guest-login case stayed gated. The failures were four outdated policy destinations, two outdated homepage titles, two outdated hover-logo expectations, one support readiness race and four Chrome socket launch failures. Exact expectations now match the approved behavior. The support test waits for the existing client readiness contract before filling fields. Its failure, retry, retained-input and database receipt assertions remain intact.

All 13 failed cases and four refreshed home captures passed in a targeted run: 17 cases, 33.2 seconds test time, 35.38 seconds total. The refreshed examples now wait for the tab indicator animation before capture. All four received visual inspection. Concurrent workspace edits lowered the worker cap to three after the full run started. Those edits remain intact. Later runs automatically selected three workers. No observed failure required a parallel-only classification or a CI partition reproduction. There was no push or CI run.

After the glossary and paragraph refinement, all eight legal layout captures and the deep-link/history case passed: nine cases in 8.7 seconds, 12.22 seconds total. All eight revised captures received manual inspection in AR/EN at both widths. Final `pnpm validate:static` passed with exit 0 in 10.70 seconds. It includes formatting, lint, 22 workspace type checks, Knip and package boundaries. Only observed failures and changed source triggered further validation.

T011 is marked complete for the first implementation handoff, under the current root bookkeeping rule. No other roadmap task or dependency changed. Final legal/controller, retention, location, brand and publication approvals remain open. Implementation completion does not approve deployment or real processing.

Final review used the plan's five review-focus items against the actual unstaged diff and new source files. No unresolved critical or important implementation finding remains in this author review. The owner forbids subagents, so no independent review occurred. Concurrent AGENTS/D38 changes remain untouched. The explicit no-push instruction governs this execution. The index is empty, HEAD remains at the baseline, and the owner handles the later commit and PR.

The concurrent D38 addition made the last graph check reject its decision inventory, which ended at D37. The checker now requires exactly D01–D38. Its completeness and uniqueness rules remain intact. The graph check then passed with zero errors.

## Independent review follow-up

The five Terra findings affect B-O06, B-C01 and B-C12. The S01, S35 and consumed S14 frames above remain the source inventory.

- Protected dashboard redirects now carry the requested interface locale, including verification and expired-session recovery. Real English sign-in returns to the existing privacy controls.
- Both sign-out controls use one shared action. It cancels private requests before session revocation and opens localized sign-in without an expired-session reason. Failed sign-out reconciles the actual session.
- Superseded 2026-11-15: the visible footer credit was removed by owner decision; the MIT LICENSE file is kept in the repository. (Earlier, the Arabic attribution translated the surrounding wording.)
- Shared tab panels now inherit the existing visible keyboard outline. Legal pages need no local focus override.
- The shared public header puts locale selection before acquisition actions in DOM order. D36 reason: keyboard navigation must follow the visible rows at mobile and desktop widths.

Affected unit tests passed: 27 cases across web, shared UI and delivered-copy contracts. Five affected browser specs passed 50 cases in 26.3 seconds. The added real sign-in continuation passed separately in 4.6 seconds. All 51 cases used automatic workers capped at three and zero retries. They cover opposite-language cookies, both sign-out controls, genuine session expiry, translated credit, header order and visible panel focus. No full suite ran during this follow-up.

Twelve reviewed captures cover home, privacy and terms in AR/EN at 1440 and 390. The owner evidence folder contains them as `followup-focus-*.png`. Labels fit and no horizontal overflow appears. The Impeccable source detector returned an empty findings array with exit 0. Earlier live detector results remain recorded above.

The production web and server builds passed. Built locale artifacts contain localized titles, descriptions, language, direction and landing text. The production Hono handler supplies canonical, hreflang and localized Open Graph metadata before sending HTML. Raw HTTP responses for `/` and `/?locale=en-US` each returned 200 with the correct complete representation. Both contain one canonical link, three language alternatives and seven Open Graph tags. The synthetic local origin is not a deployed domain. Saved responses and `production-metadata-followup.json` record the artifact and served-HTML distinction.

The headless browser and production inspection used owned ports 3130/3133 and synthetic database roles. The existing server on 3030 remained untouched. No environment file, paid inference, staging, commit or push occurred.

## Shipping validation, 2026-11-16

The owner authorized commits, a ready PR, review fixes and a protected merge. This authorization supersedes earlier no-commit and no-push instructions for this handoff. Later owner-approved landing and footer revisions remain intact.

Before the initial commits, static validation passed. Affected tests passed: web 62, server 28, shared UI 2 and tooling 62. The unit partition audit found 145 tooling files across four shards with no omissions or duplicates. The roadmap checker reported zero errors and marks T011 done with T009 in the graph. Heavy validation runs on the PR under D38. The local server on port 3030 remains untouched.

The first PR CI round passed all unit jobs but reported 35 browser failures across seven shards. Paused finite animations below the landing fold prevented the shared screen-settling contract from completing. Those animations now start on reveal. Exact weighted partitions 1/10 and 2/10 reproduced the issue locally with one worker before the fix. Local reproduction supports distinct owned ports through `E2E_PORT` and `E2E_SMTP_PORT`, so the development server remains untouched.

Review fixes preserve legal-tab state in footer language navigation, active locale in policy/help recovery and chronological numeric date ranges. Failed sign-out confirms identity independently of route loaders. The decorative demo stays static when visibility observation is unavailable. Client checker metadata retains its own image and application schema. Regression assertions now cover actual header controls, account-entry wording, evidence endpoints and finite signature motion. Discovery copy distinguishes retained sharing code from release approval. The optional design audit resolves `IMPECCABLE_BIN` or the executable on PATH and remains separate from CI behavior tests.

The shared logo wrapper now uses flex alignment instead of a text baseline. This removes the one-pixel landing-header offset without changing the alignment tolerance. The language regression compares persisted CV facts and timestamps and distinguishes read-only RPC calls from mutations. Affected browser coverage passed 103 cases, then all six focused cases passed after the remaining fixes. Changed-file formatting and lint passed. Affected units passed: web 61, public shell tests, server SEO 2 and browser runner 33. No test retries ran locally. No retry-only success appeared in the first CI round.

The second CI round passed eight browser shards and failed five cases across shards 7 and 9. Exact local partitions reproduced both failures: shard 7 had one failure and 45 passes, and shard 9 had four failures and 72 passes. Four policy-link assertions still expected a URL without the locale. They now require the active locale. Simultaneous padding and margin transitions briefly changed the landing-header height by 1/32 pixel. The header retains width and color motion and changes its matching padding and margin together without transitions. The regression samples every animation frame and retains exact height equality. The stronger test failed against the previous build with the same fractional height. No retry-only success appeared in the second CI round.

After the rebuild, all five affected cases passed with three automatic workers and no retries. Static validation and changed-file formatting and lint passed.
