type Shell = "public" | "auth" | "welcome" | "app" | "resume-editor" | "letter-editor" | "templates" | "public-resume";

function shell(path: string): Shell {
	if (/^\/dashboard\/welcome\/?$/u.test(path)) return "welcome";
	if (/^\/dashboard(?:\/|$)/u.test(path)) return "app";
	if (/^\/builder\/letter(?:\/|$)/u.test(path)) return "letter-editor";
	if (/^\/builder(?:\/|$)/u.test(path)) return "resume-editor";
	if (/^\/auth(?:\/|$)/u.test(path)) return "auth";
	if (/^\/templates(?:\/|$)/u.test(path)) return "templates";
	if (/^\/[^/]+\/[^/]+\/?$/u.test(path)) return "public-resume";
	return "public";
}

/** Shells swap immediately. Only a same-shell destination body may fade in, without spatial motion. */
export function pageTransitionTypes(from: string | undefined, to: string, reducedMotion = false): string[] | false {
	if (!from || from === to || reducedMotion || shell(from) !== shell(to)) return false;
	return ["page"];
}
