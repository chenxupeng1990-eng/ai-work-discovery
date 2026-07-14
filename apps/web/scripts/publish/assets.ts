import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import {
  defaultResolver,
  defaultTransportFactory,
  resolvePublicTarget,
  type HostResolver,
  type MetadataTransport,
  type MetadataTransportFactory,
} from "../inbox/fetch-metadata";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 10_000;
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;
const CONTENT_DIRECTORY = resolve("public/images/content");
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/webp": isWebp,
} as const;

type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export interface DownloadAssetOptions {
  resolver?: HostResolver;
  transportFactory?: MetadataTransportFactory;
}

export async function downloadAsset(
  sourceUrl: string,
  options: DownloadAssetOptions = {},
): Promise<string> {
  const source = parseSafeHttpsUrl(sourceUrl);
  const resolver = options.resolver ?? defaultResolver;
  const transportFactory = options.transportFactory ?? defaultTransportFactory;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let readerCancelled = false;
  let timedOut = false;
  let activeTransport: MetadataTransport | undefined;

  const cancelReader = () => {
    if (!reader || readerCancelled) return;
    readerCancelled = true;
    void reader.cancel().catch(() => undefined);
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
    cancelReader();
  }, REQUEST_TIMEOUT_MS);
  let inputTemporaryPath: string | undefined;
  let outputTemporaryPath: string | undefined;
  let inputFile: Awaited<ReturnType<typeof open>> | undefined;
  let outputFile: Awaited<ReturnType<typeof open>> | undefined;

  try {
    const visited = new Set([source.toString()]);
    let currentUrl = source;
    let redirects = 0;
    let response: Response;

    while (true) {
      const target = await resolvePublicTarget(currentUrl, resolver, controller.signal);
      activeTransport = transportFactory(target);
      response = await withAbort(activeTransport.request(currentUrl, {
        credentials: "omit",
        headers: { accept: "image/jpeg, image/png, image/webp" },
        redirect: "manual",
        referrer: "",
        signal: controller.signal,
      }), controller.signal);
      if (!REDIRECT_STATUSES.has(response.status)) break;
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Asset redirect limit of ${MAX_REDIRECTS} exceeded`);
      }

      const location = response.headers.get("location");
      if (!location) throw new Error("Asset redirect is missing Location");
      const nextUrl = parseSafeHttpsUrl(location, currentUrl);
      if (visited.has(nextUrl.toString())) throw new Error("Asset redirect loop detected");

      await response.body?.cancel().catch(() => undefined);
      await activeTransport.close();
      activeTransport = undefined;
      visited.add(nextUrl.toString());
      currentUrl = nextUrl;
      redirects += 1;
    }

    if (!response.ok) throw new Error(`Asset request failed with HTTP ${response.status}`);

    const contentType = parseContentType(response.headers.get("content-type"));
    const declaredLength = parseContentLength(response.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength > MAX_ASSET_BYTES) {
      throw new Error("Asset exceeds the 8 MB size limit");
    }
    if (!response.body) throw new Error("Asset response body is missing");

    await mkdir(CONTENT_DIRECTORY, { recursive: true });
    inputTemporaryPath = join(CONTENT_DIRECTORY, `.asset-input-${process.pid}-${randomUUID()}.tmp`);
    inputFile = await open(inputTemporaryPath, "wx");

    const signature = new Uint8Array(12);
    let signatureLength = 0;
    let totalBytes = 0;
    reader = response.body.getReader();

    while (true) {
      if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
      const { done, value } = await withAbort(reader.read(), controller.signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ASSET_BYTES) throw new Error("Asset exceeds the 8 MB size limit");

      const signatureBytes = Math.min(signature.length - signatureLength, value.byteLength);
      if (signatureBytes > 0) {
        signature.set(value.subarray(0, signatureBytes), signatureLength);
        signatureLength += signatureBytes;
      }
      await inputFile.write(value);
    }

    if (!ALLOWED_IMAGE_TYPES[contentType](signature.subarray(0, signatureLength))) {
      throw new Error(`Asset magic bytes do not match declared content-type ${contentType}`);
    }

    await inputFile.sync();
    await inputFile.close();
    inputFile = undefined;
    await activeTransport.close();
    activeTransport = undefined;

    const normalized = await normalizeImage(await readFile(inputTemporaryPath));
    if (normalized.byteLength > MAX_ASSET_BYTES) {
      throw new Error("Normalized asset exceeds the 8 MB size limit");
    }
    const digest = createHash("sha256").update(normalized).digest("hex");
    const finalPath = join(CONTENT_DIRECTORY, `${digest}.webp`);
    outputTemporaryPath = join(CONTENT_DIRECTORY, `.asset-output-${process.pid}-${randomUUID()}.tmp`);
    outputFile = await open(outputTemporaryPath, "wx");
    await outputFile.writeFile(normalized);
    await outputFile.sync();
    await outputFile.close();
    outputFile = undefined;

    try {
      await access(finalPath);
      await rm(outputTemporaryPath, { force: true });
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      try {
        await rename(outputTemporaryPath, finalPath);
      } catch (renameError) {
        try {
          await access(finalPath);
          await rm(outputTemporaryPath, { force: true });
        } catch {
          throw renameError;
        }
      }
    }
    outputTemporaryPath = undefined;
    return `/images/content/${digest}.webp`;
  } catch (error) {
    activeTransport?.destroy(error instanceof Error ? error : undefined);
    activeTransport = undefined;
    if (reader) {
      cancelReader();
      controller.abort();
    }
    if (timedOut || isAbortError(error)) {
      throw new Error("Asset download timed out after 10 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    await inputFile?.close().catch(() => undefined);
    await outputFile?.close().catch(() => undefined);
    if (inputTemporaryPath) await rm(inputTemporaryPath, { force: true }).catch(() => undefined);
    if (outputTemporaryPath) await rm(outputTemporaryPath, { force: true }).catch(() => undefined);
  }
}

async function normalizeImage(inputBytes: Buffer): Promise<Buffer> {
  const input = sharp(inputBytes, {
    animated: true,
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  });
  const metadata = await input.metadata();
  if (metadata.pages !== undefined && metadata.pages > 1) {
    throw new Error("Animated or multi-page assets are not allowed");
  }
  if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
    throw new Error("Asset decoded dimensions exceed the limit");
  }
  if (metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw new Error("Asset decoded pixel count exceeds the limit");
  }

  return sharp(inputBytes, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .webp({
      alphaQuality: 100,
      effort: 6,
      lossless: false,
      nearLossless: false,
      quality: 82,
      smartSubsample: true,
    })
    .toBuffer();
}

function parseSafeHttpsUrl(rawUrl: string, baseUrl?: URL): URL {
  let url: URL;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    throw new Error("Asset URL must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new Error("Asset URL must use HTTPS");
  if (url.username || url.password) throw new Error("Asset URL credentials are not allowed");
  url.hash = "";
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

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolvePromise(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
