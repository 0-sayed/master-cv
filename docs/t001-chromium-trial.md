# T001 Chromium trial — 2026-11-07

**Verdict: this Chromium path does not qualify Arabic PDF export. Fix the HTML translator gaps before expanding the experiment. Keep Reactive Resume as the application foundation and Forme as the current default; neither renderer has passed A04 for Arabic.** This trial does not justify a migration or a template rewrite.

The owner authorized the bounded experiment in `codex-handoff.md`. It addresses B-C07/B-C08 and D22/A04. No pilot, template matrix, application browser suite, deployment, real CV processing, AI call or paid service was run. A01/A04/A05 are not newly approved. No new Figma frame was implemented; visual comparison uses the existing Onyx template output, not a fresh live Figma verification.

## Experiment and evidence

- Final artifacts: `test-results/document-qualification/chromium-trial-final-2026-11-07/`. `summary.json` records all 24 PDF results, render metrics, 377 source hashes and `inputUnchanged: true`; `manifest.json` records original and trial templates. `analysis.json` contains every critical field's result for each reader, raw-character counts, embedded font hashes and PDF font inventories. `visual/` contains 28 single-page PNGs and 14 paired PNGs. The ignored `analyze.py` reproduces analysis/raster generation into an absent visual directory.
- The unchanged 12 smoke cases originally cycle Onyx, Bronzor, Gengar and Azurill. Only `metadata.template` was overridden to **Onyx for both engines**. Facts, layout assignments, gold, comparison normalization, thresholds and ATS rules were preserved. This is a matched one-template control, not a repeat of the original mixed-template smoke. The schema has **18** templates, despite the handoff saying 20.
- Readers: PDF.js **6.4.299**, `disableNormalization=true`, existing production geometry joining; checksum-verified Poppler **22.02.0-2ubuntu0.15**, default and layout modes. Layout remains diagnostic. All 72 reader attempts completed. Both required readers and the existing ATS blocker gate must pass; no case has a new ATS blocker, but Arabic extraction/association failures remain.
- Renderer: installed Playwright **1.64.1**, explicit Chromium **153.0.8010.12 / revision 1243**. Executable SHA-256 `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`, verified before launch. Playwright normally expects revision 1248, which is absent. The observed protocol compatibility is specific to this trial, not a supported production pairing. No browser download or new runtime dependency was added.
- Font inputs use the existing resolver/reader and the same eight downloaded TTF files as Forme. All HTML font-data hashes match the recorded downloads. `pdffonts` identifies embedded Noto Sans Arabic Regular/SemiBold/Bold subsets in Chromium AR01; inventories for every PDF are retained. Font readiness and inventories do not prove complete per-glyph coverage or correct Unicode mappings.
- First run: `chromium-trial-2026-11-07/`, preserved. Its in-process 50 ms RSS sampler could miss synchronous work; that memory evidence is superseded. A failing blocking-render test drove an independent-process 20 ms sampler, then the same 12 cases were repeated for both engines into the final root. All 28 final page PNGs are byte-identical to their first-run counterparts. No broader dataset was run.

## Qualification result

| Document language | Forme Onyx | Chromium Onyx |
| ----------------- | ---------: | ------------: |
| Arabic            |        0/4 |           0/4 |
| English           |        4/4 |           4/4 |
| Mixed             |        0/4 |           0/4 |
| Total             |       4/12 |          4/12 |

These are automated results against draft synthetic gold. Human acceptance remains **0**. The experiment runner passes when it completes and retains all evidence; that success is not a passing qualification gate.

Per-failure causes below use the required PDF.js and default Poppler readers. Exact missing-field, order, number and association arrays for all three reader modes are in each PDF's JSON and `analysis.json`.

