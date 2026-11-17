import { Badge } from "./badge";
import { Icon } from "./icon";

/** An explicit document identity, shared by thumbnails, metadata, rows and search. */
export function DocumentTypeBadge({ type, label }: { type: "resume" | "letter"; label: string }) {
	return (
		<Badge
			data-slot="document-type"
			data-document-type={type}
			aria-label={label}
			variant={type === "resume" ? "neutral" : "info"}
		>
			<Icon name={type === "resume" ? "file-text" : "envelope-simple"} />
			{label}
		</Badge>
	);
}
