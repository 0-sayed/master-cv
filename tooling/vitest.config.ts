import { fileURLToPath } from "node:url";
// @boundaries-ignore root shared Vitest config
import { createVitestProjectConfig } from "../vitest.shared.mts";
import UnitSequencer from "./local/unit-sequencer";

const config = createVitestProjectConfig({
	name: "@reactive-resume/tooling",
	dirname: fileURLToPath(new URL(".", import.meta.url)),
});

export default {
	...config,
	test: {
		...config.test,
		include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
		testTimeout: 30_000,
		sequence: { sequencer: UnitSequencer },
	},
	oxc: { jsx: { runtime: "automatic" as const } },
};
