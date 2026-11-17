# Arabic benchmark review

The v6 package remains UNAPPROVED. It changes one entry from the approved v5 package: `judge-canary-cover-letter-en`.
The other 282 entries retain matching hashes. This repair does not grant a new approval.

Package: `/mnt/storage/master-cv-design-archive/ui-audit/personal-career-benchmark/arabic-review-v6`.
The shared verifier rubric adds honest relevance bridges and matching invented-experience counterexamples.
The changed canary claims SAP work through bridge wording. Its CV still contains no SAP experience.
The English entry remains subject to Arabic review because its complete source contains Arabic context.
No other fixture, candidate fact, holdout, writer prompt, or gold changes.

`changed-entries.json` names the changed ID and both hashes. `unchanged-approval.json` retains the 282 matching Astra approvals.
`owner-approval-template.json` grants no approval. The delegated reviewer must review the changed entry and the shared rubric.
After that review, combine the valid prior approvals with the new decision in `approved-review.json`.
The CLI requires matching hashes and both review flags for every required entry. It rejects the unapproved template.
The new seal also changes journal identity. The old paid campaign cannot resume under it.
Use the new smoke command in [the runbook](personal-career-benchmark.md).

## Review history

All stages below occurred on 2026-11-16. Package versions identify archived exports, not separate current reports.
The [verifier repair report](personal-career-benchmark-history.md#2026-11-16-verifier-calibration-repair) records intervening verifier and gate changes.

| Stage                                      | Counts                                                                                          | Changes                                                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round 1, package v2                        | 110 rejected of 283: 36 translation, 47 letter, 15 job-evidence, 12 interview entries.          | Correct document names, female titles, invitations, opening details, paraphrases, and two Arabic canaries. All 283 entries remain unapproved after repair.                                                 |
| Round 2, package v3                        | 251 approved, 32 rejected of 283. Replace 97 invitation forms and correct five mixed canaries.  | Use «يسعدني لقاؤكم». The other 256 exported entries stay unchanged, including five outside Arabic approval scope. All 283 entries require approval after export.                                           |
| Subsequent v3 approval and verifier repair | All 283 required approvals validate. All 288 review-item hashes match v3.                       | Arabic review content stays unchanged. Verifier guidance and the later owner gate amendment require new seals and campaigns.                                                                               |
| Round 4, package v4                        | Change 96 entries: 48 letters and 48 interviews. Retain 187 matching approvals.                 | Repair letter annotation instructions and interview language instructions. The export remains unapproved pending review.                                                                                   |
| Round 5, package v5, current               | Round 4 approves 203 entries and rejects 80. Repair 32 letter entries and 48 interview entries. | Replace 102 experience closings with neutral invitations of 12 words. Use structured question verdicts and a separate notes verdict. Retain 203 matching approvals. The 80 changed entries require review. |

The first two repair reports record offline controls and fake campaigns, not live quality measurements.
Each records 1,540 passing deterministic controls, including 1,135 in scope and 108 canaries.
Each fake campaign passes 54 smoke sessions, 1,944 full sessions, and 72 judge probes, with $0 actual provider spend.
Round 1 records 77 focused tests. Round 2 records 78. These are historical results, not fresh test results.
Use the runbook for current forecasts, cost limits, approval requirements, and commands.

The original reports reside outside the repository:

- [Round 1](../../master-cv-design-archive/benchmark-doc-history/personal-career-benchmark-arabic-review.md).
- [Round 2](../../master-cv-design-archive/benchmark-doc-history/personal-career-benchmark-arabic-review-v3.md).
- [Round 4](../../master-cv-design-archive/benchmark-doc-history/personal-career-benchmark-arabic-review-v4.md).
- [Round 5](../../master-cv-design-archive/benchmark-doc-history/personal-career-benchmark-arabic-review-v5.md).

## File naming audit, 2026-11-16

The branch inventory combines committed additions against `origin/main`, additions in `git status`, and untracked files.
It finds these version-suffixed files under `docs/` and `tooling/`:

- `docs/personal-career-benchmark-arabic-review-v3.md`.
- `docs/personal-career-benchmark-arabic-review-v4.md`.
- `docs/personal-career-benchmark-arabic-review-v5.md`.

All three now reside in `benchmark-doc-history/` outside the repository, alongside the original canonical report.
This file contains the current state and the single review history log.
The inventory finds no other new filenames with version, round, lane, session, or date suffixes in those folders.

The review tooling also contains `tooling/evaluations/review/guard-controls-tasks-v1.json`.
This tracked fixture predates this branch. The study loader references it, and freeze history records its identity.
It remains unchanged because renaming a sealed fixture is outside this cleanup.
Historical versioned package paths in runbooks and freeze history refer to external archives. Those references remain intact.

## Truncation repair approval

Arabic approval v6 remains valid after the verifier budget and compact-JSON changes. All 283 reviewed entries match their approved hashes.
No Arabic input, gold, prompt, glossary, or control changes. No v7 export is necessary.
The paid request hashes change, so the next smoke starts a new campaign with the existing v6 approval.
