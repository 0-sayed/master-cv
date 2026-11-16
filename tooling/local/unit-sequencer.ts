import { BaseSequencer, type TestSpecification } from "vite-plus/test/node";

/** Spread the four expensive fault matrices before applying native file sharding to the rest. */
export default class UnitSequencer extends BaseSequencer {
	override async shard(files: TestSpecification[]) {
		const recovery = files.filter((file) =>
			/\/fault-recovery-(writer|verifier)-(early|late)\.test\.ts$/.test(file.moduleId),
		);
		const ordinary = files.filter((file) => !recovery.includes(file));
		const shard = this.ctx.config.shard;
		if (!shard) throw new Error("A shard index and count are required");
		const { index, count } = shard;
		return [
			...(await super.shard(ordinary)),
			...recovery
				.sort((a, b) => a.moduleId.localeCompare(b.moduleId, "en"))
				.filter((_, position) => position % count === index - 1),
		];
	}
}
