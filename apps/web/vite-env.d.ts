declare const __APP_VERSION__: string;

declare module "*.css";
declare module "*?url" {
	const url: string;
	export default url;
}
declare module "@fontsource/*" {}
declare module "@fontsource-variable/*" {}

declare module "*.po" {
	export const messages: import("@lingui/core").Messages;
}
