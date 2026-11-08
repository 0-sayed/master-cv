# T002 copy reconciliation

2026-11-08, `feat/t002-design-system-shell`, committed in [PR #11](https://github.com/0-sayed/master-cv/pull/11). Delivery follows the owner's agreed
[D34 scope](../Planning/context/decisions.md#d34--t002-foundation-delivery-boundary--2026-11-08):
finish the shared theme/language foundation; each existing feature task handles its screen wording.

## Delivered bindings and checks

Seventeen exact deck identities are integrated: four language-switch bindings; nine settings/theme bindings;
and Documents, Applications, Cover letters and Sign out. Shared command-palette and user-menu consumers reuse
the relevant contexts. Both runtime catalogs use the exact deck translations. Source origins were refreshed
through isolated extraction, avoiding unrelated catalog churn. Owner copy review remains pending.

`copy:check:bindings` passes with zero diagnostics. It validates the inventory's delivered semantic keys,
AR/EN text, ICU/identities and extracted source ownership. It cannot pass an empty binding scope and still rejects
missing deck/runtime messages, wrong origins, empty translations and stale contexts. It does not claim full coverage.
The validator's 32 tests include seven new RED→GREEN binding-scope cases.

The ordinary `copy:check` remains unchanged as the full-app release audit. It still fails with **3,338 diagnostics**:
3,333 source/surface mappings representing **3,087 unique runtime IDs**, plus five inconsistent deck references.
These are not 3,333 missing Arabic translations. Multiple consumers can report the same message. Inherited
translations and generic recovery text remain in use without being declared approved product copy. No enabled
surface was marked off to obtain the foundation result.

## Remaining wording by existing owner

| Surface                      | Mapping diagnostics | Existing owner/handoff                                                                      |
| ---------------------------- | ------------------: | ------------------------------------------------------------------------------------------- |
| shared-shell                 |                 202 | T009 account/navigation wording; relevant feature owners; T002 shared contract coordination |
| settings                     |                 227 | T009                                                                                        |
| auth                         |                 107 | T003/T009                                                                                   |
| public                       |                 335 | T011                                                                                        |
| builder                      |                 840 | T004                                                                                        |
| documents                    |                 147 | T003                                                                                        |
| retained-fork-exposure-audit |                1475 | A13 and owning feature tasks                                                                |

Counts overlap across surfaces. This inventory conservatively counts retained source consumers; it does not
establish approved exposure. T010 owns billing wording as that journey is implemented.

## Semantic issues to preserve at handoff

- The deck's English “Career” has Arabic “معلوماتي”, while the inherited route is a career workspace. T009 and
  the exposure review must resolve the meaning before changing the label; this task retains the current route/data.
- “Active” in AI web access and “Start” in document dates must not be mapped to subscription/plan keys by text alone.
- Five deck keys reference `dialogs:account.recovery` without reciprocal dialog-index entries:
  `account.recovery.action`, `account.recovery.addPasskey`, `account.recovery.addEmailPassword`,
  `account.recovery.setupAuthenticator`, `account.navigation.settingsReturn`. T009 owns recovery reconciliation.
  These are metadata issues, not five absent translations; no frame binding was invented.

Full bilingual release acceptance and D11/A07/A13 qualification remain open. This scoped delivery decision creates
no extra task, approves no copy or feature exposure, and does not change task-graph status before merge.
