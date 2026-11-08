import { expect, it } from "vite-plus/test";
import { qualificationPolicy, qualificationSuite } from "./suite";

it("opens holdout-4 and isolates sealed holdout-5 without silent fallthrough", () => {
	expect(qualificationSuite({ DOCUMENT_DEV_HOLDOUT_4: "1" })).toBe("dev-holdout-4");
	expect(qualificationSuite({ DOCUMENT_HOLDOUT_5: "1" })).toBe("holdout-5");
	for (const flag of [
		"DOCUMENT_PILOT",
		"DOCUMENT_MATRIX",
		"DOCUMENT_DEV_HOLDOUT_2",
		"DOCUMENT_HOLDOUT_3",
		"DOCUMENT_DEV_HOLDOUT_3",
		"DOCUMENT_HOLDOUT_4",
		"DOCUMENT_DEV_HOLDOUT_4",
	])
		expect(() => qualificationSuite({ DOCUMENT_HOLDOUT_5: "1", [flag]: "1" })).toThrow(/one suite/i);
});

it("uses only explicitly supported policy versions", () => {
	expect(qualificationPolicy({})).toBe("strict v1");
	expect(qualificationPolicy({ DOCUMENT_QUALIFICATION_POLICY: "fact-level v2" })).toBe("fact-level v2");
	expect(() => qualificationPolicy({ DOCUMENT_QUALIFICATION_POLICY: "fact-level" })).toThrow(/policy/i);
});

it("opens holdout-3 for development and selects sealed holdout-4 explicitly", () => {
	expect(qualificationSuite({ DOCUMENT_DEV_HOLDOUT_3: "1" })).toBe("dev-holdout-3");
	expect(qualificationSuite({ DOCUMENT_HOLDOUT_4: "1" })).toBe("holdout-4");
	for (const flag of [
		"DOCUMENT_PILOT",
		"DOCUMENT_MATRIX",
		"DOCUMENT_DEV_HOLDOUT_2",
		"DOCUMENT_HOLDOUT_3",
		"DOCUMENT_DEV_HOLDOUT_3",
	])
		expect(() => qualificationSuite({ DOCUMENT_HOLDOUT_4: "1", [flag]: "1" })).toThrow(/one suite/i);
});

it("keeps dev holdout-2 and sealed holdout-3 opt-in and isolated from smoke, pilot and matrix", () => {
	expect(qualificationSuite({})).toBe("smoke");
	expect(qualificationSuite({ DOCUMENT_PILOT: "1" })).toBe("pilot");
	expect(qualificationSuite({ DOCUMENT_MATRIX: "1" })).toBe("matrix");
	expect(qualificationSuite({ DOCUMENT_DEV_HOLDOUT_2: "1" })).toBe("dev-holdout-2");
	expect(qualificationSuite({ DOCUMENT_HOLDOUT_3: "1" })).toBe("holdout-3");
	expect(() => qualificationSuite({ DOCUMENT_DEV_HOLDOUT_2: "1", DOCUMENT_HOLDOUT_3: "1" })).toThrow(/one suite/i);
	expect(() => qualificationSuite({ DOCUMENT_DEV_HOLDOUT_2: "1", DOCUMENT_PILOT: "1" })).toThrow(/one suite/i);
	expect(() => qualificationSuite({ DOCUMENT_DEV_HOLDOUT_2: "1", DOCUMENT_MATRIX: "1" })).toThrow(/one suite/i);
});

it("rejects the retired blind holdout-2 flag instead of silently running smoke", () => {
	for (const flag of [undefined, "DOCUMENT_PILOT", "DOCUMENT_MATRIX", "DOCUMENT_DEV_HOLDOUT_2", "DOCUMENT_HOLDOUT_3"])
		expect(() => qualificationSuite({ DOCUMENT_HOLDOUT_2: "1", ...(flag ? { [flag]: "1" } : {}) })).toThrow(
			/retired.*DOCUMENT_DEV_HOLDOUT_2/i,
		);
});

it("selects v2.1, opened H5 and sealed H6 explicitly and exclusively", () => {
	expect(qualificationPolicy({ DOCUMENT_QUALIFICATION_POLICY: "fact-level v2.1" })).toBe("fact-level v2.1");
	expect(qualificationSuite({ DOCUMENT_DEV_HOLDOUT_5: "1" })).toBe("dev-holdout-5");
	expect(qualificationSuite({ DOCUMENT_HOLDOUT_6: "1" })).toBe("holdout-6");
	for (const flag of [
		"DOCUMENT_PILOT",
		"DOCUMENT_MATRIX",
		"DOCUMENT_DEV_HOLDOUT_2",
		"DOCUMENT_HOLDOUT_3",
		"DOCUMENT_DEV_HOLDOUT_3",
		"DOCUMENT_HOLDOUT_4",
		"DOCUMENT_DEV_HOLDOUT_4",
		"DOCUMENT_HOLDOUT_5",
		"DOCUMENT_DEV_HOLDOUT_5",
	])
		expect(() => qualificationSuite({ DOCUMENT_HOLDOUT_6: "1", [flag]: "1" })).toThrow(/one suite/i);
});
