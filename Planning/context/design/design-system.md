# Master CV — Design System

**Version:** 0.8 · **Updated:** 2026-11-03 · **Visual baseline:** Master CV: Design (v1)  
**Status:** Working design-to-code reference synchronized with the redesigned Figma file (v1). Final owner/commercial approval and real application acceptance remain open.  
**Owns:** Visual foundations, bilingual layouts, component usage, interaction/state design and design-to-code handoff.  
**Companions:** [Coding-agent handoff](figma-handoff.md) · [Verified Figma map](figma-map.json) · [Requirements](../business/requirements.md) · [Architecture](../technical/architecture.md) · [Security](../technical/security.md) · [Decisions](../decisions.md) · [Index](../README.md)
**Launch contract (owner decided 2026-11-04):** In Arabic and English, launch uses email + password sign-up, email verification and email password recovery. Mobile sign-up, SMS verification/reset, password-recovery codes and S37-S39 are a later T014 increment, off at launch until company registration, sender approval and A14-A16. D20/D21 retain that increment's Phase 1/Phase 2 contracts; no implementation or gate approval is implied.

## 1. Decision in plain language

**Use the saved native design, not the old HTML or an unexecuted importer:** [Master CV: Design (v1)](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=0-1). Start with the [coding-agent handoff](figma-handoff.md), then use the exact frame ID from [figma-map.json](figma-map.json). This document owns visual rules; business requirements and security/release decisions retain authority over behavior and availability.

