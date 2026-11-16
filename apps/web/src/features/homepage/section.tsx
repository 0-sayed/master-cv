import type { ReactNode } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { reveal } from "./reveal";
import { usePublicCopy } from "@/features/public-copy";

type SectionIntroProps = {
	titleId: string;
	eyebrow?: string;
	title: string;
	body?: string;
	align?: "start" | "center";
	children?: ReactNode;
};

/** The one heading block every landing section uses: eyebrow, title, lead and optional points. */
export function SectionIntro({ titleId, eyebrow, title, body, align = "start", children }: SectionIntroProps) {
	return (
		<div
			{...reveal()}
			className={cn(
				"grid max-w-2xl content-start gap-4",
				align === "center" && "mx-auto justify-items-center text-center",
			)}
		>
			{eyebrow && <p className="type-label text-accent-text">{eyebrow}</p>}
			<h2 id={titleId} className="type-title text-balance lg:type-display">
				{title}
			</h2>
			{body && <p className="type-section font-normal text-ink-2">{body}</p>}
			{children}
		</div>
	);
}

/** A suggestion waiting for the visitor's decision, in words and color, never color alone. */
export function DecisionBadge() {
	const copy = usePublicCopy();
	return (
		<Badge variant="warn">
			<Icon name="hourglass" size={12} />
			{copy("landing.example.pending")}
		</Badge>
	);
}