| Case | Forme failure                                                                                                        | Chromium trial failure                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AR01 | PDF.js: company, role, school and second-job company/role; both readers: job/education/second-job associations       | Both: name, phone, company, role, school, second-job company/role; order and all three associations                                                                           |
| AR02 | PDF.js: company, role, school, skill; both: job/education associations                                               | Both: name, phone, company, role, school, skill; order and job/education associations                                                                                         |
| AR03 | PDF.js: company, school; both: raw Hijri/ambiguous dates, unexpected reversed numbers and job/education associations | Both: name, phone, company, role, school and complete raw Hijri string; order and job/education associations. Ambiguous Arabic date digits are correct; no unexpected numbers |
| AR04 | PDF.js: body-role occurrence and school; job/education associations                                                  | PDF.js: name; both: phone, company, body-role occurrence, school, order and job/education associations                                                                        |
| MX01 | PDF.js: company, school; both: job/education associations                                                            | Both: name, phone, company, school, order and job/education associations; English role and URL survive                                                                        |
| MX02 | PDF.js: company, school; both: job/education associations                                                            | Both: name, phone, company, school, order and job/education associations                                                                                                      |
| MX03 | PDF.js: company, school; both: job/education associations                                                            | Both: name, phone, company, school, order and job/education associations                                                                                                      |
| MX04 | PDF.js: school, second-job role; both: job/education/second-job associations                                         | PDF.js: name; both: phone, company, school, second-job role, order and all three associations                                                                                 |

All EN01–EN04 pass both required readers, including EN02's long document and EN03's `12.5%` / `3 services`. A missing exact occurrence or overlapping association interval is the existing gate's result, not proof of invisible text. The comparator was not changed to accept presentation forms, remove spaces, change case or weaken associations.

## Raw text and visual findings

**Arabic word integrity is not fixed.** Forme AR01 returns `ش ركة الأف ق` in one raw PDF.js item, RTL, transform `[10,0,0,10,536.38,659.81]`, width `55.13`. Chromium's same company region returns separate presentation glyphs, combining marks and null items: for example `ﺳ`, `ﺮ`, `ﻛ`, `ﻪ`, `ال` and `\u0000`. AR01 contains **96 nulls and 101 presentation-form characters** across raw items. The other Arabic/mixed PDFs have the same classes of issue; English has zero of either. Poppler recovers more logical letters but still extracts internally split words such as `ش ركة الأف ق`, `مهن دس برمج يات` and `ج امعة الملك سعود`. Merely joining PDF.js items or applying NFKC cannot recover the null mappings. These are observations of this binary/font/HTML path; no isolated probe has established an upstream Chromium defect.

**Arabic-Indic digits improve, but dates are not fully qualified.** Forme AR03's raw items contain `٥٤٤١ هـ - ٦٤٤١ هـ` and `٤٢٠٢/٢٠/١٠`. Chromium returns intact `١٤٤٥`, `١٤٤٦` and `٠١/٠٢/٢٠٢٤` numeric items; both required readers match the ambiguous-date gold field. The complete Hijri field still fails: PDF.js emits the presentation-form `ﻫ` in `١٤٤٥ ﻫـ - ١٤٤٦ ﻫـ`, and Poppler reconstructs different punctuation/spacing. This smoke does not independently qualify Persian date digits; its Persian/Arabic phone inputs are displayed as Latin digits by the existing application.

**The translator has a visible nested-direction defect.** In Arabic and mixed PDFs, `+966 50 123 4567` becomes `4567 123 50 966+`; Latin ranges display as `2022 – 2020`, `2013 – 2011` and `2020 – 2016`. The source tree contains an LTR outer phone link/range and nested Text primitives carrying the template's RTL text style. Independent HTML bidi scopes do not reproduce Forme's inline-run behavior. This is a translator gap; it must not be presented as evidence that Chromium inherently reverses Latin numbers. Numeric field presence alone does not validate range order, so the visual check matters.

All 14 page pairs were inspected across the two runs, with identical final rasters. Observations:

