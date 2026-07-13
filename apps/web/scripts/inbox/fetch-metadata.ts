import { lookup } from "node:dns/promises";
import type { LookupFunction } from "node:net";
import { load, type CheerioAPI } from "cheerio";
import ipaddr from "ipaddr.js";
import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

export const MAX_METADATA_BYTES = 2 * 1024 * 1024;

const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2_048;
const REQUEST_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface ResolvedAddress {
  address: string;
  family?: number;
}

export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

export interface SafeTransportTarget {
  hostname: string;
  addresses: readonly Required<ResolvedAddress>[];
  lookup: LookupFunction;
}

export interface MetadataTransport {
  request(url: URL, init: RequestInit): Promise<Response>;
  close(): Promise<void>;
  destroy(error?: Error): void;
}

export type MetadataTransportFactory = (target: SafeTransportTarget) => MetadataTransport;

export interface FetchPublicMetadataOptions {
  resolver?: HostResolver;
  transportFactory?: MetadataTransportFactory;
}

export interface SourceMetadata {
  sourceUrl: string;
  finalUrl: string;
  contentType: "text/html" | "text/plain";
  title?: string;
  description?: string;
  canonicalUrl?: string;
  imageUrl?: string;
}

const defaultResolver: HostResolver = async (hostname) => lookup(hostname, {
  all: true,
  verbatim: true,
});

const defaultTransportFactory: MetadataTransportFactory = (target) => {
  const dispatcher = new Agent({ connect: { lookup: target.lookup } });
  return {
    request: (url, init) => undiciFetch(url, {
      ...init,
      dispatcher,
    } as UndiciRequestInit) as unknown as Promise<Response>,
    close: () => dispatcher.close(),
    destroy: (error) => dispatcher.destroy(error ?? null),
  };
};

