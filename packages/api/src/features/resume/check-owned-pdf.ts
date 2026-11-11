import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import z from "zod";
import { analyzePdfResume } from "@reactive-resume/resume/ats-pdf";
import { extractPdf } from "./pdf-analysis";
import { resumeService } from "./service";
export const ownedPdfCheckInput = z.object({
	resumeId: z.string().min(1),
	expectedUpdatedAt: z.coerce.date(),
	file: z.file().max(25_000_000),
	artifact: z.object({
		bytesHash: z.string().regex(/^[a-f0-9]{64}$/),
		inputHash: z.string().regex(/^[a-f0-9]{64}$/),
		editGeneration: z.number().int().nonnegative(),
		versions: z.object({
			renderer: z.string().min(1).max(200),
			template: z.string().min(1).max(200),
			fonts: z.string().min(1).max(200),
			locale: z.string().min(1).max(32),
		}),
	}),
});
/** The owner always comes from authenticated context. A private report is computed afresh for these bytes. */
export async function checkOwnedPdf(ownerId: string, input: z.infer<typeof ownedPdfCheckInput>, signal?: AbortSignal) {
	const assertCurrent = async () => {
		signal?.throwIfAborted();
		const current = await resumeService.getById({ id: input.resumeId, userId: ownerId });
		if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
			throw new ORPCError("CONFLICT", { message: "The document changed. Check its current revision." });
	};
	await assertCurrent();
	if (input.file.size > 25_000_000)
		throw new ORPCError("BAD_REQUEST", { message: "Provide a PDF no larger than 25 MB." });
	const bytesHash = createHash("sha256")
		.update(Buffer.from(await input.file.arrayBuffer()))
		.digest("hex");
	if (bytesHash !== input.artifact.bytesHash)
		throw new ORPCError("BAD_REQUEST", { message: "PDF artifact hash mismatch." });
	const raw = await extractPdf(input.file, signal);
	await assertCurrent();
	return {
		...analyzePdfResume(raw),
		source: {
			ownerId,
			resumeId: input.resumeId,
			baseRevision: input.expectedUpdatedAt.toISOString(),
			contentHash: input.artifact.inputHash,
			editGeneration: input.artifact.editGeneration,
			bytesHash,
			versions: input.artifact.versions,
		},
	};
}
