# Independent native input fixtures

These are synthetic, independently authored HTML CVs printed to PDF by Google Chrome 150.0.7871.128 on Linux x64. They are not produced by Forme or recovered from its output. Gold facts are separately written in `native-import.test.ts`; they remain unreviewed drafts.

The source HTML, PDF bytes and test evidence are kept separately. Print with the system Chrome headless PDF printer, A4 CSS, no browser headers/footers, a fresh temporary user-data directory, and the installed Noto Sans Arabic / Noto Sans fonts (`fonts-noto-core` 20201225-1build1). Use only these synthetic files. SHA-256 values are recorded by each test in ignored native evidence JSON.

This fixture printer's Arabic presentation forms and split glyph spans reproduce real importer and checker defects. An earlier LibreOffice HTML print attempt omitted facts and was rejected; its output is not used as gold. These three passing cases do not qualify arbitrary uploaded PDFs, scans, encrypted files, columns or DOCX import.
