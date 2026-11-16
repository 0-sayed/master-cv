import { Link } from "@tanstack/react-router";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@reactive-resume/ui/components/accordion";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

const questions = ["ats", "free", "import", "invented", "guarantee", "word", "language", "rights"] as const;

/** Free access and current limits; answers stay in the HTML so they are findable before JavaScript runs. */
export function FreeFaq() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<section id="faq" tabIndex={-1} aria-labelledby="faq-title" className="bg-bg landing-section outline-none">
			<div className="landing-container grid items-start gap-10 lg:grid-cols-[2fr_3fr] lg:gap-20">
				<SectionIntro titleId="faq-title" title={copy("landing.faq.title")} body={copy("landing.faq.subtitle")}>
					<Link
						to="/help"
						search={{ locale }}
						className={buttonVariants({ variant: "link", size: "link-touch", className: "justify-self-start" })}
					>
						<Icon name="chat" size={18} />
						{copy("public.meta.help.title")}
					</Link>
				</SectionIntro>
				<div {...reveal(1)}>
					<Accordion
						defaultValue={["ats"]}
						className="rounded-2xl border border-line bg-surface px-5 shadow-e1 sm:px-6"
					>
						{questions.map((key) => (
							<AccordionItem key={key} value={key}>
								<AccordionTrigger className="py-4">{copy(`landing.faq.${key}.question`)}</AccordionTrigger>
								<AccordionContent hiddenUntilFound className="pb-4">
									<p>{copy(`landing.faq.${key}.answer`)}</p>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