The current registry covers S01–S39 plus S08b, with Arabic RTL desktop/mobile masters, product states, form dialogs/sheets and curated English masters. Use [saved-design verification and limits](figma-handoff.md#verification-status-2026-11-04); design publication does not prove application acceptance.

Extend Reactive Resume's existing **Desk & Paper** interface instead of replacing its editor, component library or application structure. Keep the calm document canvas, semantic tokens, reversible editing and reviewable AI proposals. Adapt typography and layout for Arabic, retain equally usable English, and make facts, uncertainty and recovery visible.

This is the design of the **personal product**: candidate onboarding, career information, CV editing/review/tailoring/export, retained personal tools, proposed paid-plan flows, account controls and failure states. Employer recruitment, talent search, automatic applications, interview services and public professional profiles are not newly approved by this design.

**A crucial boundary:** a correct-looking HTML preview or Figma frame does not prove that Reactive Resume can import or export Arabic correctly. Its actual renderer, PDF extraction, Word output, mobile editing and persistence still need the application acceptance tests required by A01-A16 as relevant; A14-A16 cover proposed mobile authentication without supplier or Phase 2 approval.

**Launch, AR/EN:** email + password sign-up, email verification and email password recovery. Mobile/password signup, SMS verification/reset, recovery codes and S37-S39 are later T014 work, off until company registration, sender approval and A14-A16. The [OTP contract](specs/otp-spec.md) retains the later increment's Phase 1/Phase 2 details.

## 2. Reference and implementation boundaries

The primary reference is **Reactive Resume Desk & Paper**, pinned to `14fb49b7149f6f13bdb1fff3659feec5200bf4df` (v6.0.4); inspect actual components before reuse.

Preserve facts-first entry, evidence, original/proposed text and explicit accept/keep-original actions. Provide upload and manual entry with visible availability limits; test complete mobile flows. Isolate mixed-direction values, measure contrast and targets, and test actual Arabic font rendering.

Competitor marketing does not establish user preferences, outcomes, compliance or release approval. Saudi focus governs language, local payments and privacy communication. No published component library or completed Code Connect bindings are established.

## 3. Visual direction and change log against upstream

**Working name:** Master CV · Desk & Paper / المكتب والورق.

| Element               | Preserve                                                                                                    | Adapt for Master CV                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Layout character      | Quiet warm workspace, bright paper, thin rules, restrained hierarchy                                        | Clear onboarding, source review, privacy and usage states                                                                                |
| Color vocabulary      | Upstream `bg`, `surface`, `raised`, `sunken`, `ink*`, `accent*`, `danger*`, `warn*`, `info*`, `paper` roles | Stronger `line-2` control boundary; explicit `on-danger`; fixed `paper-ink`                                                              |
| Functional typography | Clear sans-serif roles and readable labels                                                                  | Noto Sans Arabic for Arabic; Noto Sans for English in this proposal                                                                      |
| Editorial display     | A restrained serif display role analogous to Newsreader                                                     | Noto Sans Arabic for native Arabic display; Noto Serif for English display (the earlier Naskh proposal is superseded for this reference) |
| Controls              | Existing Button, Input, Tabs, sheets/dialogs, alerts and toasts                                             | Arabic labels, long-label wrapping, source-evidence and acceptance interactions                                                          |
| Editor                | Write / Design / Check concept; separate document canvas                                                    | Mobile Write/Preview switching and independent UI/document language                                                                      |
| Icons                 | Existing production Phosphor architecture                                                                   | Original simple outline glyphs used only in the design prototype; replace/map to matching existing Phosphor glyphs in production         |
| Templates             | Reuse existing template implementation                                                                      | Onyx/Persian shown as candidate single-column layouts; not certified or the final release list                                           |

The original client mock used IBM Plex Sans Arabic. That mock was not a binding font selection. The proposed Noto families are a deliberate design adaptation, not a claim that upstream already uses them. Current upstream uses Hanken Grotesk/Newsreader for its main interface, with additional marketing typography. Do not accidentally ship both complete font stacks after adopting this proposal.

The source CSS uses authoritative OKLCH values; its design guide lists approximate sRGB colors. **This synchronized reference pins the sRGB values below** for browser/Figma consistency. Preserve the semantic names and consciously replace values in code; do not mix selected hex values with unexamined upstream OKLCH approximations and call them identical.

## 4. Color system

| Token            | Light         | Dark          | Role                                        |
| ---------------- | ------------- | ------------- | ------------------------------------------- |
| `--bg`           | `#F1F0EB`     | `#100F0C`     | Workspace background                        |
| `--surface`      | `#FAF9F6`     | `#1A1915`     | Panels and cards                            |
| `--raised`       | `#FFFFFF`     | `#24231F`     | Inputs, menus and dialogs                   |
| `--sunken`       | `#E7E6E0`     | `#0A0907`     | Document canvas and inset areas             |
| `--line-1`       | `#ECEBE6`     | `#27261F`     | Hairline: row separators inside cards       |
| `--line`         | `#DDDCD6`     | `#33322C`     | Card borders, section dividers (decorative) |
| `--line-2`       | `#8A8982`     | `#848279`     | Visible control boundaries                  |
| `--ink`          | `#1C1B15`     | `#EFEEEB`     | Primary interface text                      |
| `--ink-2`        | `#4F4D47`     | `#BCBAB5`     | Secondary text                              |
| `--ink-3`        | `#66655E`     | `#979590`     | Metadata and placeholder text               |
| `--accent`       | `#337344`     | `#6FC082`     | Primary actions, selection and focus        |
| `--accent-hover` | `#206133`     | `#83D494`     | Primary hover                               |
| `--on-accent`    | `#F7FEF8`     | `#07150A`     | Text on primary actions                     |
| `--accent-soft`  | `#DCF2DF`     | `#1A3520`     | Selected/reviewed surfaces                  |
| `--accent-text`  | `#195C2E`     | `#8FD89E`     | Text on selected surfaces                   |
| `--danger`       | `#BA3630`     | `#D9544B`     | Destructive action                          |
| `--on-danger`    | `#FFFFFF`     | `#100F0C`     | Text on destructive action                  |
| `--danger-soft`  | `#FFE7E4`     | `#47211D`     | Error background                            |
| `--danger-text`  | `#A92321`     | `#FDA297`     | Error text                                  |
| `--warn`         | `#D29922`     | `#E4B750`     | Warning decoration, not small text          |
| `--warn-soft`    | `#FCEDCD`     | `#3E2D10`     | Review-needed background                    |
| `--warn-text`    | `#81520A`     | `#EFCC83`     | Review-needed text                          |
| `--info-soft`    | `#E0F1FF`     | `#192F46`     | Neutral information background              |
| `--info-text`    | `#1D5B92`     | `#9DC9F7`     | Information text                            |
| `--paper`        | `#FFFFFF`     | `#FFFFFF`     | CV paper in both themes                     |
| `--paper-ink`    | `#20231F`     | `#20231F`     | CV text; not inverted with UI               |
| `--brand-panel`  | `#193B24`     | `#193B24`     | Fixed brand story panel                     |
| `--on-brand`     | `#F3F8F1`     | `#F3F8F1`     | Text on the fixed brand panel               |
| `--scrim`        | `#1C1B15` 45% | `#000000` 62% | Overlay backdrop                            |

v0.8 correction: `bg`, `surface` and `raised` are now distinct steps (about 1.08:1 between neighbours instead of near-identical), `line-1` is the new hairline, and `ink-3` was darkened so metadata stays AA on the darker workspace. `--paper` and `--paper-ink` must not inherit the interface's dark palette. Story panels use the observed `brand-panel` / `on-brand` semantic roles; do not reuse them as general body surfaces. The prototype logo (2026-10-24) is the C✓ mark, an open C with a tick standing for the V in CV, bound to `ink` and `accent` (the on-brand tone uses the Dark colour mode), plus a "Master CV" wordmark. It is a working proposal, not a trademark clearance or final logo approval.

### Use rules

Reserve the accent fill for the main action, selected navigation and relevant progress. Use neutral secondary buttons for alternatives. Do not color all cards green. Error, question and review-needed states combine wording with an icon or structural cue; color is never the only signal. The warning yellow is decorative; small warning text uses `warn-text` on `warn-soft`.

Use `line-1` for separators inside a card and `line` for card borders. Neither is the sole identifiable boundary of an input. `line-2` is stronger than upstream's approximate `#C5C4BE`/`#494843` input borders and passes 3:1 on `raised` and on `bg`. Labels, content and focus remain visible in both themes. Disabled UI opacity is a state illustration, not a required contrast claim for active controls.

### Persisted design-token integrity

A token reference alone is not rendering evidence. When editing Figma, retain the variable binding **and** write a matching resolved RGB paint for the consuming mode; save, reread and inspect the resulting render. In the web implementation, use the corresponding semantic CSS variables and test the actual browser output. Do not globally remove token bindings or hard-code white text as a workaround. See [saved-design verification and limits](figma-handoff.md#verification-status-2026-11-04).

### Measured contrast pairs

Ratios were calculated from these sRGB values, not eyeballed. This table tests the specified combinations only. It does not certify every production state, image, overlay or focus treatment.

| Theme | Foreground / background       |   Ratio | Target | Result |
| ----- | ----------------------------- | ------: | -----: | ------ |
| Light | `ink` / `bg`                  | 15.12:1 |  4.5:1 | Pass   |
| Light | `ink-2` / `surface`           |  8.03:1 |  4.5:1 | Pass   |
| Light | `ink-3` / `bg`                |  5.13:1 |  4.5:1 | Pass   |
| Light | `on-accent` / `accent`        |  5.57:1 |  4.5:1 | Pass   |
| Light | `accent-text` / `accent-soft` |  6.82:1 |  4.5:1 | Pass   |
| Light | `danger-text` / `danger-soft` |  6.04:1 |  4.5:1 | Pass   |
| Light | `on-danger` / `danger`        |  5.74:1 |  4.5:1 | Pass   |
| Light | `warn-text` / `warn-soft`     |  5.77:1 |  4.5:1 | Pass   |
| Light | `info-text` / `info-soft`     |  6.14:1 |  4.5:1 | Pass   |
| Light | `line-2` / `raised`           |  3.51:1 |    3:1 | Pass   |
| Light | `line-2` / `bg`               |  3.08:1 |    3:1 | Pass   |
| Dark  | `ink` / `bg`                  | 16.52:1 |  4.5:1 | Pass   |
| Dark  | `ink-2` / `surface`           |  9.07:1 |  4.5:1 | Pass   |
| Dark  | `ink-3` / `bg`                |  6.40:1 |  4.5:1 | Pass   |
| Dark  | `on-accent` / `accent`        |  8.51:1 |  4.5:1 | Pass   |
| Dark  | `accent-text` / `accent-soft` |  7.93:1 |  4.5:1 | Pass   |
| Dark  | `danger-text` / `danger-soft` |  7.18:1 |  4.5:1 | Pass   |
| Dark  | `on-danger` / `danger`        |  4.86:1 |  4.5:1 | Pass   |
| Dark  | `warn-text` / `warn-soft`     |  8.59:1 |  4.5:1 | Pass   |
| Dark  | `info-text` / `info-soft`     |  7.90:1 |  4.5:1 | Pass   |
| Dark  | `line-2` / `raised`           |  4.08:1 |    3:1 | Pass   |
| Dark  | `line-2` / `bg`               |  4.97:1 |    3:1 | Pass   |

## 5. Typography and script handling

**Native implementation reference:** Noto Sans Arabic for Arabic UI and headings, Noto Sans for English functional UI, and Noto Serif Medium for English editorial headings. The old Noto Naskh Arabic display choice is not the current Figma target: the native handoff records it as unavailable through that connection. This is an explicit adaptation, not an owner-approved new brand or a claim that Naskh is unsuitable in general.

The v1 file has one shared style set; each style binds its family and weight to the **Type** variable collection (mode Arabic or English), so a frame switches language by mode, never by restyling. Values read from Figma on 2026-10-24. They are a base style set; the target hero and mobile composition may have deliberate instance-level sizing overrides. Inspect that node rather than forcing every heading to one size.

| Shared role       | Size / line height, px | Arabic                      | English                     |
| ----------------- | ---------------------- | --------------------------- | --------------------------- |
| Display           | 48 / 70                | Noto Sans Arabic Medium     | Noto Serif Medium           |
| Display S         | 32 / 48                | Noto Sans Arabic Medium     | Noto Serif Medium           |
| Title             | 32 / 48                | Noto Sans Arabic SemiBold   | Noto Serif Medium           |
| Title S           | 24 / 36                | Noto Sans Arabic SemiBold   | Noto Serif Medium           |
| Section           | 19 / 29                | Noto Sans Arabic SemiBold   | Noto Sans SemiBold          |
| Body              | 14 / 23                | Noto Sans Arabic Regular    | Noto Sans Regular           |
| Lead              | 17 / 31                | Noto Sans Arabic Regular    | Noto Sans Regular           |
| Label             | 14 / 22                | Noto Sans Arabic SemiBold   | Noto Sans SemiBold          |
| Metadata          | 12 / 20                | Noto Sans Arabic Regular    | Noto Sans Regular           |
| Metadata strong   | 12 / 20                | Noto Sans Arabic SemiBold   | Noto Sans SemiBold          |
| Input             | 16 / 26                | Noto Sans Arabic Regular    | Noto Sans Regular           |
| Mobile navigation | 12 / 20                | Regular / selected SemiBold | Regular / selected SemiBold |

Navigation also has 13/22 default/selected styles. CV paper uses separate Paper AR/EN styles (22, 11, 9 px) that follow the CV language. The complete style list is in `textStyles` in [figma-map.json](figma-map.json). The earlier v0.4 CSS type scale is superseded.

Keep the document's fonts and script independent of the UI. A Noto Naskh document template remains an unvalidated candidate, not a promised export capability. UI translations must not translate or replace a person's CV values.

Use actual available font styles. No faux condensed Arabic, negative tracking on joined text, per-letter spacing animation or hardcoded extra spaces. Preserve diacritics and names. Long labels should reflow; compact language controls must keep `AR` / `EN` on one line.

Font binaries are not supplied in this package. Acquire approved font assets from official sources, preserve applicable license notices, self-host where required by the processing policy, and test real browser/document rendering. Do not assume the coding agent has these fonts or inherits this chat's Figma access. Avoid shipping both complete upstream and replacement UI font stacks unintentionally.

**Proposed loading acceptance:** extend the existing self-hosted font pipeline in `packages/ui/src/styles/globals.css` with the specified licensed Noto faces/weights. Use `font-display: swap` for UI; wait for required fonts before visual/export acceptance. A document-font failure exposes recoverable retry and prevents a false export-success claim. Record actual assets, fallback metrics and shaping evidence during implementation; no assets or passing captures are supplied here.

## 6. Layout, spacing and responsiveness

Use the observed named spacing values: 0, 4, 6, 8, 12, 16, 18, 20, 24, 28, 32, 40, 44, 48, 56 and 64 pixels. Their Figma names are `space/{value}` and CSS names are `--space-{value}`. Do not invent extra values where these roles suffice. Default card padding is 24px desktop and 20px mobile. The earlier 14px narrow-support-card guidance is a documented layout exception, not an existing `space/14` token; inspect the current node rather than inventing a variable that is not in the snapshot. Main-page horizontal padding is 40px desktop, 28px tablet and 18px mobile.

Radii: input/button 8px, chip 999px, card/menu 12px, dialog 16px, mobile sheet 18px, large preview container 16px. Use modest elevation around paper and overlays; ordinary information hierarchy should not depend on shadows.

| Layout                                | Proposal                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Desktop review reference              | 1440px width; sidebar 236px; top bar 80px; content fluid                                                                |
| Focused editor                        | No full application sidebar; 76px top bar; 360px editing panel; remaining width for paper                               |
| Tablet                                | Reduce margins and complexity; stack headings/actions and content when columns become cramped                           |
| Mobile reference                      | Native frames use 390px width and 844px viewport; test 320px reflow in the actual application                           |
| Mobile editor                         | One pane at a time: Write or Preview; Design and Check are explicit destinations                                        |
| Mobile navigation                     | Document, career information, personal applications and settings; fixed navigation must not hide the final control      |
| Browser implementation review targets | 320, 390, 768 and 1440 CSS pixels; the older HTML prototype was checked at these widths, not the unbuilt production app |

Prefer content-driven wrapping over device-name branches. Validate reflow at desktop 1440 and mobile 390; derive responsive transitions from actual content and accessibility tests.

The native 390px reference uses a 52 × 48px language control and 90 × 48px bottom-navigation controls. These widths are reference geometry, not fixed widths for every device. In a narrower implemented layout, distribute the four navigation cells within the available width, retain at least a 44px clickable target, and let descriptive labels reflow without horizontal overflow; keep `AR`/`EN` unbroken. Size the actual clickable wrapper, not just its surrounding decoration, and leave scroll content clear of the persistent bottom bar.

A document canvas can be zoomed or panned when implemented, but provide explicit keyboard/touch controls and a reset view. A screen thumbnail is not the exported CV and must never become the production PDF renderer.

## 7. Arabic RTL and bilingual behavior

Set semantic document direction on the interface root. Keep the interface language and the CV's language independently selectable. An Arabic UI can edit an English CV; changing interface language must not translate, reorder or overwrite the person's saved content.

Use logical CSS properties (`padding-inline`, `margin-inline`, `border-inline-start`, `inset-inline`) and mirror navigation placement deliberately. Directional back/forward arrows mirror; a download, globe, logo, telephone symbol or product mark does not mirror merely because the UI is Arabic.

For known LTR values such as email, phone, URLs and a single technical term, isolate that token with `dir="ltr"`. For unknown user-supplied inline text, use `<bdi dir="auto">` or the appropriate directional wrapper. Do not reverse strings in JavaScript or insert visual-order text into the database. Date ranges require their own tested display policy; keep year precision and calendar ambiguity rather than guessing.

Arabic copy should be clear professional Arabic, not forced dialect and not a literal translation of English layout constraints. Examples in the design are synthetic. Do not infer nationality, gender, credentials or ability from a name. A missing job requirement is “no evidence found,” not “you cannot do this.”

Phone and OTP fields remain LTR inside RTL UI. Display Latin digits; accept/normalize Arabic-Indic and Eastern Arabic digits before validating on client/server. Keep country prefix and masked destination isolated without reversing characters. Interface-language switching preserves the challenge/number and never translates CV content. Use Saudi-format validation and explain errors in the selected interface language.

### Launch locale contract (proposed)

**WORKING planning contract, not implemented or release-approved.** Ship complete `ar-SA` (RTL) and `en-US` (LTR) interfaces. Retain Lingui's English source/fallback and the existing direction provider; source/fallback locale does not choose the first-visit UI. Selection precedence is explicit supported URL locale, saved signed-in UI preference, locale cookie, then `ar-SA`. Ignore unsupported values at each step; do not advertise inherited locales as shipped Master CV interfaces. An explicit switch updates the applicable preference/cookie while preserving unsaved forms, focus and verification challenges.

Persist UI preference separately from each CV's `ar`/`en` content language. Set root `lang`/`dir` from UI locale, including portals; override them for CV previews and known different-language passages. Switching UI must not translate, reorder or overwrite saved or unsaved CV content. Extend the existing Lingui/locale integration described in [architecture](../technical/architecture.md#locale-and-bilingual-integration-proposed).

### Numeric, date and search behavior (proposed)

For each numeric/date field, specify accepted input, canonical storage, display options and localized validation before its acceptance. Normalize ASCII, Arabic-Indic and Eastern Arabic digits in numeric-only inputs on client/server; retain OTPs as strings with leading zeros and preserve free text. Decimal/grouping separators must have a field-specific parse rule; reject ambiguous input with a localized error rather than guessing. Never infer a calendar from digit shape.

Store application instants in UTC. CV dates retain original calendar, year/month/day precision and unknown/ambiguous values, without inventing an instant or completing missing parts. Under **D24 OWNER DECIDED 2026-11-04**, general UI uses explicit Gregorian (`calendar: 'gregory'`) display, Latin (`numberingSystem: 'latn'`) digits and application timestamps in `Asia/Riyadh`; no Hijri picker or automatic conversion at launch. Preserve imported Hijri dates with calendar/precision labels. Date ranges keep semantic start then end in one isolated group, with localized labels/month names and the original precision.

Use `Intl.NumberFormat` with explicit `uiLocale`, numbering system, grouping and field-specific fraction digits/rounding for numbers and percentages; percentage fields declare whether canonical values are ratios. Display SAR from canonical minor-unit amounts at two fractional digits; any display rounding uses an explicit rule and never changes the stored amount or authorizes a billing calculation. Keep signs, percentages and whole amount/range groups isolated; use the approved Currency/SAR vector and accessible label. See [D24](../decisions.md#open-business-decisions-and-risks) for the owner decision and remaining acceptance boundary.

Title/name search uses a derived Unicode NFC comparison value, removing Arabic harakat and tatweel and normalizing search digits; preserve original display/storage. Do not collapse hamza/alif/ya variants without a separate tested rule. Alphabetical document lists use `Intl.Collator(uiLocale, {numeric: true, sensitivity: 'variant'})` with stable ID tie-breaker; server pagination must use the same contract. Timestamp lists retain timestamp ordering. Test Arabic, English, mixed-script and diacritic fixtures; ATS-specific normalization is a separate contract.

## 8. Component contract

Keep the production Base UI/React component foundation and Phosphor integration. Extend existing component APIs rather than create a parallel UI library. The original icon drawings in the static prototype are review assets, not a requirement to replace upstream icons.

| Family                        | Required states and behavior                                                                                     | Implementation/design notes                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button                        | Primary, secondary, ghost/link and danger; default, hover, focus, disabled, loading                              | One obvious primary action per task. Desktop min 44px control; touch target 44px or larger, usual control height 48px. Loading has a specific progress label and prevents duplicate activation                                                                          |
| Input / textarea / select     | Default, focus, invalid, disabled, populated                                                                     | Persistent label, helper text and actionable error. Do not use placeholder as label. Passwords permit paste and password managers; no cognitive puzzle in the proposed auth flow                                                                                        |
| Checkbox / consent row        | Checked, unchecked, focus, invalid if required                                                                   | Full label activates control. Do not pre-check unrelated consent. Pricing acceptance must be explicit in production. Terms (S25) and deletion confirmation (S30) are unchecked in the masters                                                                           |
| Navigation / tabs             | Selected, unselected, focus                                                                                      | Labels remain visible; selected state is not color-only. Use Tabs for view changes, not simulated links with no destination                                                                                                                                             |
| Document card                 | Original, tailored, language variant, review-needed                                                              | Name, language, privacy, last update and explicit open action. Overflow menu needs accessible name                                                                                                                                                                      |
| Status badge                  | Neutral, confirmed, question, review-needed, error                                                               | Always meaningful text; sample count is not an ATS score                                                                                                                                                                                                                |
| Alert                         | Information, success, review-needed, error                                                                       | State what happened, what is preserved and the next action. Do not claim a failed job was completed. Use the Stacked layout in narrow panels and on mobile                                                                                                              |
| Radio option                  | Selected, unselected, focus, unavailable                                                                         | An unavailable option stays visible, reads "not available yet" with the reason and cannot be selected (Word/DOCX on S12 until A05)                                                                                                                                      |
| Processing notice             | Inline line with a lock icon                                                                                     | Say what is sent and to whom in plain words (S04, S11, S19, S29). No absolute privacy claims before the data map is approved                                                                                                                                            |
| Evidence panel                | Source, proposed text, reason, confirmation state                                                                | Source references and accepted facts are distinct from independent verification                                                                                                                                                                                         |
| Suggestion comparison         | Original, proposed, edited, accepted, rejected, stale                                                            | Accept, edit, keep original and undo. Never silently apply a stronger claim or stale patch                                                                                                                                                                              |
| Dialog/sheet                  | Open, keyboard focus, close/escape, validation                                                                   | Focus enters and returns to trigger. Destructive confirmation states what is removed and what remains. Sheets become bottom-oriented only when useful on touch. Form content masters: change email, change password (with mismatch error), application, account details |
| Progress / background job     | Queued, running, success, recoverable failure, stopped                                                           | Use stage names when completion percentage is unknown. Never fabricate progress or imply closing a browser cancels durable work                                                                                                                                         |
| Toast                         | Confirmation, undo, failure notification                                                                         | Screen reader status; enough time to act. Critical errors also remain in context; not toast-only                                                                                                                                                                        |
| Plan / billing row            | Proposed entitlement, current, expiring, failed renewal, cancelled                                               | Final prices, renewal and limits must be approved. Never make a browser success redirect the authority for payment. Drawn: Start before upgrade (S24), renewal off and renewal failed (S27), CV limit (S05)                                                             |
| Phone field                   | Default, focus, error, disabled; RTL/LTR shell with LTR value                                                    | Proposed Saudi field with visible +966 prefix, `type=tel`, `autocomplete=tel`, digit normalization and existing Field tokens; no country-picker scope.                                                                                                                  |
| OTP field                     | Default, focus, error, disabled; RTL/LTR shell with LTR value                                                    | Proposed single text input with 6 visual segments, numeric keyboard and one-time-code autocomplete; paste/manual entry preserve leading zero. Explicit Verify action.                                                                                                   |
| Resend status                 | Countdown, available                                                                                             | Proposed server-derived resend time, separate expiry and meaningful status announcements; disabled UI does not replace API limits.                                                                                                                                      |
| Mobile-auth notice / recovery | Phase 1 password-bearing signup, optional email, masked destination and verified-mobile SMS reset/recovery codes | Explain one-time codes, all-contact reset notices, enrolled MFA and the no-number/no-codes/no-email boundary. SMS-only sign-in stays Phase 2 off.                                                                                                                       |

The published export9 Components baseline contains 69 component sets plus 2 standalone components; RTL-aware sets use a `Dir` property instead of duplicated Arabic/English sets (for example Button: 4 variants × 5 states × 2 sizes; Field: 5 states × RTL/LTR value), 80 Phosphor icons, the riyal vector and Amount, and prototype radio groups. 23 dialog/sheet form masters representing 13 logical names live on _States & Patterns_ (map key `dialogs`). IDs are in [the Figma map](figma-map.json). Other families in the table are implementation obligations, not a claim that every family has a published Figma component or completed code mapping.

### ATS readiness issue list (planned)

**WORKING D22; exported design records are published, implementation and A04 acceptance remain open.** S10/S12 and the existing editor check panel should show separate **PDF readability**, **writing and content findings**, and **evidence for a selected job**. Use issue lists, with no score badge, gauge, universal ATS score or rejection prediction. A defined matched/total term count belongs only inside selected-job evidence, with scope and source passages.

Each issue gives severity text/icon, what is wrong, why it matters, field/page evidence and a safe fix or review action. Order demonstrated blockers before warnings and tips; never color alone. Blockers mean observed file/content failure or a known destination constraint, not predicted rejection. Preview fixes/AI patches, accept explicitly, support undo and recheck regenerated bytes. Advice alone does not disable export.

| Severity | Existing semantic tokens         | Treatment                                                                            |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| Blocker  | `--danger-soft`, `--danger-text` | Explicit label/evidence and repair/regenerate or review action, no hiring verdict.   |
| Warning  | `--warn-soft`, `--warn-text`     | Specific compatibility/ambiguity warning; `--warn` for decoration, never small text. |
| Tip      | `--info-soft`, `--info-text`     | Optional content/writing suggestion and review action, no score penalty.             |

Each result independently shows not checked, checking, complete, skipped/partial, stale and failed. Show checked revision/artifact, checker version and time; stale/failed results have no current success label. Offer retry/manual review; extracted evidence is private. Use logical ordering and mixed-direction isolation for Arabic with English skills, contacts and dates. Verify keyboard/screen-reader and AR/EN desktop/mobile behavior. State destination Arabic parser support is unknown unless verified. [B-C07/A04](../business/requirements.md#ats-readiness-working) own proposed acceptance.

## 9. Screen inventory and scope

The source of truth for node navigation is [figma-map.json](figma-map.json). Published export9 baseline: 40 screen records, S01-S39 plus mobile-only S08b; 39 desktop and 40 mobile screen masters; 270 state masters = 150 product masters representing 75 logical states + 120 record/fixture snapshots; 69 component sets plus 2 standalone components. There are 23 dialog/sheet form masters and 10 English-interface masters. These replace the previous file's 444 duplicated AR/EN state frames. S37-S39 and the S08/S10/S12 ATS components/states are included in this exported design baseline; processing, authentication and release gates remain open. States are **not product features or app routes**; the implementation uses the current masters and component contracts.

The table lists the current screen IDs with the former keys they absorb. The design foundations (former `foundations`) are on the Foundations and Components pages, not a screen. Expanded recovery states and exact IDs live only in the map; a state existing in Figma does not approve it for release.

| ID  | Screen                                    | Former keys                               | Requirement         | Scope                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------- | ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | Landing / الرئيسية                        | `landing`                                 | B-C02               | Personal MVP                                                                                                                                                                                                                                                              |
| S02 | Create account / إنشاء حساب               | `signup`                                  | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S03 | Verify email / تأكيد البريد               | `verify`                                  | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S04 | First visit / الزيارة الأولى               | `welcome`                                 | B-C02               | Personal MVP                                                                                                                                                                                                                                                              |
| S05 | Start a CV / بدء سيرة                     | `start`                                   | B-C02               | Personal MVP                                                                                                                                                                                                                                                              |
| S06 | Import CV / رفع السيرة                    | `import, import-error`                    | B-C02               | Personal MVP                                                                                                                                                                                                                                                              |
| S07 | Confirm imported facts / مراجعة المعلومات | `facts`                                   | B-C02               | Personal MVP                                                                                                                                                                                                                                                              |
| S08 | Write & preview / الكتابة والمعاينة       | `editor, editor-english-document`         | B-C03               | Personal MVP                                                                                                                                                                                                                                                              |
| S09 | Template & layout / القالب والتنسيق       | `templates`                               | B-C03               | Personal MVP                                                                                                                                                                                                                                                              |
| S10 | Review overview / مراجعة السيرة           | `review`                                  | B-C07               | Personal MVP                                                                                                                                                                                                                                                              |
| S11 | Review a suggestion / مراجعة اقتراح       | `proposal, service-error, limit`          | B-C04               | Personal MVP                                                                                                                                                                                                                                                              |
| S12 | Export / تصدير المستند                    | `export`                                  | B-C08               | Personal MVP                                                                                                                                                                                                                                                              |
| S13 | Export ready / المستند جاهز               | `export-ready`                            | B-C08               | Personal MVP                                                                                                                                                                                                                                                              |
| S14 | Sign in / تسجيل الدخول                    | `signin, reset-success`                   | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S15 | Forgot password / استعادة كلمة المرور     | `forgot, reset-sent`                      | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S16 | New password / كلمة مرور جديدة            | `reset-new`                               | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S17 | My documents / مستنداتي                   | `dashboard`                               | B-C05               | Personal MVP                                                                                                                                                                                                                                                              |
| S18 | Career information / المعلومات المهنية    | `profile`                                 | B-C05               | Personal MVP                                                                                                                                                                                                                                                              |
| S19 | Target a job / سيرة لوظيفة                | `tailor`                                  | B-C06               | Personal MVP                                                                                                                                                                                                                                                              |
| S20 | Job evidence / المطابقة                   | `evidence`                                | B-C06               | Personal MVP                                                                                                                                                                                                                                                              |
| S21 | Language versions / النسخ واللغات         | `variants, translation-review`            | B-C09               | Personal MVP                                                                                                                                                                                                                                                              |
| S22 | Version history / سجل النسخ               | `history`                                 | B-C05               | Personal MVP                                                                                                                                                                                                                                                              |
| S23 | Save conflict / تعارض الحفظ               | `conflict`                                | B-C05               | Personal MVP                                                                                                                                                                                                                                                              |
| S24 | Plans & usage / الخطة والاستخدام           | `plans`                                   | B-C11               | P2 proposal                                                                                                                                                                                                                                                               |
| S25 | Review purchase / مراجعة الشراء           | `checkout`                                | B-C11               | P2 proposal                                                                                                                                                                                                                                                               |
| S26 | Payment confirmed / تم الدفع              | `payment-success`                         | B-C11               | P2 proposal                                                                                                                                                                                                                                                               |
| S27 | Manage subscription / إدارة الاشتراك       | `billing, billing-cancelled`              | B-C11               | P2 proposal                                                                                                                                                                                                                                                               |
| S28 | Account settings / الإعدادات               | `settings, email-change, password-change` | B-C01               | Personal MVP                                                                                                                                                                                                                                                              |
| S29 | Privacy & data / الخصوصية والبيانات       | `privacy, export-data`                    | B-C12               | Personal MVP                                                                                                                                                                                                                                                              |
| S30 | Delete account / حذف الحساب               | `delete-confirm, delete-reauth`           | B-C12               | Personal MVP                                                                                                                                                                                                                                                              |
| S31 | Deletion requested / طُلب الحذف            | `delete-requested`                        | B-C12               | Personal MVP                                                                                                                                                                                                                                                              |
| S32 | Cover letter / خطاب التقديم               | `letter`                                  | B-C10               | Retained-feature candidate                                                                                                                                                                                                                                                |
| S33 | Applications / متابعة التقديمات           | `applications, application-new`           | B-C13               | Retained-feature candidate                                                                                                                                                                                                                                                |
| S34 | Application details / تفاصيل التقديم      | `application-detail`                      | B-C13               | Retained-feature candidate                                                                                                                                                                                                                                                |
| S35 | Privacy and terms / الخصوصية والشروط      | `privacy-policy, terms`                   | B-C12               | Personal MVP; legal text is a draft pending owner approval                                                                                                                                                                                                                |
| S36 | Help and contact / المساعدة والتواصل      | `help, support-sent`                      | B-O01, B-O05        | Personal MVP                                                                                                                                                                                                                                                              |
| S37 | Mobile number                             | New proposed ID; no former key            | B-C01, B-C17, B-C18 | Phase 1 mobile + password create/verification and authenticated add/change; SMS-only sign-in instance retained for gated Phase 2, off pending explicit owner risk acceptance; later T014 increment, off at launch until company registration, sender approval and A14-A16 |
| S38 | Verify mobile                             | New proposed ID; no former key            | B-C17, B-C18        | OTP entry and delivery/error/retry/help states, with server-bound intent; later T014 increment, off at launch until company registration, sender approval and A14-A16                                                                                                     |
| S39 | Mobile verified                           | New proposed ID; no former key            | B-C17, B-C18        | Confirmed outcome and correct continuation; never shown merely because an SMS arrived; later T014 increment, off at launch until company registration, sender approval and A14-A16                                                                                        |

### Primary journeys

1. **New candidate, launch AR/EN:** S02 email + password and terms → S03 email verification → S04. Email verification alone never bypasses enrolled MFA or account restrictions.
2. **Existing CV, launch AR/EN:** S14 email + password → enrolled MFA → S17. S15 email recovery → email link → S16 new password → S14 password changed; next sign-in still requires enrolled MFA.
3. **Target a job:** documents/editor → pasted job description → requirement/evidence view → clarification or omission → tailored copy → language review → export. Original CV remains unchanged.
4. **Return and revise:** documents → editor → history/restore → new current revision. A competing save opens conflict recovery, not last-write-wins data loss.
5. **Paid personal flow:** plans on the Start plan (S24 state) → order review (S25) → provider payment → verified payment state (S26) → billing/renewal management (S27, including renewal off and renewal failed). The masters show the persona after upgrading to Focus. The design uses explicitly illustrative values authorized for mockups; production commercial approval remains open.
6. **Account and privacy, launch AR/EN:** S28 email/password settings preserve the old email until replacement verification; S29 export/S30 deletion require fresh purpose-bound proof and separate deletion confirmation. S35 notices precede collection; S36 offers email recovery help. Mobile settings/recovery and S37-S39 remain a later T014 increment.
7. **Retained tools:** a fact-based cover letter and personal application board, with linked CV versions. This is not employer recruiting software.

### States that remain implementation obligations

The core visual variants include scan rejection, session expiry, password changed, email change pending, translation review, CV limit, assistant not enabled (fail closed), uncertain dates, missing evidence, unapproved AI route/unavailable service, usage exhaustion, stale-version/save conflict, download-ready, verification, reset, deletion review and data export. The native prototype demonstrates account/billing outcomes with simulated state; its test launchers are not customer-facing product routes. It does not execute authentication, durable queues, AI, real uploads, billing, CV export or deletion.

Error text must distinguish: file unsupported, upload interrupted, parsing uncertain, provider unavailable, schema error, stale suggestion, unsaved local edits, payment pending/failed, inaccessible document and expired link. Share the component language and recovery principles even where a full additional frame is not included. Do not treat this inventory as authority to omit production states from A01-A16 as relevant; A14-A16 govern proposed mobile authentication and approve neither a supplier nor Phase 2.

### Mobile OTP scope: proposed and gated

**Later T014 increment only:** these Phase 1/Phase 2 contracts are off at launch and do not block email-based beta or paid qualification. Company registration, sender approval and A14-A16 precede activation.

**OWNER DECIDED 2026-11-04; implementation gated.** The [OTP specification](specs/otp-spec.md) owns full flow, security and bilingual copy requirements. Reuse published S37-S39 baselines; new targets below are unpublished specs with empty copy `nodeIds`, not observed frames. A14-A16 and A15 real-send controls remain.

| Target           | Required state/interaction                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S15              | `Forgot password: mobile`: mobile/email + Send code + Use recovery code. `Forgot password: recovery code`: identifier/code + Continue; invalid/used/unknown share an enumeration-safe error.                                                                                                               |
| S38              | `password reset`, heading «تحقّق لإعادة تعيين كلمة المرور»; correct code → S16 → S14 `password changed`; next sign-in retains enrolled MFA. Existing wrong/expired/locked/delivery/retry/help states remain.; later T014 increment, off at launch until company registration, sender approval and A14-A16    |
| S39              | `recovery codes`: 8 LTR-isolated samples, shown once, Copy/Download, required saved-safely checkbox; Continue → S04. Existing account-created/phone-added/changed states remain; signed-in stays Phase 2 off.; later T014 increment, off at launch until company registration, sender approval and A14-A16 |
| S28              | Persistent `add email prompt` for accounts without email; verified-mobile settings retain fresh independent proof and only-identifier/recovery protections.                                                                                                                                                |
| Account recovery | Verified mobile/email status and codes remaining; «إنشاء رموز جديدة», «إضافة بريد إلكتروني»; regenerate with fresh proof, invalidate old set and show new set once.                                                                                                                                        |
| S36 SMS help     | Lost number + no codes + no email means no self-service recovery; support never resets on claims alone.                                                                                                                                                                                                    |

Taqnyat primary, Unifonic fallback, sender `MasterCV`, simulator only until A15. UI never names the SMS provider. Simulator is prototype-only; expiry/resend and OTP-01..OTP-12 limits belong to [Security](../technical/security.md#mobile-authentication-proposed-disabled-until-a14-a16). Signup/settings verification alone never grants login/reset authority. Reset is purpose-bound; notices go to all verified contacts and all other sessions are revoked. Numbers not verified for 12 months (proposed) need re-verification with account proof; changed/removed numbers cannot reset. SMS-only sign-in stays Phase 2 off.

## 10. Content and trust rules

Use factual, task-specific headings: “Compare with this job,” “Review this wording,” “Confirm imported information.” Avoid “AI magic,” invented social proof, “guaranteed ATS pass,” or a single hiring probability. Do not add a fabricated testimonial, customer count, certification badge or business partnership to fill space.

The sample CV uses `example.com`, explicitly sample employers/university and example phone values. Sample metrics are marked illustrative. Do not market the sample's contents as an actual person or customer outcome. Accepting a suggestion proves user review, not verification of employment.

All privacy and processor wording must match the approved production data map. Do not display “100% Saudi processing,” “ZDR guaranteed,” “PDPL compliant” or “never used for training” solely because the app runs in Riyadh. The production AI route and contracts remain open in [security](../technical/security.md). The state `S11 · Review: assistant not enabled` shows the fail-closed behavior while the route is not approved; copy on S04, S11, S19 and S29 says what is sent to the processing provider without absolute claims.

### Bilingual copy deck contract (proposed)

The published [copy-deck.json](copy-deck.json) is the single source of Arabic and English interface copy; its entries follow this contract and remain pending owner review. Arabic is authoritative for product meaning. English is a complete counterpart pending owner review; English source/fallback in Lingui does not override Arabic meaning. Neither language is approved by this contract alone.

- Root fields: `schemaVersion` and `entries`. Each entry has a unique stable semantic `key`: `<area>.<surface>.<element>[.<variant>]`, 3-5 dot-separated camelCase segments and at most 48 characters (for example `auth.otp.error.incorrect` or `billing.usage.startSummary`). Areas follow features; `common.*` is reserved for the same meaning reused across at least 3 surfaces. Element names describe UI roles rather than transcribing the English sentence. Retain `legacyKey` only while an external Planning reference still uses it.
- `messages` contains nonempty `ar-SA` and `en-US` text. `interpolations` declares each placeholder's name, type, format and isolation/security constraints. `variants` records ICU plural/select arguments and branches; use full contextual messages instead of concatenated fragments. Arabic counts cover zero/one/two/few/many/other with 0/1/2/3/11/100/fraction fixtures. Prefer neutral professional Arabic; never infer gender from names. Explicit reviewed select variants may be used when the context supplies them.
- `lingui` maps each semantic key to the extracted English `msgid`, optional `msgctxt` and compiled runtime identity, with matching placeholder names/types. A deck key is metadata, not automatically the runtime ID. Preserve existing extraction/PO compilation under `apps/web/lingui.config.ts`, `apps/web/locales/en-US.po`, `apps/web/locales/ar-SA.po` and `crowdin.yml`; verify the mapping against actual extraction. Do not introduce a second runtime catalog or silently replace English source/fallback. For Latin digits in ICU plurals, keep catalog/root locale `ar-SA` and set Lingui formatting `locales` to `ar-SA-u-nu-latn`; the deck records the verified mapping.
- `review` records locale-specific review status, owner and version. Until actual review, mark English pending owner review and Arabic pending where unreviewed; do not imply that supplying a string approves its meaning or legal/processing claim.

Coverage includes every shipped screen/state/dialog and nonvisual message: labels, hints, examples/placeholders, validation and service errors, empty/loading/success states, toasts, gated/unavailable explanations, metadata, accessible names and outbound email/SMS resources. For each enabled message purpose include subject/body or SMS text, locale versions, typed fields and purpose/domain constraints in the same inventory; template bodies remain in the existing template pipeline with explicit deck-to-template identities. No duplicate copy artifact is required.

Completion requires a coverage check against all supported surfaces and their supported state matrix, unique keys, AR/EN parity, interpolation/ICU validity and verified Lingui mappings. There must be no missing active-locale product copy, placeholder keys or raw provider/framework errors, even when English fallback would hide an omission. Exercise the existing `zu-ZA` pseudolocale for expansion/missing strings and the [AR/EN acceptance matrix](../business/requirements.md#aren-core-journey-acceptance-matrix-proposed). S39 has no dedicated EN frame; complete English copy and the same supported states on both viewports remain required.

### Transactional copy and validation (proposed)

Snapshot the UI locale on the initiating email/SMS request; a resend for the same challenge retains it, with `ar-SA` fallback when none exists. Email HTML sets matching `lang`/`dir`, plain text retains logical text and action links open the corresponding UI locale. SMS codes use Latin digits and purpose-specific provider-tested AR/EN bodies only after A15. APIs expose stable error codes; web forms map them to reviewed localized field/form messages while retaining input and accessible error associations. Never display raw provider, framework or validation-library text. [Security](../technical/security.md#sms-provider-independent-approval-gate) owns template/supplier activation constraints.

### Public pages and localized metadata (proposed)

Retain the existing `?locale=ar-SA` / `?locale=en-US` scheme for launch using the inherited locale URL/head helpers, not another router. Equivalent public landing/help/legal pages need reviewed AR/EN titles, descriptions and content, self-consistent canonical URLs, reciprocal `hreflang=ar-SA/en-US`, Arabic `x-default` and the same URLs in the sitemap. Advertise only shipped locales and preserve locale while switching equivalent pages. Authenticated CV/editor/account routes are not public indexable alternatives. Any future path migration needs its own redirect/canonical contract. See [architecture](../technical/architecture.md#locale-and-bilingual-integration-proposed); D09/D16 legal drafts remain unapproved.

### Illustrative commercial data — not a production offer

**OWNER DECIDED 2026-11-04 (D05/D18):** The [usage contract](../business/requirements.md#usage-contract) defines base-CV slots, included versions/copies, AI periods and downgrade access. Start includes 1 base CV, 1 English/other-language version, 1 tailored copy and 5 once-only operations without replenishment. Focus is the **49 SAR/month launch hypothesis**, 10 base CVs and 100 AI operations each billing month without rollover, cancel anytime, without a trial-to-auto-renew trap. Server-enforce CV count and server-side AI operations; PDF export is never paywalled. The price remains subject to Moyasar written quote/merchant activation and A09. This section is the single design-fixture home: sample Focus usage 4/10 CVs and 32/100 operations; illustrative checkout 49.00 = 42.61 + 6.39 at illustrative 15% tax (not a tax determination). Upload fixtures 10 MB/6 pages remain subject to ingestion tests. Do not turn fixtures into billing config or approved service evidence.

**Provider selection is not a fixture:** implement the user-selected Moyasar gateway through [architecture → Payments](../technical/architecture.md#payments), subject to merchant/method activation. The generic payment-provider screens describe interaction intent, not authority to choose another gateway or build a card vault. Interface copy says "a Saudi payment gateway" rather than naming the provider until merchant activation and permission to use its name are confirmed.

Implement the billing UI against versioned server-owned plan/entitlement data. Failed work, retries, renewals and cancellations must follow the approved policy, not the sample prototype's state assignments. Show the real total, tax, interval, renewal and cancellation terms before a real charge.

### Saudi riyal symbol

Use the reusable native vector at [Currency/SAR](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=6-40) (with the [Amount](https://www.figma.com/design/K3UTevGCFBhsoSLXH7BDni?node-id=6-61) group), not a dollar sign, a guessed glyph, or a font-dependent substitute. Preserve its proportions and do not mirror it in RTL. Follow the current price-row composition; keep the symbol and amount as an isolated currency group, and supply an accessible currency label such as “Saudi riyals.” Export/reuse the approved symbol asset during implementation. No symbol asset or font binary is bundled by this documentation synchronization.

For the later T014 increment, off at launch, use the [OTP contract](specs/otp-spec.md) for Phase 1 verified-mobile SMS reset and recovery codes as well as signup/settings verification and password login. Retained SMS-only sign-in is Phase 2 off. Distinguish verification/reset purposes; neither code alone signs in. Masked numbers/codes are fixtures; no delivery/identity/compliance claims. Auth numbers are not CV contacts.

## 11. Motion, accessibility and input behavior

Retain short purposeful motion (120ms quick, 200ms standard, 320ms emphasized). Do not animate document reflow or make the editor feel like a marketing demo. Respect `prefers-reduced-motion`; transitions should disappear or become near-instant. Progress can communicate state without indefinite decorative movement.

Target WCAG 2.2 AA in the implemented product. Normal active text targets 4.5:1; large text and necessary component graphics have their applicable lower thresholds. Our 44/48px touch recommendation is a design choice exceeding the 24px AA target-size baseline in many cases, not a claim that WCAG AA universally mandates 44px.

Keyboard navigation, visible focus, correct labels, landmarks, sensible reading order, focus trapping/return, no keyboard traps, no color-only status, accessible authentication and alternatives to drag-only sorting remain required. Screen-reader testing, 200% zoom/reflow, physical touch devices and browser diversity are not certified by the local layout checks.

Do not block paste, auto-complete or password-manager workflows. Reflect invalid inputs after meaningful user interaction. Errors should tell the user how to recover while retaining what they entered. A fixed mobile bar must leave enough bottom padding that the last form action can scroll clear.

OTP uses one semantic field with autocomplete one-time-code and inputmode numeric; manual entry/paste always works. WebOTP is progressive enhancement on supported HTTPS Android Chrome, and iOS uses its supported SMS autofill. Explicit Verify remains available; autofill never directly confirms deletion. Respect dialog focus/return, error-summary focus, polite meaningful status changes, reduced motion, zoom and keyboard clearance. Test the final domain-bound SMS template on real consented devices only after A15.

**Proposed constrained-text and speech acceptance:** controls, helper text and validation wrap without ellipsis; document-list titles alone may ellipsize when an accessible route exposes the full name. Preserve diacritics and the specified line heights. Set `lang` on different-language CV previews/passages and localize accessible names. Verify actual Arabic/English speech, focus preservation after switching and deterministic long/mixed-text captures after fonts settle, following the AR/EN acceptance matrix.

## 12. Design-to-code implementation map

| Existing location                                  | Work implied by this proposal                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/styles/globals.css`               | Preserve semantic role names; apply approved palette overrides, script font stacks and responsive rules; do not reintroduce removed legacy token names |
| `packages/ui/src/components`                       | Reuse buttons, inputs, tabs, dialogs/sheets, alerts, tooltips and icon wrappers; test new long/Arabic labels                                           |
| `apps/web/src/features/resume`                     | Adapt the current editing/review surfaces; keep the actual data, undo and save services                                                                |
| `apps/web/src/routes` and relevant feature folders | New onboarding, evidence, usage, payment and privacy pages using existing routing conventions                                                          |
| Document packages                                  | Keep document font and language choices separate; resolve actual Arabic importer/renderer defects before availability promises                         |
| Server/service modules                             | Enforce entitlements, ownership, approved AI route and true job/payment/save states; never trust visual gating                                         |

Do not copy the static prototype into the repository as a second application or replace the entire frontend with its vanilla JavaScript. It is a reference for composition and state behavior. Implement these changes in the maintained React fork using actual services and reusable components.

Variable collections in v1: **Primitives**, **Color** (Light/Dark, aliases to primitives), **Spacing**, **Radius** and **Type** (Arabic/English font family and weight). Code syntax maps to `var(--token-name)`. There are no prototype-state variables; prototype outcomes use labelled simulator popups instead. Recheck the selected source paths in the actual repository before implementing; the paths above are inherited integration guidance, not a new checkout inspection.

Phase 1 uses existing web/auth/Hono integration, including verified-mobile SMS reset and recovery codes through the same purpose-bound coordinator. SMS-only sign-in stays server-disabled Phase 2. Simulator is prototype-only; no production simulator endpoint, secret or fixed-code bypass.

## 13. Deliverables and verification boundary

Current working references are this document, [figma-handoff.md](figma-handoff.md), [figma-map.json](figma-map.json) and the saved native Figma file. The earlier HTML preview, generator and old screenshots are superseded for visual implementation; do not regenerate the native file from those assets.

See [saved-design verification and limits](figma-handoff.md#verification-status-2026-11-04). Actual application checks and release gates remain open.

## 14. Acceptance before implementation and release

For each implementation task, record requirement IDs and the exact Arabic/English desktop/mobile frame references; fetch current design context and a render, inspect the existing React components, and implement the real stateful behavior rather than copying the mock's fake operations. Compare the actual browser output with the target and test relevant failure/recovery paths. The detailed procedure is in [the handoff](figma-handoff.md).

Native design availability is not a release gate pass. Before production, meet A01-A16 as relevant (A14-A16 govern proposed mobile authentication and approve neither a supplier nor Phase 2), including Arabic PDF text extraction, unavailable Word until reconsidered A05, truthful AI, persistence, isolation, payment reconciliation and approved data processing. Confirm owner approval of the launch offer and brand. Do not publish mock testimonials, fabricated performance claims or illustrative privacy/legal copy as operational fact.

Check A14-A16 evidence for password-bearing optional-email creation, verification, password login/MFA, settings, verified-mobile SMS reset and recovery codes. Test exact S15/S38/S16/S14 recovery, S39 save acknowledgment, S28 prompt/methods, S36 honest help, stale/changed/removed-number denial, all-contact notices and other-session revocation. SMS-only sign-in remains Phase 2 off. Design cannot prove delivery, persistence, session/reset correctness or authorization.

## 15. Sources

Pinned implementation references and standards follow; links do not establish current application acceptance.

- **DS01** Reactive Resume v6.0.4: [Desk & Paper design guide](https://github.com/reactive-resume/reactive-resume/blob/14fb49b7149f6f13bdb1fff3659feec5200bf4df/apps/web/DESIGN.md). Pinned source read through GitHub.
- **DS02** Reactive Resume v6.0.4: [semantic CSS and fonts](https://github.com/reactive-resume/reactive-resume/blob/14fb49b7149f6f13bdb1fff3659feec5200bf4df/packages/ui/src/styles/globals.css).
- **DS07** W3C: [Inline markup and bidirectional text](https://www.w3.org/International/articles/inline-bidi-markup/).
- **DS08** W3C: [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **DS09** W3C: [WCAG target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- **DS10** Noto: [Arabic font project](https://notofonts.github.io/arabic/). Font binaries are not included in this handoff.
- **DS12** Client requirements: see [product scope](../business/product.md#product-scope) and [candidate requirements](../business/requirements.md#candidate-requirements). Arabic/English and reviewed output are inherited requirements, not additions made solely for visual styling.

### Incremental foundation delivery (D34, 2026-11-08)

T002 delivers the shared theme/language foundation and its integrated copy bindings. Each existing feature task
owns its complete screen wording and recovery states. `copy:check:bindings` verifies delivered semantic identities,
AR/EN text and source origins; it is not full-app coverage or owner copy approval. `copy:check` remains the full
release audit and continues reporting inherited gaps. The complete bilingual, accessibility and exposure release
contracts above remain unchanged. See [D34](../decisions.md#d34--t002-foundation-delivery-boundary--2026-11-08).
