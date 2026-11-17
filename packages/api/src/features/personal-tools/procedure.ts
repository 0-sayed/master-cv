import type { PersonalTool } from "@reactive-resume/schema/personal-tools";
import { protectedProcedure } from "../../context";
import { requirePersonalTool } from "./availability";

export const personalToolProcedure = (tool: PersonalTool) =>
	protectedProcedure.use(({ next }) => {
		requirePersonalTool(tool);
		return next();
	});
