import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@reactive-resume/ui/components/popover";
import { useCareerCopy } from "../copy.generated";

export function CareerApprovalPromise() {
	const copy = useCareerCopy();
	const [open, setOpen] = useState(false);
	const promise = copy("editor.career.approvalNote");
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				openOnHover
				render={
					<Button
						variant="ghost"
						size="icon"
						aria-label={promise}
						onFocus={(event) => {
							if (event.currentTarget.matches(":focus-visible")) setOpen(true);
						}}
					/>
				}
			>
				<Icon name="shield-check" />
			</PopoverTrigger>
			<PopoverContent>{promise}</PopoverContent>
		</Popover>
	);
}
