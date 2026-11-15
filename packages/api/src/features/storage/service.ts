import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import {
	DeleteObjectCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "@reactive-resume/env/server";
import { getLocalDataDirectory } from "@reactive-resume/utils/monorepo.node";
import { BlobStorageService } from "./blob";

interface StorageWriteInput {
	key: string;
	data: Uint8Array;
	contentType: string;
	private?: boolean;
}

interface StorageReadResult {
	data: Uint8Array;
	size: number;
	etag?: string;
	lastModified?: Date;
	contentType?: string;
}

export interface StorageService {
	list(prefix: string): Promise<string[]>;
	write(input: StorageWriteInput): Promise<void>;
	read(key: string): Promise<StorageReadResult | null>;
	delete(key: string): Promise<boolean>;
	healthcheck(): Promise<StorageHealthResult>;
}

interface StorageHealthResult {
	status: "healthy" | "unhealthy";
	type: "local" | "s3" | "blob" | "r2";
	message: string;
	error?: string;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
	".webp": "image/webp",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".pdf": "application/pdf",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

const IMAGE_MIME_TYPES = ["image/gif", "image/png", "image/jpeg", "image/webp"];

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpeg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"application/pdf": "pdf",
};

// Derive the stored key's extension from the content type so the static handler serves each
// file correctly instead of mislabeling it. Images normally arrive as JPEG (sharp), but with
// FLAG_DISABLE_IMAGE_PROCESSING they keep their original type — hence all image types are
// mapped, not just JPEG. Non-image uploads (e.g. a cover-letter PDF) get their real extension.
function buildFileKey(userId: string, contentType: string): string {
	const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? "bin";
	return `uploads/${userId}/pictures/${randomUUID()}.${extension}`;
}

export function inferContentType(filename: string): string {
	const extension = extname(filename).toLowerCase();
	return CONTENT_TYPE_MAP[extension] ?? DEFAULT_CONTENT_TYPE;
}

export function isImageFile(mimeType: string): boolean {
	return IMAGE_MIME_TYPES.includes(mimeType);
}

interface ProcessedImage {
	data: Uint8Array;
	contentType: string;
}

export async function processImageForUpload(file: File): Promise<ProcessedImage> {
	const fileBuffer = await file.arrayBuffer();

	if (env.FLAG_DISABLE_IMAGE_PROCESSING) {
		return {
			data: new Uint8Array(fileBuffer),
			contentType: file.type,
		};
	}

	const processedBuffer = await sharp(fileBuffer)
		.resize(800, 800, { fit: "inside", withoutEnlargement: true })
		.jpeg({ quality: 80 })
		.toBuffer();

	return {
		data: new Uint8Array(processedBuffer),
		contentType: "image/jpeg",
	};
}

export class LocalStorageService implements StorageService {
	private rootDirectory: string;

	constructor() {
		this.rootDirectory = getLocalDataDirectory(env.LOCAL_STORAGE_PATH);
	}

	async list(prefix: string): Promise<string[]> {
		const fullPath = this.resolvePath(prefix);

		try {
			const files = await fs.readdir(fullPath, { recursive: true, withFileTypes: true });
			return files
				.filter((file) => file.isFile())
				.map((file) => join(prefix, file.parentPath.slice(fullPath.length), file.name))
				.sort();
		} catch (error: unknown) {
			// If directory doesn't exist, return empty array
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
				return [];
			}

			throw error;
		}
	}

	async write({ key, data, private: isPrivate }: StorageWriteInput): Promise<void> {
		if (isPrivate && !/^uploads\/[A-Za-z0-9_-]+\/.+/.test(key))
			throw new Error("Private writes require an owner namespace");

		const fullPath = this.resolvePath(key);

		await fs.mkdir(dirname(fullPath), { recursive: true, mode: 0o700 });
		await fs.writeFile(fullPath, data, { mode: 0o600 });
	}

	async read(key: string): Promise<StorageReadResult | null> {
		const fullPath = this.resolvePath(key);
		try {
			const [arrayBuffer, stats] = await Promise.all([fs.readFile(fullPath), fs.stat(fullPath)]);

			return {
				data: arrayBuffer,
				size: stats.size,
				etag: `"${stats.size}-${stats.mtime.getTime()}"`,
				lastModified: stats.mtime,
				contentType: inferContentType(key),
			};
		} catch (error: unknown) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
				return null;
			}

			throw error;
		}
	}

	async delete(key: string): Promise<boolean> {
		const fullPath = this.resolvePath(key);

		// Check if the path exists and whether it's a file or folder
		try {
			const stats = await fs.stat(fullPath);

			if (stats.isDirectory()) {
				// Delete the directory and its contents recursively
				await fs.rm(fullPath, { recursive: true });
				return true;
			}
			await fs.unlink(fullPath);
			return true;
		} catch (error) {
			if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
			throw error;
		}
	}

	async healthcheck(): Promise<StorageHealthResult> {
		try {
			await fs.mkdir(this.rootDirectory, { recursive: true });
			await fs.access(this.rootDirectory, fs.constants.R_OK | fs.constants.W_OK);

			return {
				type: "local",
				status: "healthy",
				message: "Local filesystem storage is accessible and has read/write permission.",
			};
		} catch (error: unknown) {
			return {
				type: "local",
				status: "unhealthy",
				message: "Local filesystem storage is not accessible or lacks sufficient permissions.",
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	private resolvePath(key: string): string {
		if (
			key.startsWith("/") ||
			key.includes("\\") ||
			key
				.split("/")
				.some((part, index, parts) => part === "." || part === ".." || (part === "" && index !== parts.length - 1))
		)
			throw new Error("Invalid storage key");
		const segments = key.split("/").filter(Boolean);
		if (segments.length === 0) throw new Error("Invalid storage key");

		return join(this.rootDirectory, ...segments);
	}
}

export class S3StorageService implements StorageService {
	private readonly bucket: string;
	private readonly client: S3Client;

	constructor() {
		if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_BUCKET) {
			throw new Error("S3 credentials are not set");
		}

		this.bucket = env.S3_BUCKET;
		this.client = new S3Client({
			region: env.S3_REGION,
			forcePathStyle: env.S3_FORCE_PATH_STYLE,
			...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
			credentials: {
				accessKeyId: env.S3_ACCESS_KEY_ID,
				secretAccessKey: env.S3_SECRET_ACCESS_KEY,
			},
		});
	}

	async list(prefix: string): Promise<string[]> {
		const keys: string[] = [];
		let cursor: string | undefined;
		do {
			const response = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					Prefix: prefix,
					...(cursor ? { ContinuationToken: cursor } : {}),
				}),
			);
			keys.push(...(response.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : [])));
			if (response.IsTruncated && (!response.NextContinuationToken || response.NextContinuationToken === cursor))
				throw new Error("Incomplete storage listing");
			cursor = response.IsTruncated ? response.NextContinuationToken : undefined;
		} while (cursor);
		return keys;
	}

	async write({ key, data, contentType }: StorageWriteInput): Promise<void> {
		// BucketOwnerEnforced rejects object ACLs. Public files use the application proxy
		// with authenticated S3 reads; private attachments retain their access checks.
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: key,
			Body: data,
			ContentType: contentType,
		});

		await this.client.send(command);
	}

	async read(key: string): Promise<StorageReadResult | null> {
		try {
			const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
			const response = await this.client.send(command);
			if (!response.Body) throw new Error("STORAGE_BODY_UNAVAILABLE");

			const arrayBuffer = await response.Body.transformToByteArray();

			return {
				data: arrayBuffer,
				size: response.ContentLength ?? 0,
				contentType: response.ContentType ?? inferContentType(key),
				...(response.ETag !== undefined ? { etag: response.ETag } : {}),
				...(response.LastModified !== undefined ? { lastModified: response.LastModified } : {}),
			};
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"name" in error &&
				["NoSuchKey", "NotFound"].includes(String(error.name))
			)
				return null;
			throw error;
		}
	}

	async delete(keyOrPrefix: string): Promise<boolean> {
		const prefix = keyOrPrefix.endsWith("/") ? keyOrPrefix : `${keyOrPrefix}/`;
		const keys = (await this.list(keyOrPrefix)).filter((key) => key === keyOrPrefix || key.startsWith(prefix));
		for (let offset = 0; offset < keys.length; offset += 16) {
			const results = await Promise.allSettled(
				keys
					.slice(offset, offset + 16)
					.map((Key) => this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key }))),
			);
			if (results.some((result) => result.status === "rejected")) throw new Error("Storage deletion incomplete");
		}
		return keys.length > 0;
	}

	async healthcheck(): Promise<StorageHealthResult> {
		try {
			const putCommand = new PutObjectCommand({ Bucket: this.bucket, Key: "healthcheck", Body: "OK" });
			await this.client.send(putCommand);

			const deleteCommand = new DeleteObjectCommand({ Bucket: this.bucket, Key: "healthcheck" });
			await this.client.send(deleteCommand);

			return {
				type: "s3",
				status: "healthy",
				message: "S3 storage is accessible and credentials are valid.",
			};
		} catch (error: unknown) {
			return {
				type: "s3",
				status: "unhealthy",
				message: "Failed to connect to S3 storage or invalid credentials.",
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}
}

let cachedService: StorageService | null = null;

/** Platforms with native storage bindings configure their adapter before handling requests. */
export function configureStorageService(service: StorageService): void {
	cachedService = service;
}

export function getStorageService(): StorageService {
	if (env.STORAGE_BACKEND === "r2" && !cachedService) throw new Error("R2 storage binding is not configured");
	cachedService ??=
		env.STORAGE_BACKEND === "blob"
			? new BlobStorageService()
			: env.STORAGE_BACKEND === "s3"
				? new S3StorageService()
				: new LocalStorageService();
	return cachedService;
}

interface UploadFileInput {
	userId: string;
	data: Uint8Array;
	contentType: string;
}

interface UploadFileResult {
	url: string;
	key: string;
}

export async function uploadFile(input: UploadFileInput): Promise<UploadFileResult> {
	const key = buildFileKey(input.userId, input.contentType);
	const storage = getStorageService();
	const { beginOwnedFileWrite, settleOwnedFileWrite, registerOwnedFile } = await import("./ownership");
	await beginOwnedFileWrite(input.userId, key);
	try {
		await storage.write({ key, data: input.data, contentType: input.contentType, private: true });
		const registered = await registerOwnedFile({
			...input,
			key,
			purpose: "picture",
			size: input.data.byteLength,
			digest: createHash("sha256").update(input.data).digest("hex"),
		});
		await settleOwnedFileWrite(input.userId, key, true);
		return { key, url: registered.url };
	} catch (error) {
		await settleOwnedFileWrite(input.userId, key, false);
		throw error;
	}
}