export async function fetchPublicMetadata(
  source: string | URL,
  options: FetchPublicMetadataOptions = {},
): Promise<SourceMetadata> {
  const sourceUrl = parseRequestUrl(source);
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

  try {
    const visited = new Set([sourceUrl.toString()]);
    let currentUrl = sourceUrl;
    let redirects = 0;
    let response: Response;

    while (true) {
      const target = await resolvePublicTarget(currentUrl, resolver, controller.signal);
      activeTransport = transportFactory(target);
      response = await withAbort(activeTransport.request(currentUrl, {
        credentials: "omit",
        headers: { accept: "text/html, text/plain;q=0.9" },
        redirect: "manual",
        referrer: "",
        signal: controller.signal,
      }), controller.signal);

      if (!REDIRECT_STATUSES.has(response.status)) break;
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Metadata redirect limit of ${MAX_REDIRECTS} exceeded`);
      }
      const location = response.headers.get("location");
      if (!location) throw new Error("Metadata redirect is missing Location");

      const nextUrl = parseRequestUrl(location, currentUrl);
      if (visited.has(nextUrl.toString())) throw new Error("Metadata redirect loop detected");

      await response.body?.cancel().catch(() => undefined);
      await activeTransport.close();
      activeTransport = undefined;
      visited.add(nextUrl.toString());
      currentUrl = nextUrl;
      redirects += 1;
    }

    if (!response.ok) throw new Error(`Metadata request failed with HTTP ${response.status}`);

    const { contentType, charset } = parseContentType(response.headers.get("content-type"));
    const declaredLength = parseContentLength(response.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength > MAX_METADATA_BYTES) {
      void response.body?.cancel().catch(() => undefined);
      controller.abort();
      throw new Error("Metadata response exceeds the 2 MB size limit");
    }
    if (!response.body) throw new Error("Metadata response body is missing");

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    reader = response.body.getReader();
    while (true) {
      const { done, value } = await withAbort(reader.read(), controller.signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_METADATA_BYTES) {
        throw new Error("Metadata response exceeds the 2 MB size limit");
      }
      chunks.push(value);
    }

    const text = decodeBody(chunks, totalBytes, charset);
    await activeTransport.close();
    activeTransport = undefined;
    const baseMetadata: SourceMetadata = {
      sourceUrl: sourceUrl.toString(),
      finalUrl: currentUrl.toString(),
      contentType,
    };

    if (contentType === "text/plain") {
      const description = cleanText(text, 500);
      return description ? { ...baseMetadata, description } : baseMetadata;
    }

    return await extractHtmlMetadata(text, currentUrl, baseMetadata, resolver, controller.signal);
  } catch (error) {
    activeTransport?.destroy(error instanceof Error ? error : undefined);
    activeTransport = undefined;
    if (reader) {
      cancelReader();
      controller.abort();
    }
    if (timedOut || isAbortError(error)) {
      throw new Error("Metadata retrieval timed out after 10 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractHtmlMetadata(
  html: string,
  baseUrl: URL,
  baseMetadata: SourceMetadata,
  resolver: HostResolver,
  signal: AbortSignal,
): Promise<SourceMetadata> {
  const $ = load(html);
  const title = firstCleanText([
    metaContent($, "property", "og:title"),
    metaContent($, "name", "twitter:title"),
    $("title").first().text(),
  ], 200);
  const description = firstCleanText([
    metaContent($, "property", "og:description"),
    metaContent($, "name", "twitter:description"),
    metaContent($, "name", "description"),
  ], 500);
  const canonicalUrl = await firstPublicMetadataUrl(
    $("link[rel~='canonical']").map((_index, element) => $(element).attr("href")).get(),
    baseUrl,
    resolver,
    signal,
  );
  const imageUrl = await firstPublicMetadataUrl([
    ...metaContents($, "property", "og:image"),
    ...metaContents($, "property", "og:image:url"),
    ...metaContents($, "name", "twitter:image"),
    ...metaContents($, "name", "twitter:image:src"),
  ], baseUrl, resolver, signal);

  return compactMetadata({
    ...baseMetadata,
    title,
    description,
    canonicalUrl,
    imageUrl,
  });
}

function metaContent($: CheerioAPI, attribute: "name" | "property", value: string): string | undefined {
  return $(`meta[${attribute}='${value}']`).first().attr("content");
}

function metaContents($: CheerioAPI, attribute: "name" | "property", value: string): string[] {
  return $(`meta[${attribute}='${value}']`)
    .map((_index, element) => $(element).attr("content"))
    .get();
}

async function firstPublicMetadataUrl(
  candidates: readonly (string | undefined)[],
  baseUrl: URL,
  resolver: HostResolver,
  signal: AbortSignal,
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = parseRequestUrl(candidate.trim(), baseUrl);
      await resolvePublicTarget(url, resolver, signal);
      return url.toString();
    } catch (error) {
      if (isAbortError(error)) throw error;
    }
  }
  return undefined;
}

function compactMetadata(metadata: SourceMetadata): SourceMetadata {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as unknown as SourceMetadata;
}

function parseRequestUrl(source: string | URL, baseUrl?: URL): URL {
  let url: URL;
  try {
    url = new URL(source.toString(), baseUrl);
  } catch {
    throw new Error("Metadata URL must be a valid public HTTP(S) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Metadata URL must use public HTTP(S)");
  }
  if (url.username || url.password) throw new Error("Metadata URL credentials are not allowed");
  url.hash = "";
  if (url.href.length > MAX_URL_LENGTH) throw new Error("Metadata URL exceeds the length limit");
  return url;
}

async function resolvePublicTarget(
  url: URL,
  resolver: HostResolver,
  signal: AbortSignal,
): Promise<SafeTransportTarget> {
  const hostname = stripIpv6Brackets(url.hostname).toLowerCase();
  if (!hostname || isLocalHostname(hostname)) throw new Error("Metadata host must be public");

  if (ipaddr.isValid(hostname)) {
    if (!isPublicIp(hostname)) throw new Error("Metadata host must use a public IP address");
    const parsed = ipaddr.parse(hostname);
    return createSafeTransportTarget(hostname, [{
      address: parsed.toString(),
      family: parsed.kind() === "ipv4" ? 4 : 6,
    }]);
  }

  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await withAbort(resolver(hostname), signal);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Metadata host could not be resolved publicly");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("Metadata host must resolve only to public IP addresses");
  }
  const approved = addresses.map(({ address }) => {
    const parsed = ipaddr.parse(address);
    return {
      address: parsed.toString(),
      family: parsed.kind() === "ipv4" ? 4 : 6,
    };
  });
  return createSafeTransportTarget(hostname, approved);
}

function createSafeTransportTarget(
  hostname: string,
  addresses: readonly Required<ResolvedAddress>[],
): SafeTransportTarget {
  const approved = Object.freeze(addresses.map((address) => Object.freeze({ ...address })));
  const pinnedLookup: LookupFunction = (requestedHostname, options, callback) => {
    if (requestedHostname.toLowerCase() !== hostname) {
      const error = new Error("Pinned DNS lookup hostname mismatch") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, []);
      return;
    }
    const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
    const matching = family === 4 || family === 6
      ? approved.filter((address) => address.family === family)
      : approved;
    if (matching.length === 0) {
      const error = new Error("Pinned DNS lookup has no approved address for this family") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, []);
      return;
    }
    if (options.all) callback(null, [...matching]);
    else callback(null, matching[0].address, matching[0].family);
  };
  return { hostname, addresses: approved, lookup: pinnedLookup };
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "localhost.localdomain"
    || hostname.endsWith(".localhost.localdomain")
    || hostname === "local"
    || hostname.endsWith(".local");
}

function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv4) return isPublicIpv4(parsed);
  return isPublicIpv6(parsed as ipaddr.IPv6);
}

function isPublicIpv4(address: ipaddr.IPv4): boolean {
  return address.range() === "unicast" && ![
    "0.0.0.0/8",
    "10.0.0.0/8",
    "100.64.0.0/10",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.0.0.0/24",
    "192.0.2.0/24",
    "192.88.99.0/24",
    "192.168.0.0/16",
    "198.18.0.0/15",
    "198.51.100.0/24",
    "203.0.113.0/24",
    "224.0.0.0/4",
    "240.0.0.0/4",
  ].some((cidr) => address.match(ipaddr.IPv4.parseCIDR(cidr)));
}

function isPublicIpv6(address: ipaddr.IPv6): boolean {
  if (address.isIPv4MappedAddress()) return false;
  return address.range() === "unicast"
    && address.match(ipaddr.IPv6.parseCIDR("2000::/3"))
    && ![
      "2001::/32",
      "2001:2::/48",
      "2001:10::/28",
      "2001:20::/28",
      "2001:db8::/32",
      "2002::/16",
      "3fff::/20",
      "5f00::/16",
      "fec0::/10",
    ].some((cidr) => address.match(ipaddr.IPv6.parseCIDR(cidr)));
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

function parseContentType(value: string | null): {
  contentType: SourceMetadata["contentType"];
  charset: string;
} {
  if (!value) throw new Error("Metadata content-type is required");
  const [rawType, ...parameters] = value.split(";");
  const contentType = rawType.trim().toLowerCase();
  if (contentType !== "text/html" && contentType !== "text/plain") {
    throw new Error("Metadata content-type is not allowed");
  }
  const charsetParameter = parameters.find((parameter) => /^\s*charset\s*=/i.test(parameter));
  const charset = charsetParameter
    ? charsetParameter.split("=", 2)[1]?.trim().replace(/^['"]|['"]$/g, "")
    : "utf-8";
  if (!charset) throw new Error("Metadata character encoding is invalid");
  return { contentType, charset };
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  if (!/^\d+$/.test(value)) throw new Error("Metadata Content-Length is invalid");
  const length = Number(value);
  if (!Number.isSafeInteger(length)) throw new Error("Metadata Content-Length is invalid");
  return length;
}

function decodeBody(chunks: readonly Uint8Array[], totalBytes: number, charset: string): string {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Metadata response character encoding could not be decoded");
  }
}

function firstCleanText(candidates: readonly (string | undefined)[], maxLength: number): string | undefined {
  for (const candidate of candidates) {
    const cleaned = cleanText(candidate, maxLength);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function cleanText(value: string | undefined, maxLength: number): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, maxLength).trim();
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
