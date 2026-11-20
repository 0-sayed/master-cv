export type { StorageService } from "./service";
export { configureStorageService, getStorageService, inferContentType } from "./service";

export { authorizeOwnedFile, deleteOwnedFile, registerOwnedFile, revokeOwnedFile, readOwnedPicture } from "./ownership";
