import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
import { ProfileSectionsSkeleton, SkeletonContent } from "./skeleton-content";

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
	expect(cards.map((card) => card.querySelectorAll('[data-slot="empty-state"]').length)).toEqual([1, 1, 1, 1, 1]);
	expect(cards.map((card) => card.querySelectorAll('[data-slot="empty-state"] > p').length)).toEqual([0, 0, 0, 0, 1]);
	expect(container.querySelector("[data-capacity]")).toBeNull();
	expect(cards[4]).toHaveTextContent("Professional certificates and accredited courses, if applicable.");
});

it.each(["documents", "document-groups"] as const)(
	"%s placeholders use compact identity instead of paper previews",
	(shape) => {
		const { container } = render(<SkeletonContent shape={shape} count={3} />);
		expect(container.querySelectorAll('[data-slot="document-skeleton"]')).toHaveLength(3);
		for (const card of container.querySelectorAll('[data-slot="document-skeleton"]')) {
			expect(card.querySelector('[data-slot="document-skeleton-identity"]')).not.toBeNull();
			expect(card.querySelector('[data-slot="document-skeleton-title"]')).not.toBeNull();
			expect(card.querySelector('[data-slot="document-skeleton-metadata"]')).not.toBeNull();
			expect(card.querySelector('[data-slot="document-skeleton-date"]')).not.toBeNull();
			expect(card.querySelector("img, canvas, .aspect-page")).toBeNull();
		}
	},
);
