import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { ProfileSectionsSkeleton } from "./skeleton-content";

afterEach(cleanup);

it("loads career sections as compact empty cards, including the certification hint", () => {
	const { container } = render(
		<ProfileSectionsSkeleton
			emptyLabel="No information added yet"
			noticeLabel="No certificates added yet."
			noticeHint="Professional certificates and accredited courses, if applicable."
		/>,
	);
	const cards = [...container.querySelectorAll('[data-slot="section-card"]')];
	expect(cards).toHaveLength(5);
	expect(cards.map((card) => card.querySelectorAll('[data-slot="section-card-empty"] > p').length)).toEqual([
		1, 1, 1, 1, 2,
	]);
	expect(container.querySelector("[data-capacity]")).toBeNull();
	expect(cards[4]).toHaveTextContent("Professional certificates and accredited courses, if applicable.");
});
