# T016 — Rename the product to Sirawise

**Task:** T016 · **PR size:** L · **Branch:** `chore/t016-sirawise-rename`
**Depends on:** T008 · **Priority:** 75
**Status:** Owner-directed planning scope, 2026-11-16 (D42); no implementation or release approval is asserted.
**Scheduling:** [Task Graph](../tasks.md#task-graph) is the only completion authority; pending until first shipped.

## Goal

Replace the user-facing Master CV brand with Sirawise, exact spelling Sirawise / SIRAWISE, under D42.
Start after T008 merges. Land before T012 deployment because deployment needs the product name and domain.

## Scope (in)

- Inventory every user-facing `Master CV` and `ماستر سي في` string and its owning shared source.
- Cover the web interface, server emails, PDF/DOCX metadata and mobile app name.
- Cover `Planning/context/design/copy-deck.json`, ar-SA/en-US locales, landing and legal pages.
- Cover meta/OG tags, manifest/PWA, favicon and logo assets, accessible names and alternative text.
- Replace product branding with Sirawise through existing shared constants where they exist.
- Use the owner-approved Arabic name سيراوايز (2026-11-18).
- Preserve current icon geometry and asset bytes. New S/س artwork is deferred by owner exception (2026-11-18).
- Inventory Figma brand references and record their updates as follow-up through authorized access.
- Record each surface, source, replacement, retained exception and actual test evidence in one inventory.

## Explicit exclusions

- Keep the repository name, package names, internal identifiers and database names unchanged unless trivially safe.
- Record any trivially safe exception and its reason. Do not add structural renames or database migrations.
- Preserve upstream license notices, copyright text and attribution required by existing licenses.
- Do not rewrite historical decisions, source citations or saved user documents merely to remove an old name.
- Do not buy a domain, activate email services, deploy, charge customers or process real CVs.
- Do not enable DOCX or mobile-store delivery as part of this rename.

## Requirement IDs

**Owns:** None; D42 adds cross-surface brand consistency without transferring requirement ownership.
**Consumes / contributes:** B-O06, A04, A05, A07, A08, A13.
T011 retains B-O06 ownership. Relevant task owners retain behavior, security and release-gate ownership.
A05 still gates DOCX availability. Metadata changes do not authorize an export format.

## Figma targets

- Consume brand-bearing screens and adjacent states across the mapped application, landing and legal journeys.
- Include S01 landing and S35 privacy/terms, authentication, dashboard shells and document/export dialogs.
- Resolve desktop/mobile masters, states and dialogs through [figma-map.json](../../context/design/figma-map.json).
- Record exact current frames in implementation evidence after authorized inspection.
- Treat Figma name/logo references as follow-up. This planning change does not edit or inspect live Figma.
- Use existing shared components and T002 tokens under D35/D36. Record layout deviations with their reasons.

## Source references

- [decisions.md](../../context/decisions.md), especially D42.
- [business/requirements.md](../../context/business/requirements.md)
- [design/design-system.md](../../context/design/design-system.md)
- [design/figma-handoff.md](../../context/design/figma-handoff.md)
- [design/copy-deck.json](../../context/design/copy-deck.json)
- [T011 public experience](T011-public-experience.md)
- [T012 deployment](T012-saudi-deployment-operations.md)

## Ownership boundaries

- `apps/web/` owns web surfaces, locale catalogs and web assets.
- `apps/server/` owns affected server-facing delivery and metadata integration.
- `packages/email/src/templates/` owns transactional email presentation.
- `apps/mobile/` owns the mobile application name and affected assets.
- `Planning/context/design/copy-deck.json` supplies approved interface strings.
- Inspect existing document/export packages and shared branding sources before changing their consumers.
- Coordinate changes with their owners. These boundaries do not authorize replacing existing implementations.

## Implementation notes

- Read D42 and inventory all listed surfaces before replacement. Use exact Sirawise / SIRAWISE spelling.
- Reuse shared constants where present. Keep replacement logic in the existing owning layer.
- Keep interface language separate from saved CV language and preserve all user-authored facts and revisions.
- Limit PDF/DOCX metadata changes to product-owned branding. Preserve user titles and content.
- Keep Word unavailable until A05 passes. Test supported metadata paths without advertising gated capabilities.
- Use owner-approved domain and email sender name. T012 owns deployment and operational configuration.
- Do not infer a domain, Arabic name, artwork or sender approval from the English product-name decision.
- Preserve existing shared typography, layout, direction support and semantic variants.

## Acceptance evidence

- Record the completed surface inventory and all intentional old-name exceptions with their reasons.
- Make sure that no old product branding remains on the inventoried user-facing surfaces.
- Add or update focused tests for existing brand constants, locale coverage and affected consumers.
- Exercise server email rendering, metadata generation, manifest/PWA entries and mobile application naming.
- Test supported PDF output and metadata without enabling DOCX. Record gated DOCX paths separately.
- Inspect Arabic RTL and English LTR at desktop 1440 and mobile 390 with the correct fonts and direction.
- Inspect changed pages, dialogs, recovery states, logo alternative text and favicon assets.
- Run the applicable repository validation tiers and affected browser tests before implementation completion.
- Record actual results and blocked evidence. This planning brief claims no runtime or visual test result.

## Open approvals/blockers affecting the task

- Resolved 2026-11-18: Sirawise / SIRAWISE, سيراوايز, sirawise.io and `Sirawise <noreply@sirawise.io>`.
- Resolved 2026-11-18: retain artwork bytes and geometry, defer new S/س artwork.
- T012 retains DNS, certificates, sirawise.co redirect and sender activation.
- Authorized Figma access and follow-up remain separate from this local planning update.
- Existing data, export, mobile, billing and deployment gates remain unchanged.

## Done definition

- All inventoried user-facing surfaces use the approved Sirawise brand, with documented exceptions for preserved notices and user content.
- Owner inputs are resolved for the affected surfaces. No placeholder artwork or invented Arabic name ships.
- Focused tests and AR/EN desktop/mobile evidence pass for the changed scope.
- T016 lands after T008 merges and before T012 deployment.
- Tick the Task Graph row and update its Mermaid class when the PR is first shipped.

## Owner-added local demo, 2026-11-18

Provide a fail-closed loopback-only seed with one verified fictional account, structured master, three CVs, three letters, two applications/job targets, six facts and three stories. Use existing owner-scoped services, restricted runtime credentials and revision checks. Preserve user edits on rerun. Populate atomically, refuse identity collisions and unexpected partial content, and never use AI or deliver mail.

## Implementation evidence, 2026-11-18

The completed uncommitted implementation and retained-name inventory are in [T016 evidence](T016-sirawise-rename-evidence.md).

The owner keeps the roadmap row unchecked and the dependency pending until shipment. This overrides the execution plan bookkeeping step.

The product name is Sirawise / SIRAWISE, with سيراوايز in Arabic. The primary domain is sirawise.io. The default sender is `Sirawise <noreply@sirawise.io>`.

All locale catalogs use the approved brand. Artwork bytes and geometry remain unchanged. The local synthetic demo includes 3 CVs, 3 letters, and 2 applications. Docker-published loopback PostgreSQL is supported through the guarded restricted role. Hermes compiler evidence is skipped by owner instruction. Existing release gates remain closed where applicable.
