import type {
	PersonalTool,
	PersonalToolsPolicy,
	PersonalToolsAvailability,
} from "@reactive-resume/schema/personal-tools";
import { AsyncLocalStorage } from "node:async_hooks";
import { ORPCError } from "@orpc/server";

const scope = new AsyncLocalStorage<PersonalToolsPolicy>();
export function personalToolsPolicy(
	mode: string | undefined,
	releaseApproval: string | undefined,
): PersonalToolsPolicy {
	const releaseApproved = mode === "development" || mode === "test" || mode === undefined || releaseApproval === "true";
	return {
		coverLetters: { disposition: "enabled", releaseApproved },
		applications: { disposition: "enabled", releaseApproved },
	};
}

const defaultPolicy = () =>
	personalToolsPolicy(process.env.NODE_ENV, process.env.PERSONAL_CAREER_TOOLS_RELEASE_APPROVED);

export const withPersonalToolsPolicy = <T>(policy: PersonalToolsPolicy, work: () => T): T => scope.run(policy, work);

export function getPersonalToolsAvailability(policy = scope.getStore() ?? defaultPolicy()): PersonalToolsAvailability {
	const enabled = (tool: PersonalTool) => policy[tool].disposition === "enabled" && policy[tool].releaseApproved;
	return { coverLetters: enabled("coverLetters"), applications: enabled("applications") };
}

export function requirePersonalTool(tool: PersonalTool, policy = scope.getStore() ?? defaultPolicy()): void {
	if (!getPersonalToolsAvailability(policy)[tool]) {
		throw new ORPCError("FORBIDDEN", { message: "PERSONAL_TOOL_UNAVAILABLE" });
	}
}
