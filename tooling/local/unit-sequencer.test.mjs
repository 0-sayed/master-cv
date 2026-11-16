import { expect, it } from "vite-plus/test";
import { assertCompletePartition } from "./ci-unit.mjs";
import UnitSequencer from "./unit-sequencer";

it("assigns each expensive recovery matrix to a separate shard without dropping other files", async () => {
	const files = [
		"fault-recovery-writer-early.test.ts",
		"fault-recovery-writer-late.test.ts",
		"fault-recovery-verifier-early.test.ts",
		"fault-recovery-verifier-late.test.ts",
		...Array.from({ length: 13 }, (_, index) => `ordinary-${index}.test.ts`),
	].map((name) => ({ moduleId: `/repo/tooling/${name}` }));
	const partitions = [];
	for (let index = 1; index <= 4; index++) {
		const sequencer = new UnitSequencer({ config: { root: "/repo/tooling", shard: { index, count: 4 } } });
		const selected = await sequencer.shard(files);
		expect(selected.filter((file) => file.moduleId.includes("/fault-recovery-"))).toHaveLength(1);
		partitions.push(selected.map((file) => file.moduleId));
	}
	expect(() =>
		assertCompletePartition(
			files.map((file) => file.moduleId),
			partitions,
		),
	).not.toThrow();
});
