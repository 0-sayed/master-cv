import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { publicProcedure } from "../../context";
import { crudRouter } from "./crud";
import { updatesRouter } from "./event-router";
import { confirmImportProcedure } from "./import-review";
import { getRootResume } from "./root";
import { sharingRouter } from "./sharing";
import { resumeStatisticsRouter } from "./statistics";
import { tagsRouter } from "./tags";
import { variantsRouter } from "./variant-router";
import { versionsRouter } from "./versions";

export const resumeRouter = {
	variants: variantsRouter,
	confirmImport: confirmImportProcedure,
	getRoot: publicProcedure.route({ tags: ["Internal"] }).handler(({ context }) =>
		isFeatureAvailable("publicSharing")
			? getRootResume({
					requestHeaders: context.reqHeaders,
					...(context.user?.id ? { currentUserId: context.user.id } : {}),
				})
			: { status: "disabled" as const },
	),
	tags: tagsRouter,
	statistics: resumeStatisticsRouter,
	updates: updatesRouter,

	list: crudRouter.list,
	getById: crudRouter.getById,
	getBySlug: sharingRouter.getBySlug,
	checkSlug: sharingRouter.checkSlug,
	create: crudRouter.create,
	import: crudRouter.import,
	update: crudRouter.update,
	patch: crudRouter.patch,
	setLocked: crudRouter.setLocked,
	setPassword: sharingRouter.setPassword,
	verifyPassword: sharingRouter.verifyPassword,
	removePassword: sharingRouter.removePassword,
	duplicate: crudRouter.duplicate,
	delete: crudRouter.delete,
	listVersions: versionsRouter.listVersions,
	getVersion: versionsRouter.getVersion,
	createVersion: versionsRouter.createVersion,
	renameVersion: versionsRouter.renameVersion,
	deleteVersion: versionsRouter.deleteVersion,
	restoreVersion: versionsRouter.restoreVersion,
};
