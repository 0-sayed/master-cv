import type { PersonalTool, PersonalToolsAvailability } from "@reactive-resume/schema/personal-tools";
import { useRouteContext } from "@tanstack/react-router";

export function isPersonalToolAvailable(
	availability: PersonalToolsAvailability | undefined,
	tool: PersonalTool,
): boolean {
	return availability?.[tool] === true;
}

export function usePersonalToolAvailable(tool: PersonalTool): boolean {
	const { flags } = useRouteContext({ from: "__root__" });
	return isPersonalToolAvailable(flags?.personalToolsAvailability, tool);
}
