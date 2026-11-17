import { useLingui } from "@lingui/react/macro";
import { DocumentTypeBadge } from "@reactive-resume/ui/components/document-type-badge";

export function DocumentType({ type }: { type: "resume" | "letter" }) {
	const { t } = useLingui();
	return (
		<DocumentTypeBadge
			type={type}
			label={
				type === "resume"
					? t({ message: "CV", context: "document.type" })
					: t({ message: "Cover letter", context: "document.type" })
			}
		/>
	);
}
