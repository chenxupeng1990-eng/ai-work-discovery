import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const CONTENT_DIRECTORY = resolve("public/images/content");

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", magic: isJpeg },
  "image/png": { extension: "png", magic: isPng },
  "image/webp": { extension: "webp", magic: isWebp },
} as const;

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export interface DownloadAssetOptions {
  fetchImpl?: typeof fetch;
}

export async function downloadAsset(
  sourceUrl: string,
  options: DownloadAssetOptions = {},
): Promise<string> {
  const source = parseSafeHttpsUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let temporaryPath: string | undefined;
  let file: Awaited<ReturnType<typeof open>> | undefined;

  try {
    const response = await (options.fetchImpl ?? fetch)(source, {
      redirect: "follow",
      signal: controller.signal,
    });
    parseSafeHttpsUrl(response.url || source.toString());
    if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}`);

    const contentType = parseContentType(response.headers.get("content-type"));
    const declaredLength = parseContentLength(response.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength > MAX_ASSET_BYTES) {
      throw new Error("Asset exceeds the 8 MB size limit");
    }
    if (!response.body) throw new Error("Asset response body is missing");

    await mkdir(CONTENT_DIRECTORY, { recursive: true });
    temporaryPath = join(CONTENT_DIRECTORY, `.asset-${process.pid}-${randomUUID()}.tmp`);
    file = await open(temporaryPath, "wx");

    const hash = createHash("sha256");
    const signature = new Uint8Array(12);
    let signatureLength = 0;
    let totalBytes = 0;
    const reader = response.body.getReader();

    while (true) {
      if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ASSET_BYTES) throw new Error("Asset exceeds the 8 MB size limit");

      const signatureBytes = Math.min(signature.length - signatureLength, value.byteLength);
      if (signatureBytes > 0) {
        signature.set(value.subarray(0, signatureBytes), signatureLength);
        signatureLength += signatureBytes;
      }
      hash.update(value);
      await file.write(value);
    }

    if (!ALLOWED_IMAGE_TYPES[contentType].magic(signature.subarray(0, signatureLength))) {
      throw new Error(`Asset magic bytes do not match declared content-type ${contentType}`);
    }

    await file.sync();
    await file.close();
    file = undefined;

    const digest = hash.digest("hex");
    const extension = ALLOWED_IMAGE_TYPES[contentType].extension;
    const finalPath = join(CONTENT_DIRECTORY, `${digest}.${extension}`);

    try {
      await access(finalPath);
      await rm(temporaryPath, { force: true });
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      try {
        await rename(temporaryPath, finalPath);
      } catch (renameError) {
        try {
          await access(finalPath);
          await rm(temporaryPath, { force: true });
        } catch {
          throw renameError;
        }
      }
    }
    temporaryPath = undefined;
    return `/images/content/${digest}.${extension}`;
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error("Asset download timed out after 10 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    await file?.close().catch(() => undefined);
    if (temporaryPath) await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function parseSafeHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Asset URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new Error("Asset URL must use HTTPS");
  if (url.username || url.password) throw new Error("Asset URL credentials are not allowed");
  return url;
}

function parseContentType(value: string | null): AllowedImageType {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!normalized || !(normalized in ALLOWED_IMAGE_TYPES)) {
    throw new Error("Asset content-type is not allowed");
  }
  return normalized as AllowedImageType;
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) throw new Error("Asset Content-Length is invalid");
  const length = Number(value);
  if (!Number.isSafeInteger(length)) throw new Error("Asset Content-Length is invalid");
  return length;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array): boolean {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
