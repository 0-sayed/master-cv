import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { productBrand } from "@reactive-resume/utils/brand";

async function generateOpenApiDocumentation(
	target = fileURLToPath(new URL("../../../../docs/spec.json", import.meta.url)),
) {
	const packageJson = JSON.parse(await readFile(new URL("../../../../package.json", import.meta.url), "utf8")) as {
		version: string;
	};
	process.env.APP_URL ??= `https://${productBrand.primaryDomain}`;
	process.env.DATABASE_URL ??= "postgresql://localhost/reactive_resume_docs";
	process.env.AUTH_SECRET ??= "documentation-generation-isolated-process-only";
	const { generateOpenApiSpec } = await import("./generator");
	const spec = await generateOpenApiSpec({
		appUrl: `https://${productBrand.primaryDomain}`,
		version: packageJson.version,
	});
	await writeFile(target, `${JSON.stringify(spec, null, "\t")}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	await generateOpenApiDocumentation(process.argv[2]);
}
