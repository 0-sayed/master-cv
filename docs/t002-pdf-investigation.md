# T002 PDF download investigation

2026-11-08, Node 24.22.1, synthetic CVs only. The existing browser assertion remains unchanged.

The HTTP 500 was a development-loader defect inherited from T001, not U+10FFFF handling.
The failing run reused the Vite/tsx server on port 3000 because Playwright permits an existing healthy server.
Its captured error was `ERR_MODULE_NOT_FOUND` for `packages/pdf/src/forme/fonts.node`, imported by
`packages/pdf/src/server.tsx`. Node/tsx does not resolve that dotted extensionless path to `fonts.node.ts`.
Rendering never started. Vite's test loader and tsdown's production bundle had hidden the defect.

The regression in `apps/server/src/pdf-entry.test.ts` starts a real Node/tsx subprocess and imports the public
PDF server entry. It failed with the same error before the fix, then passed after the three ambiguous import/export
specifiers were given explicit `.ts` extensions. No renderer, warning, assertion or saved content changed.

The original unsupported-character browser case passes against the development server after the fix
(1/1, 36 seconds). A fresh built server on isolated port 3292 also passes the entire PDF browser spec
(9/9, before the import fix was needed). This separates the loader failure from the earlier unproven main-worktree
browser timeout. U+10FFFF still produces the named warning and an HTTP 200 PDF.

The first focused renderer unit run hit one transient Noto Sans Hebrew font-download failure; its result is
not recorded as a pass. The fresh focused recheck passes 16/16 renderer/font tests. Final CI results are recorded in the shipping report.
