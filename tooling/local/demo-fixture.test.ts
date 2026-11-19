import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { demoApplicationNotes } from "./demo-career";
import { demoAccountName, demoCredentials, demoFixture } from "./demo-fixture";

it("defines a consistent invented bilingual professional and complete local workspace", () => {
	expect(demoCredentials.email).toBe("demo@sirawise.test");
	expect(demoCredentials.username).toBe("sirawise-demo-local");
	expect(demoFixture.resumes).toHaveLength(3);
	for (const resume of demoFixture.resumes) {
		expect(resume.sections.experience.items).toHaveLength(8);
		expect(resume.sections.education.items).toHaveLength(3);
		expect(resume.sections.skills.items).toHaveLength(18);
		expect(resume.sections.languages.items).toHaveLength(2);
		expect(resume.sections.certifications.items).toHaveLength(6);
		expect(resume.basics.email).toMatch(/\.test$/);
		expect(resume.sections.experience.items.map((item) => item.dates)).toEqual(
			demoFixture.resumes[0]?.sections.experience.items.map((item) => item.dates),
		);
	}
	expect(demoFixture.resumes.map((resume) => resume.metadata.page.locale)).toEqual(["ar-SA", "en-US", "en-US"]);
	expect(demoFixture.facts).toHaveLength(16);
	expect(demoFixture.stories).toHaveLength(8);
	expect(demoFixture.letters).toHaveLength(8);
	expect(demoFixture.applications).toHaveLength(20);
	expect(demoFixture.jobs).toHaveLength(8);
	expect(demoFixture.masterFacts.length).toBeGreaterThan(30);
	for (const letter of demoFixture.letters) expect(letter.content.length).toBeGreaterThan(250);
});

it("keeps manually authored fact sources distinct", () => {
	expect(
		new Set(demoFixture.facts.map((fact) => `${fact.source.kind}:${fact.source.id}:${fact.source.quote}`)).size,
	).toBe(16);
});

it("fills every section, every custom type and the profile image", () => {
	for (const resume of demoFixture.resumes) {
		expect(resume.picture.hidden).toBe(false);
		expect(resume.picture.url).toContain("demo-avatar");
		expect(resume.basics.phone).toMatch(/^\+966/);
		expect(resume.basics.customFields.length).toBeGreaterThan(0);
		for (const section of Object.values(resume.sections)) {
			expect(section.hidden).toBe(false);
			expect(section.title.length).toBeGreaterThan(0);
			expect(section.items.length).toBeGreaterThan(0);
		}
		expect(new Set(resume.customSections.map((section) => section.type)).size).toBe(14);
		expect(resume.sections.projects.items.length).toBeGreaterThanOrEqual(5);
		expect(resume.sections.awards.items.length).toBeGreaterThanOrEqual(4);
		expect(resume.sections.references.items).toHaveLength(3);
		expect(resume.sections.interests.items.length).toBeGreaterThanOrEqual(5);
		for (const item of resume.sections.experience.items) {
			expect((item.description.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(5);
			expect(item.roles.length).toBeGreaterThan(0);
		}
	}
});

it("covers all stages and the approved closure distribution", () => {
	expect(new Set(demoFixture.applications.map((app) => app.status)).size).toBe(6);
	expect(
		new Set(demoFixture.applications.filter((app) => app.status === "closed").map((app) => app.closedReason)).size,
	).toBe(4);
	expect(demoFixture.applications.every((app) => app.salary && app.jobDescription && app.contacts?.length)).toBe(true);
	expect(demoFixture.applications.filter((app) => app.closedReason === "not-selected")).toHaveLength(3);
});

it("uses a small generated PNG rather than a remote image", () => {
	const image = readFileSync(new URL("./fixtures/demo-avatar.png", import.meta.url));
	expect(image.byteLength).toBeLessThan(150 * 1024);
	expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
});

it("stores career facts and other plain fields without HTML", () => {
	const collect = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(collect);
		if (value && typeof value === "object")
			return Object.fromEntries(
				Object.entries(value)
					.filter(([key]) => !["description", "content", "recipient"].includes(key))
					.map(([key, entry]) => [key, collect(entry)]),
			);
		return value;
	};
	const plain = [
		demoFixture.masterFacts,
		demoFixture.facts,
		demoFixture.stories,
		demoFixture.profile,
		demoFixture.jobs,
		demoFixture.applications,
		collect(demoFixture.resumes),
		collect(demoFixture.showcaseResumes),
		collect(demoFixture.letters),
		demoFixture.applications.map((_, index) => demoApplicationNotes(index)),
	];
	expect(JSON.stringify(plain).match(/<\/?[a-z][^>]*>/i)?.[0]).toBeUndefined();
});

it("keeps synthetic labels out of user-visible content", () => {
	const visible = [
		demoAccountName,
		demoFixture.resumes,
		demoFixture.showcaseResumes,
		demoFixture.letters,
		demoFixture.applications,
		demoFixture.jobs,
		demoFixture.profile,
		demoFixture.facts,
		demoFixture.stories,
		demoFixture.applications.map((_, index) => demoApplicationNotes(index)),
	];
	expect(
		JSON.stringify(visible).match(
			/fictional|invented|synthetic|demonstration|illustrative|demo only|خيالي|خيالية|مخترع|توضيحي|للعرض المحلي|not a real|no real/iu,
		)?.[0],
	).toBeUndefined();
});
