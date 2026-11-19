import type { ComponentProps } from "react";
import { useLingui } from "@lingui/react";
import { BrandIcon as SharedBrandIcon } from "@reactive-resume/ui/components/brand-icon";

type BrandIconProps = ComponentProps<typeof SharedBrandIcon>;

export function BrandIcon(props: BrandIconProps) {
	const { i18n } = useLingui();
	return <SharedBrandIcon locale={i18n.locale} {...props} />;
}
