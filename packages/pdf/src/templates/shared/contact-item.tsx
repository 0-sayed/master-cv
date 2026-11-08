import type { IconName } from "../../forme/icons";
import type { Style } from "../../forme/style-types";
import type { CustomField } from "@reactive-resume/schema/resume/data";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { View } from "#react-pdf-renderer";
import { useRender } from "../../context";
import { resolvedPdfFlowProps } from "../../semantic/adapter";
import { useResolvedNode, useSemanticNodeKey, useSemanticNodeVisible } from "../../semantic/context";
import { semanticNodeKeys } from "../../semantic/node-keys";
import { getCustomFieldLinkUrl, getWebsiteDisplayText } from "./contact";
import { Icon, Link, Text } from "./primitives";
import { composeStyles } from "./styles";

type ContactStyle = Style | Style[];

// Upstream f2b62a232bf3: LTR values preserve the surrounding icon row.
const LTR_VALUE: Style = { direction: "ltr" };
const ltrText = (textStyle: ContactStyle | undefined) => composeStyles(textStyle, LTR_VALUE);

type WebsiteDisplay = {
	url: string;
	label?: string | undefined;
};

const useContactNodeKeys = (name: string, id?: string, primitiveNodeKey?: string) => {
	const headerNodeKey = useSemanticNodeKey();
	const contactListNodeKey = headerNodeKey ? semanticNodeKeys.contactList(headerNodeKey) : undefined;
	const contactNodeKey = contactListNodeKey ? semanticNodeKeys.contactItem(contactListNodeKey, name, id) : undefined;

	return {
		contactNodeKey,
		primitiveNodeKey: primitiveNodeKey ?? contactNodeKey,
		fieldNodeKey: contactNodeKey ? semanticNodeKeys.field(contactNodeKey, name) : undefined,
		iconNodeKey: contactNodeKey ? semanticNodeKeys.icon(contactNodeKey, "contact") : undefined,
	};
};

type WebsiteContactItemProps = {
	website: WebsiteDisplay;
	style?: ContactStyle;
	textStyle?: ContactStyle | undefined;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

type CustomFieldContactItemProps = {
	field: CustomField;
	style?: ContactStyle;
	textStyle?: ContactStyle | undefined;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const WebsiteContactItem = ({
	website,
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: WebsiteContactItemProps) => {
	const { rtl } = useRender();
	const keys = useContactNodeKeys("website", undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!website.url || !visible) return null;

	return (
		<Link data-export-no-wrap={rtl} nodeKey={keys.primitiveNodeKey} src={website.url} {...(style ? { style } : {})}>
			<Icon nodeKey={keys.iconNodeKey} name="globe" {...(iconColor ? { color: iconColor } : {})} />
			<Text data-export-no-wrap={rtl} nodeKey={keys.fieldNodeKey} style={ltrText(textStyle)}>
				{getWebsiteDisplayText(website)}
			</Text>
		</Link>
	);
};

export const CustomFieldContactItem = ({
	field,
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: CustomFieldContactItemProps) => {
	const linkUrl = getCustomFieldLinkUrl(field);
	const keys = useContactNodeKeys("custom", field.id, primitiveNodeKey);
	const resolved = useResolvedNode(keys.primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	const children = (
		<>
			<Icon nodeKey={keys.iconNodeKey} name={field.icon as IconName} {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{field.text}
			</Text>
		</>
	);
	if (!visible) return null;

	if (linkUrl) {
		return (
			<Link nodeKey={keys.primitiveNodeKey} src={linkUrl} {...(style ? { style } : {})}>
				{children}
			</Link>
		);
	}

	return (
		<View {...resolvedPdfFlowProps(resolved)} style={composeStyles(style, resolved.style)}>
			{children}
		</View>
	);
};

type EmailContactItemProps = {
	email: string;
	style?: ContactStyle;
	textStyle?: ContactStyle | undefined;
	iconColor?: string;
	/** Override icon; defaults to "envelope". ditgar uses "at". */
	iconName?: IconName;
	primitiveNodeKey?: string | undefined;
};

export const EmailContactItem = ({
	email,
	style,
	textStyle,
	iconColor,
	iconName = "envelope",
	primitiveNodeKey,
}: EmailContactItemProps) => {
	const keys = useContactNodeKeys("email", undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!email || !visible) return null;
	return (
		<Link nodeKey={keys.primitiveNodeKey} src={`mailto:${email}`} {...(style ? { style } : {})}>
			<Icon nodeKey={keys.iconNodeKey} name={iconName} {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} style={ltrText(textStyle)}>
				{email}
			</Text>
		</Link>
	);
};

type PhoneContactItemProps = {
	phone: string;
	style?: ContactStyle;
	textStyle?: ContactStyle | undefined;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const PhoneContactItem = ({ phone, style, textStyle, iconColor, primitiveNodeKey }: PhoneContactItemProps) => {
	const { rtl } = useRender();
	const keys = useContactNodeKeys("phone", undefined, primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!phone || !visible) return null;
	// Phone numbers use an LTR numeric presentation; keep the saved value untouched.
	const displayPhone = normalizeNumericDigits(phone);
	// With hidden icons the Link itself is the paragraph. LTR only on its child creates
	// an inline isolate in an RTL root: Poppler detaches the leading + from the digits.
	// Set paragraph direction too; the existing flex direction still positions the icon.
	return (
		<Link
			nodeKey={keys.primitiveNodeKey}
			src={`tel:${displayPhone}`}
			style={composeStyles(style, rtl ? LTR_VALUE : undefined)}
		>
			<Icon nodeKey={keys.iconNodeKey} name="phone" {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} style={ltrText(textStyle)}>
				{displayPhone}
			</Text>
		</Link>
	);
};

type LocationContactItemProps = {
	location: string;
	style?: ContactStyle;
	textStyle?: ContactStyle | undefined;
	iconColor?: string;
	primitiveNodeKey?: string | undefined;
};

export const LocationContactItem = ({
	location,
	style,
	textStyle,
	iconColor,
	primitiveNodeKey,
}: LocationContactItemProps) => {
	const keys = useContactNodeKeys("location", undefined, primitiveNodeKey);
	const resolved = useResolvedNode(keys.primitiveNodeKey);
	const visible = useSemanticNodeVisible(keys.primitiveNodeKey);
	if (!location || !visible) return null;
	return (
		<View {...resolvedPdfFlowProps(resolved)} style={composeStyles(style, resolved.style)}>
			<Icon nodeKey={keys.iconNodeKey} name="map-pin" {...(iconColor ? { color: iconColor } : {})} />
			<Text nodeKey={keys.fieldNodeKey} {...(textStyle ? { style: textStyle } : {})}>
				{location}
			</Text>
		</View>
	);
};
