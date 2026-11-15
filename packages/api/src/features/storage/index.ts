export type { StorageService } from "./service";
export { configureStorageService, getStorageService, inferContentType } from "./service";

export { authorizeOwnedFile, registerOwnedFile, revokeOwnedFile, readOwnedPicture } from "./ownership";
