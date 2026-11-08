import { it } from "vite-plus/test";

// Individually reviewed PNG + pdftotext -bbox evidence; manager ruling 2, 2026-11-08.
// Passing regressions always run in the blocking tooling suite.
const reportOnlyRegressions: Record<string, string> = {
	"keeps ar iso month ranges and a separate ongoing label in both readers":
		"D33(4)/D32 and manager ruling 2: MM/YYYY endpoints are correct in PNG/bbox; PDF.js splits/reorders month and year despite intact numeric glyphs.",
	"keeps ar numeric month ranges and a separate ongoing label in both readers":
		"D33(4)/D32 and manager ruling 2: MM/YYYY endpoints are correct in PNG/bbox; PDF.js splits/reorders month and year despite intact numeric glyphs.",
	"keeps dated certifications, awards, publications and volunteering beside each owner in en":
		"Manager ruling 2: 2035 shares the Archive Volunteers line in PNG/bbox; Poppler emits it after Skills.",
	"keeps en iso month ranges and a separate ongoing label in both readers":
		"Manager ruling 2: upstream spaced en-dash dates are fully present beside both roles in PNG/bbox; readers collect the date column after the role column.",
	"keeps en numeric month ranges and a separate ongoing label in both readers":
		"Manager ruling 2: upstream spaced en-dash dates are fully present beside both roles in PNG/bbox; readers collect the date column after the role column.",
	"keeps en short month ranges and a separate ongoing label in both readers":
		"Manager ruling 2: upstream spaced en-dash dates are fully present beside both roles in PNG/bbox; readers collect the date column after the role column.",
	"keeps every project date within Projects: H5-EN-10":
		"Manager ruling 2: source date is inside Projects in PNG/bbox; readers emit its right-hand column after the Skills heading.",
	"keeps every project date within Projects: H5-EN-11":
		"Manager ruling 2: source date is inside Projects in PNG/bbox; readers emit its right-hand column after the Skills heading.",
	"keeps every project date within Projects: H5-EN-14":
		"Manager ruling 2: source date is inside Projects in PNG/bbox; readers emit its right-hand column after the Skills heading.",
	"keeps mixed iso month ranges and a separate ongoing label in both readers":
		"D33(4)/D32 and manager ruling 2: MM/YYYY endpoints are correct in PNG/bbox; PDF.js splits/reorders month and year despite intact numeric glyphs.",
	"keeps mixed numeric month ranges and a separate ongoing label in both readers":
		"D33(4)/D32 and manager ruling 2: MM/YYYY endpoints are correct in PNG/bbox; PDF.js splits/reorders month and year despite intact numeric glyphs.",
	"preserves long en website on ditgar":
		"Manager ruling 2: complete URL is visible over two lines in PNG/bbox; readers insert a break or lose the hyphen at wrapping. The separate website-wrap guard stays blocking.",
	"preserves nested histories and date associations: H2-AR-01 ar onyx":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-02 ar bronzor":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-03 ar azurill":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-04 ar ditto":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-05 ar gengar":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-06 ar kakuna":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-07 ar meowth":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; Meowth also detaches the employer number. D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-AR-08 ar persian":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-EN-09 en onyx":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-EN-10 en bronzor":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-EN-11 en lapras":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-EN-12 en rhyhorn":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-EN-13 en porygon":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-EN-14 en scizor":
		"Manager ruling 2: dates are beside their source entries in PNG/bbox; reader column order interleaves the entry spans.",
	"preserves nested histories and date associations: H2-MIXED-15 mixed meowth":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; Meowth also detaches the employer number. D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-MIXED-16 mixed ditto":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-MIXED-17 mixed leafish":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-MIXED-18 mixed glalie":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-MIXED-19 mixed pikachu":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
	"preserves nested histories and date associations: H2-MIXED-20 mixed chikorita":
		"Manager ruling 2: full email is visible and adjacent in bbox, but Poppler splits its leading h from oldout; D33 removes name tashkeel; D32 permits endpoint order.",
};

export function regressionIt(name: string) {
	const reportOnly = Object.hasOwn(reportOnlyRegressions, name);
	return it.skipIf(reportOnly !== (process.env.DOCUMENT_REGRESSIONS === "1"));
}