- All selected visible names, section blocks, contact rows, job rows, education and skills are present. AR04 and EN02 remain two pages with readable continuation, margins and no observed clipping. Hidden icons/pictures stay hidden. This does not test visible icons, photos or every primitive/style combination.
- English layout is close to Forme, with small baseline/spacing shifts; EN02's continuation and final education/skills placement are close. Chromium's A4 media box is about `594.95996 × 841.91998` pt versus Forme's `595.28 × 841.89` pt, showing print rounding rather than exact physical parity.
- Arabic letters look connected in the PNGs despite the broken extracted text. Phone/range ordering is visibly wrong. The ambiguous Arabic date looks correct in Chromium. A native Arabic reviewer has not accepted the typography or dates.
- MX01's website loses the extra gap before the location relative to Forme. No redesign was introduced, but the translator does not yet preserve every spacing/bidi behavior.

`fixed` is mapped to CSS fixed repetition, `wrap=false` to avoid-inside, explicit breaks to page breaks, and padding to repeating `@page` margins. Unit tests verify these mappings. Onyx smoke does not exercise repeated backgrounds/headers, explicit section breaks or multi-source-page fixed scoping. Free-form page height fails explicitly; unsupported structured styles produce warnings. None of the smoke HTML translations reports a dropped-style warning. That is not complete support for the other 17 templates.

## Render time and memory

Final run observations, milliseconds and MiB. Memory columns are sampled maxima for the complete rendering Node process and Chromium process-tree RSS, not incremental allocations attributable solely to this document.

| Case | Forme render ms | Forme Node MiB | Chromium render ms | Chromium Node MiB | Browser tree MiB |
| ---- | --------------: | -------------: | -----------------: | ----------------: | ---------------: |
| AR01 |             700 |            846 |                601 |              1216 |             1068 |
| AR02 |              46 |            886 |                522 |               979 |             1018 |
| AR03 |              49 |            886 |                505 |               963 |             1019 |
| AR04 |              92 |            897 |                523 |               984 |             1080 |
| EN01 |            2827 |            911 |                574 |               999 |             1021 |
| EN02 |              97 |            916 |                716 |              1034 |             1029 |
| EN03 |              48 |            917 |                718 |              1011 |             1092 |
| EN04 |              58 |            915 |                656 |              1018 |             1020 |
| MX01 |              41 |            923 |                526 |               975 |             1015 |
| MX02 |              50 |            913 |                543 |               994 |             1017 |
| MX03 |              36 |            921 |                539 |               958 |             1077 |
| MX04 |              39 |            916 |                542 |               980 |             1018 |

Median observed pipeline render time: Forme **49 ms**, Chromium **542 ms**. Chromium startup, executable hashing and connection cost **481 ms**, recorded separately. Render timing includes font retrieval when needed, template translation, fresh browser context/page and PDF generation; it excludes reader analysis and PNG generation. Forme ran first and paid initial font-download/cache costs (notably EN01); Chromium reused downloaded font data and one browser, with a fresh context for each document. These are single-run exploratory measurements, not controlled speed comparisons or approved latency thresholds.

An independent Node process samples `/proc` every 20 ms while the rendering process may be blocked. Each document has a baseline, sampled peak and sample count (3–141). Short peaks can be missed. Browser RSS sums double-count shared pages. Node RSS includes Vitest, loaded engines, font caches, accumulated prior cases and garbage collection; the sampling helper's own process is excluded. The measurements do not establish production per-document memory, concurrency capacity, hosting cost or a dollar quote.

## Current runtimes and server implications

Verified from current source; these paths were inspected, not exercised as an application browser suite:

- Private web preview/export: `apps/web/src/features/resume/export/pdf-document.ts`, `pdf.worker.ts`, `use-resume-export.ts` and `packages/pdf/src/browser.tsx`. Forme runs in the user's browser worker, with main-thread fallback. It returns PDF bytes, editor page maps and diagnostics.
- Existing Hono/server export: `packages/api/src/features/resume/export.ts`, `packages/api/src/features/documents/exports.ts`, `apps/server/src/http/resume-pdf.ts` and `packages/pdf/src/server.tsx`. These use server-side Forme. Public export attempts local rendering and has an authenticated/authorized server fallback where applicable.
- Mobile: `apps/mobile/src/features/share/files.ts`, `apps/mobile/src/preview/pipeline.ts` and `packages/forme-native/src/index.ts`. Native Forme runs on the device; this spike changes none of it.

