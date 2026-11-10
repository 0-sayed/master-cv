# Design token gate

`node tooling/design-tokens/check.mjs` checks TypeScript/JavaScript and CSS under
`apps/web/src` and `packages/ui/src`, including new files. Root `lint`, `lint:fix`
and `lint:agent` run it before Oxlint. The checker reads files without changing
source or its allowlist. Tests live in `check.test.mjs`.

The scanner uses the installed TypeScript 7 native AST API for strings, templates,
concatenation and numeric style properties, and balanced CSS declaration/class
parsing. New arbitrary px/rem/em geometry, independent typography and raw colors
fail. Literal height, size, padding and radius overrides on imported shared
controls also fail, including import aliases and classes held in constants or
conditional expressions. Structural elements and layout widths such as `w-full`
are unaffected by the control rule. Use the control's size/variant API, shared
type roles, semantic colors and named spacing/control/layout tokens.

## Reviewing the baseline

Every allowance records an exact file, AST/property or CSS selector context,
literal, category, occurrence count and reason. Added occurrences, changed values
and stale entries fail. Wildcard file allowances are rejected.

The inherited baseline comes from `b617646fa`; specific untouched ATS and document
parser fixtures are pinned to `d34de15d4`. Shared token definitions and protected
document previews/provider colors have individual reviewed entries. These entries
preserve document data and upstream appearance; they do not exempt directories.

T002/T003 auth, document-management, settings, locale, career-information and shell
consumers were reconciled to shared roles/tokens, rather than grandfathered. Never
regenerate the allowlist from all current findings or use it to hide new consumer
literals. No automatic baseline-update command is provided.

When approved source changes remove an inherited occurrence, remove its stale entry
or reduce its count. For a necessary exception, inspect the exact occurrence and
its pinned source, record its concrete reason, and review the allowlist diff.
New approved interface geometry belongs in a shared named token; add only the
specific central token-definition allowance. Then run the checker and acceptance
tests. Preserve original document/PDF/template typography and user color data.
