import { describe, expect, it } from "vite-plus/test";
import { createLocaleSwitchQueue } from "./switch-queue";

describe("serialized locale switches", () => {
	it("applies one operation at a time and keeps the latest queued intent", async () => {
		let release = () => {};
		const first = new Promise<void>((resolve) => {
			release = resolve;
		});
		const applied: string[] = [];
		let active = 0;
		let maxActive = 0;
		const queue = createLocaleSwitchQueue(async (locale) => {
			active++;
			maxActive = Math.max(maxActive, active);
			if (applied.length === 0) await first;
			applied.push(locale);
			active--;
		});
		const one = queue("en-US");
		const two = queue("ar-SA");
		const three = queue("en-US");
		release();
		await Promise.all([one, two, three]);
		expect(maxActive).toBe(1);
		expect(applied).toEqual(["en-US", "en-US"]);
	});
	it("reports failure and still processes a newer queued intent", async () => {
		const applied: string[] = [];
		const queue = createLocaleSwitchQueue(async (locale) => {
			if (locale === "en-US") throw new Error("Catalog unavailable");
			applied.push(locale);
		});
		const failed = queue("en-US");
		const success = queue("ar-SA");
		await expect(failed).rejects.toThrow("Catalog unavailable");
		await success;
		expect(applied).toEqual(["ar-SA"]);
	});
});