Moving local web export to server Chromium would add network upload/download, queueing, browser lifecycle, rendering and capacity failure modes. It would depend on connectivity and appropriate authentication, ownership checks, rate limiting and resource isolation. Local rendering can work without a render server after its engine/fonts/assets are available; this is not evidence that the full application supports offline use.

Current saved-resume server endpoints export persisted data, while local export receives current in-memory data. A migration must preserve unsaved edits through a deliberately validated contract. Existing authenticated resume server limits are **5/minute per user/resume**; public server rendering defaults to **6/minute per trusted client/resume**. Local rendering currently avoids these server render quotas. The new experimental runner is not an endpoint and adds none of these contracts.

Current Node slim Docker runtime does not provision Chromium. Hosting it would require a pinned compatible browser/runtime and OS libraries, sandbox/process configuration, bounded concurrency/queueing, memory/CPU limits, deadlines, crash recovery and font/asset handling. Existing Vercel configuration has a 300-second function budget but no browser provisioning; compatibility is unproven. No server latency, load test or cost quote was measured. Replacing downloads alone would leave preview/page maps and mobile on Forme, requiring a separate parity decision.

## Changes and verification

- New `packages/pdf/src/html/{to-html.ts,to-html.test.tsx,render.tsx}` and separate `./html` package export. Existing `flattenStyle`, point normalization, reconciler, template tree, font resolver and icon loader are reused. Production adapters are unchanged.
- New dev-only `tooling/document-qualification/{chromium.ts,chromium-trial.qualification.ts,render-metrics.ts,render-metrics.test.ts,rss-sampler.mjs}` and isolated `tooling/vitest.chromium-trial.config.ts`. `qualify.ts` now exposes the existing byte-qualification path; its default server exporter is unchanged. `versions.json` pins Chromium; tooling declares the already-installed Playwright version as a devDependency with a lockfile importer entry.
- New execution plan and this report; the short final result is added to `cladue-handoff.md`. Prior task changes and artifacts are preserved. No staging, commit, push or PR.
- **PASS:** 11 PDF tests across translator/style/Forme conversion; 74 tooling tests across 15 files, including the external-sampling regression. The native-import test that writes into old evidence was excluded. Translator tests were written before implementation; the blocking-memory regression first failed with two samples, then passed after the independent sampler.
- **PASS:** PDF and tooling typechecks, targeted lint, focused formatting, offline frozen-lockfile installation and Turborepo boundaries (1539 files / 23 packages). Initial lint errors were corrected. The first lockfile-only offline resolution lacked cached metadata; adding only the existing locked Playwright importer let the frozen offline install pass without dependency upgrades.
- **PASS experiment completion / FAIL Arabic qualification:** final runner generated and read all 24 PDFs; each engine qualifies only EN01–EN04. Whole application, mobile and release suites were not rerun. No release result is implied by the focused checks.
- Read-only context and patch reviews were performed by Sol 6.1 medium and Terra 6.1 high. The reviewer prompted measurement/provenance improvements and reviewed sampler cleanup. Source hashes describe the executed uncommitted snapshot; subsequent lint-only local variable cleanup does not change render behavior. Reproduction still requires retaining the complete checkout and recorded toolchain, not just HEAD.

## Recommended next decision

**Fix translator gaps before pilot/matrix.** First establish correct nested inline direction for numeric contacts/ranges, then isolate the logical Unicode/font mapping problem in a minimal Chromium print using these same embedded bytes. Require the same critical-field and visual checks to pass; do not weaken gold or compensate with unsafe global text normalization. If the logical text cannot be preserved under that bounded investigation, evaluate Typst as a separately approved candidate with explicit template-rewrite cost. Do not rewrite the application or adopt server Chromium based on these results. This trial stops here.
