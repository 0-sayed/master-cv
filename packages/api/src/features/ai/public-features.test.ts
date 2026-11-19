import { expect, it } from "vite-plus/test";
import { publicReviewFeatures } from "./public-features";
import configuration from "./writer-config.json";

it("derives public membership from writer configuration with an explicit internal allow-list", () => {
	const internalTasks: string[] = [];
	expect(publicReviewFeatures).toEqual(Object.keys(configuration).filter((kind) => !internalTasks.includes(kind)));
	expect(publicReviewFeatures).toHaveLength(9);
});
