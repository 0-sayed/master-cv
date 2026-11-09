import z from "zod";
import { careerMasterSchema, masterFactInputSchema, masterFactSchema } from "@reactive-resume/schema/career-master";
import { protectedProcedure } from "../../context";
import { careerMasterService } from "./master";
import { workspaceService } from "./workspace";

const version = z.object({
	id: z.string().min(1),
	expectedRevision: z.number().int().positive(),
	expectedDraftRevision: z.number().int().nonnegative(),
});
const route = (method: "GET" | "POST" | "DELETE", path: `/${string}`, operationId: string) => ({
	method,
	path,
	tags: ["Career master"],
	operationId,
});
export const masterRouter = {
	read: protectedProcedure
		.route(route("GET", "/career/master", "readCareerMaster"))
		.input(z.object({}))
		.output(careerMasterSchema)
		.handler(({ context }) => careerMasterService.read(context.user.id)),
	savePending: protectedProcedure
		.route(route("POST", "/career/master/draft", "saveCareerMasterDraft"))
		.input(z.object({ fact: masterFactInputSchema, version: version.optional() }))
		.output(masterFactSchema)
		.handler(({ context, input }) =>
			careerMasterService.savePending(context.user.id, { ...input.fact, ...input.version }),
		),
	confirm: protectedProcedure
		.route(route("POST", "/career/master/confirm", "confirmCareerMaster"))
		.input(
			z.object({ facts: z.array(version).min(1).max(30), expectedProfileRevision: z.number().int().nonnegative() }),
		)
		.output(careerMasterSchema)
		.handler(({ context, input }) => careerMasterService.confirm(context.user.id, input)),
	remove: protectedProcedure
		.route(route("DELETE", "/career/master/{entityId}", "removeCareerMasterEntry"))
		.input(z.object({ entityId: z.string().min(1), expectedProfileRevision: z.number().int().nonnegative() }))
		.output(careerMasterSchema)
		.handler(({ context, input }) => careerMasterService.remove(context.user.id, input)),
	linkResumeFacts: protectedProcedure
		.route(route("POST", "/career/master/links", "linkResumeMasterFacts"))
		.input(
			z.object({
				resumeId: z.string().min(1),
				links: z.array(z.object({ factId: z.string().min(1), acceptedRevision: z.number().int().positive() })).max(500),
			}),
		)
		.output(z.void())
		.handler(({ context, input }) => careerMasterService.linkResumeFacts(context.user.id, input)),
	resumeLinkState: protectedProcedure
		.route(route("GET", "/career/master/links/{resumeId}", "readResumeMasterLinks"))
		.input(z.object({ resumeId: z.string().min(1) }))
		.output(
			z.object({
				baseResumeId: z.string(),
				variantKind: z.enum(["base", "language", "job"]),
				staleFactIds: z.array(z.string()),
			}),
		)
		.handler(({ context, input }) => careerMasterService.resumeLinkState(context.user.id, input.resumeId)),
};
export const personalWorkspaceRouter = {
	state: protectedProcedure
		.route(route("GET", "/career/personal-workspace", "readPersonalWorkspace"))
		.input(z.object({}))
		.output(z.object({ welcomeCompletedAt: z.date().nullable(), hasDocuments: z.boolean() }))
		.handler(({ context }) => workspaceService.state(context.user.id)),
	completeWelcome: protectedProcedure
		.route(route("POST", "/career/personal-workspace/welcome", "completePersonalWelcome"))
		.input(z.object({}))
		.output(z.void())
		.handler(({ context }) => workspaceService.completeWelcome(context.user.id)),
};
