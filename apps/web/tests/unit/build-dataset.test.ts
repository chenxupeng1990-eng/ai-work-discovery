import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fixtureDataset } from "../fixtures/content";
import { PublicDatasetSchema, type ContentItem, type PublicDataset } from "../../src/lib/schema";
import type {
  HostResolver,
  MetadataTransport,
  MetadataTransportFactory,
  SafeTransportTarget,
} from "../../scripts/inbox/fetch-metadata";
import { downloadAsset, type DownloadAssetOptions } from "../../scripts/publish/assets";
import {
  buildPublicDataset,
  publishDatasetAtomically,
  writePublicDataset,
} from "../../scripts/publish/build-dataset";

let PNG_BYTES: Uint8Array;
let JPEG_BYTES: Uint8Array;
let WEBP_BYTES: Uint8Array;
const CONTENT_DIR = resolve("public/images/content");
const createdAssets = new Set<string>();
const publicResolver: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }];

function transportFactory(
  request: MetadataTransport["request"],
  onTarget?: (target: SafeTransportTarget) => void | Promise<void>,
): MetadataTransportFactory {
  return (target) => ({
    async request(url, init) {
      await onTarget?.(target);
      return request(url, init);
    },
    close: vi.fn(async () => undefined),
    destroy: vi.fn(),
  });
}

function downloadOptions(
  request: MetadataTransport["request"],
  resolver: HostResolver = publicResolver,
): DownloadAssetOptions {
  return { resolver, transportFactory: transportFactory(request) };
}

function response(
  body: BodyInit | Uint8Array | null,
  init: ResponseInit & { url?: string } = {},
): Response {
  const responseBody = body instanceof Uint8Array
    ? Uint8Array.from(body).buffer as ArrayBuffer
    : body;
  const result = new Response(responseBody, init);
  Object.defineProperty(result, "url", {
    configurable: true,
    value: init.url ?? "https://cdn.example.com/cover",
  });
  return result;
}

function contentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    ...fixtureDataset.items[0],
    id: "case-public",
    slug: "case-public",
    type: "Case",
    coverImage: "/images/content/case-public/source.png",
    sortWeight: 10,
    updatedAt: "2026-07-13T12:00:00.000Z",
    ...overrides,
  };
}

async function downloadForTest(
  bytes: Uint8Array,
  contentType: string,
  sourceUrl = "https://cdn.example.com/original-name.bin",
): Promise<string> {
  const assetPath = await downloadAsset(sourceUrl, downloadOptions(async () => response(bytes, {
      headers: { "content-type": contentType },
      status: 200,
      url: sourceUrl,
    })));
  createdAssets.add(resolve(`public${assetPath}`));
  return assetPath;
}

beforeAll(async () => {
  const pixels = { create: { width: 3, height: 2, channels: 4 as const, background: "#336699" } };
  [PNG_BYTES, JPEG_BYTES, WEBP_BYTES] = await Promise.all([
    sharp(pixels).png().toBuffer(),
    sharp(pixels).jpeg().toBuffer(),
    sharp(pixels).webp().toBuffer(),
  ]);
});

afterAll(() => {
  sharp.cache(false);
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([...createdAssets].map((path) => rm(path, { force: true })));
  createdAssets.clear();
});

describe("downloadAsset", () => {
  it.each([
    "http://cdn.example.com/cover.png",
    "https://user:password@cdn.example.com/cover.png",
  ])("rejects unsafe source URL %s", async (sourceUrl) => {
    await expect(downloadAsset(sourceUrl)).rejects.toThrow(/HTTPS|credentials/i);
  });

  it.each([
    [[{ address: "10.0.0.1", family: 4 }]],
    [[
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.1.10", family: 4 },
    ]],
  ])("rejects private or mixed DNS before creating a transport", async (addresses) => {
    const factory = vi.fn<MetadataTransportFactory>();

    await expect(downloadAsset("https://cdn.example.com/cover.png", {
      resolver: async () => addresses,
      transportFactory: factory,
    })).rejects.toThrow(/public/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("requests the original hostname through only resolver-approved addresses", async () => {
    const approved = [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
    ];
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const request = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.hostname).toBe("cdn.example.com");
      expect(init).toMatchObject({
        credentials: "omit",
        redirect: "manual",
        referrer: "",
      });
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      expect(new Headers(init.headers).has("cookie")).toBe(false);
      return response(PNG_BYTES, {
        headers: { "content-type": "image/png" },
        status: 200,
      });
    });
    const transportFactory = vi.fn<MetadataTransportFactory>((target) => ({
      async request(url, init) {
        const addresses = await new Promise<readonly { address: string; family: number }[]>((resolveLookup, reject) => {
          target.lookup(target.hostname, { all: true }, (error, result) => {
            if (error) reject(error);
            else if (!Array.isArray(result)) reject(new Error("Expected all approved addresses"));
            else resolveLookup(result);
          });
        });
        expect(addresses).toEqual(approved);
        return request(url, init);
      },
      close,
      destroy,
    }));

    const assetPath = await downloadAsset("https://cdn.example.com/cover.png", {
      resolver: async () => approved,
      transportFactory,
    });
    createdAssets.add(resolve(`public${assetPath}`));

    expect(transportFactory).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "cdn.example.com",
      addresses: approved,
    }));
    expect(close).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("closes each redirect transport and destroys only the active failing hop", async () => {
    const closed: string[] = [];
    const destroyed: string[] = [];
    const transportFactory: MetadataTransportFactory = (target) => ({
      async request(url) {
        if (target.hostname === "first.example") {
          return response(null, {
            headers: { location: "https://second.example/final.png" },
            status: 302,
            url: url.toString(),
          });
        }
        throw new Error("second hop failed");
      },
      close: async () => { closed.push(target.hostname); },
      destroy: () => { destroyed.push(target.hostname); },
    });

    await expect(downloadAsset("https://first.example/cover.png", {
      resolver: publicResolver,
      transportFactory,
    })).rejects.toThrow("second hop failed");

    expect(closed).toEqual(["first.example"]);
    expect(destroyed).toEqual(["second.example"]);
  });

  it("rejects an HTTPS to HTTP downgrade even if a later redirect returns to HTTPS", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "https://cdn.example.com/cover.png") {
        return response(null, {
          headers: { location: "http://cdn.example.com/insecure.png" },
          status: 302,
          url,
        });
      }
      return response(null, {
        headers: { location: "https://cdn.example.com/final.png" },
        status: 302,
        url,
      });
    });

    await expect(downloadAsset("https://cdn.example.com/cover.png", downloadOptions(fetchImpl)))
      .rejects.toThrow(/HTTPS/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative redirect Location against the current URL", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      expect(init?.redirect).toBe("manual");
      if (url === "https://cdn.example.com/assets/cover.png") {
        return response(null, {
          headers: { location: "../final.png" },
          status: 303,
          url,
        });
      }
      return response(PNG_BYTES, {
        headers: { "content-type": "image/png" },
        status: 200,
        url,
      });
    });

    const assetPath = await downloadAsset("https://cdn.example.com/assets/cover.png", downloadOptions(fetchImpl));
    createdAssets.add(resolve(`public${assetPath}`));

    expect(fetchImpl.mock.calls.map(([input]) => input.toString())).toEqual([
      "https://cdn.example.com/assets/cover.png",
      "https://cdn.example.com/final.png",
    ]);
  });

  it("rejects more than five redirect hops", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      const hop = Number(url.searchParams.get("hop") ?? "0");
      return response(null, {
        headers: { location: `/cover.png?hop=${hop + 1}` },
        status: 307,
        url: url.toString(),
      });
    });

    await expect(downloadAsset("https://cdn.example.com/cover.png", downloadOptions(fetchImpl)))
      .rejects.toThrow(/redirect|5/i);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects a redirect without Location", async () => {
    await expect(downloadAsset("https://cdn.example.com/cover.png", downloadOptions(
      async () => response(null, { status: 308 }),
    ))).rejects.toThrow(/Location/i);
  });

  it("rejects redirect loops", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      return response(null, {
        headers: {
          location: url.endsWith("first.png") ? "/second.png" : "/first.png",
        },
        status: 301,
        url,
      });
    });

    await expect(downloadAsset("https://cdn.example.com/first.png", downloadOptions(fetchImpl)))
      .rejects.toThrow(/loop/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not expose redirect URL credentials in errors", async () => {
    const request = downloadAsset("https://cdn.example.com/cover.png", downloadOptions(
      async () => response(null, {
        headers: { location: "https://user:secret@cdn.example.com/private.png" },
        status: 302,
      }),
    ));

    await expect(request).rejects.toThrow(/credentials/i);
    await expect(request).rejects.not.toThrow(/user|secret/i);
  });

  it("rejects non-2xx responses", async () => {
    await expect(downloadAsset("https://cdn.example.com/missing.png", downloadOptions(
      async () => response(null, { status: 404 }),
    ))).rejects.toThrow(/404/);
  });

  it.each(["text/html", "image/gif", "application/octet-stream", null])(
    "rejects unknown content type %s",
    async (contentType) => {
      await expect(downloadAsset("https://cdn.example.com/cover", downloadOptions(
        async () => response(PNG_BYTES, {
          headers: contentType ? { "content-type": contentType } : {},
          status: 200,
        }),
      ))).rejects.toThrow(/content-type/i);
    },
  );

  it.each([
    ["image/jpeg", () => PNG_BYTES],
    ["image/png", () => WEBP_BYTES],
    ["image/webp", () => JPEG_BYTES],
  ])("rejects bytes that do not match declared type %s", async (contentType, getBytes) => {
    const bytes = getBytes();
    await expect(downloadAsset("https://cdn.example.com/cover", downloadOptions(
      async () => response(bytes, {
        headers: { "content-type": contentType },
        status: 200,
      }),
    ))).rejects.toThrow(/magic|signature|content-type/i);
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(PNG_BYTES);
        controller.close();
      },
    });

    await expect(downloadAsset("https://cdn.example.com/large.png", downloadOptions(
      async () => response(body, {
        headers: {
          "content-length": String(8 * 1024 * 1024 + 1),
          "content-type": "image/png",
        },
        status: 200,
      }),
    ))).rejects.toThrow(/8 MB|size/i);
  });

  it("cancels the reader and aborts the request once a streamed body exceeds 8 MB", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(PNG_BYTES);
    let cancelled = false;
    let aborted = false;
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => unhandledRejections.push(reason);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
        return Promise.reject(new Error("observable cancel rejection"));
      },
    });
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      await expect(downloadAsset("https://cdn.example.com/stream.png", downloadOptions(
        async (_input, init) => {
          init?.signal?.addEventListener("abort", () => { aborted = true; });
          return response(body, {
            headers: { "content-type": "image/png" },
            status: 200,
          });
        },
      ))).rejects.toThrow(/8 MB|size/i);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cancelled).toBe(true);
      expect(aborted).toBe(true);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("cancels and aborts after a reader error while preserving the original error", async () => {
    const originalError = new Error("reader failed at source");
    let aborted = false;
    const cancel = vi.fn().mockResolvedValue(undefined);
    const reader = {
      cancel,
      read: vi.fn().mockRejectedValue(originalError),
    };
    const body = new ReadableStream<Uint8Array>();
    vi.spyOn(body, "getReader").mockReturnValue(
      reader as unknown as ReadableStreamDefaultReader<Uint8Array>,
    );

    const request = downloadAsset("https://cdn.example.com/reader-error.png", downloadOptions(
      async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    ));

    await expect(request).rejects.toBe(originalError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(aborted).toBe(true);
  });

  it("aborts retrieval after 10 seconds", async () => {
    vi.useFakeTimers();
    const request = downloadAsset("https://cdn.example.com/slow.png", downloadOptions(
      async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    ));

    const assertion = expect(request).rejects.toThrow(/10 seconds|timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("times out even when a transport ignores the abort signal", async () => {
    vi.useFakeTimers();
    const request = downloadAsset("https://cdn.example.com/ignores-abort.png", downloadOptions(
      async () => new Promise<Response>(() => undefined),
    ));
    const outcomePromise = request.then(() => "resolved", (error: Error) => error.message);

    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = await outcomePromise;

    expect(outcome).toMatch(/10 seconds|timed out/i);
  });

  it("cancels an acquired reader and aborts the request when streaming times out", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    let aborted = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = downloadAsset("https://cdn.example.com/slow-stream.png", downloadOptions(
      async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    ));

    const assertion = expect(request).rejects.toThrow(/10 seconds|timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(cancelled).toBe(true);
    expect(aborted).toBe(true);
  });

  it("does not cancel or abort after a successful download", async () => {
    let cancelled = false;
    let aborted = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(PNG_BYTES);
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const assetPath = await downloadAsset("https://cdn.example.com/cover.png", downloadOptions(
      async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    ));
    createdAssets.add(resolve(`public${assetPath}`));

    expect(cancelled).toBe(false);
    expect(aborted).toBe(false);
    expect((await readdir(CONTENT_DIR)).filter((name) => name.startsWith(".asset-"))).toEqual([]);
  });

  it.each([
    ["image/jpeg", () => JPEG_BYTES],
    ["image/png", () => PNG_BYTES],
    ["image/webp", () => WEBP_BYTES],
  ])("normalizes %s to a stable SHA-256 WebP filename", async (contentType, getBytes) => {
    const bytes = getBytes();
    const first = await downloadForTest(bytes, contentType);
    const second = await downloadForTest(bytes, contentType, "https://other.example.com/../../escape.exe");
    const normalized = await readFile(resolve(`public${first}`));
    const hash = createHash("sha256").update(normalized).digest("hex");

    expect(first).toBe(`/images/content/${hash}.webp`);
    expect(second).toBe(first);
    const relativeAssetPath = relative(CONTENT_DIR, resolve(`public${first}`));
    expect(relativeAssetPath.startsWith("..") || isAbsolute(relativeAssetPath)).toBe(false);
    expect((await sharp(normalized).metadata()).format).toBe("webp");
  });

  it.each(["image/jpeg", "image/png"])("strips metadata and marker text from normalized %s", async (contentType) => {
    const marker = `secret-artist-gps-comment-${contentType}`;
    const pipeline = sharp({
      create: { width: 4, height: 3, channels: 3, background: "#884422" },
    })
      .withExif({
        IFD0: { Artist: marker },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "31/1 14/1 0/1" },
      })
      .withIccProfile("srgb")
      .withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><Comment>${marker}</Comment></x:xmpmeta>`);
    const input = contentType === "image/jpeg"
      ? await pipeline.jpeg().toBuffer()
      : await pipeline.png().toBuffer();
    const inputMetadata = await sharp(input).metadata();

    expect(inputMetadata.exif).toBeDefined();
    expect(inputMetadata.xmp).toBeDefined();
    expect(inputMetadata.icc).toBeDefined();
    expect(input.toString("latin1")).toContain(marker);

    const assetPath = await downloadForTest(input, contentType);
    const normalized = await readFile(resolve(`public${assetPath}`));
    const metadata = await sharp(normalized).metadata();

    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.comments).toBeUndefined();
    expect(normalized.toString("latin1")).not.toContain(marker);
  });

  it("rejects invalid image bytes after MIME and magic validation", async () => {
    const invalidPng = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);

    await expect(downloadForTest(invalidPng, "image/png")).rejects.toThrow(/image|decode|png|corrupt|header/i);
  });

  it("rejects images whose decoded dimensions exceed the limit", async () => {
    const oversized = await sharp({
      create: { width: 10_001, height: 1, channels: 3, background: "#000000" },
    }).png().toBuffer();

    await expect(downloadForTest(oversized, "image/png")).rejects.toThrow(/dimension|pixel|limit/i);
  });

  it("auto-orients pixels and drops the orientation tag", async () => {
    const oriented = await sharp({
      create: { width: 3, height: 2, channels: 3, background: "#224466" },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();

    const assetPath = await downloadForTest(oriented, "image/jpeg");
    const metadata = await sharp(await readFile(resolve(`public${assetPath}`))).metadata();

    expect(metadata.width).toBe(2);
    expect(metadata.height).toBe(3);
    expect(metadata.orientation).toBeUndefined();
  });
});

describe("buildPublicDataset", () => {
  it("serializes only the public ContentItem allowlist", async () => {
    const item = {
      ...contentItem(),
      app_secret: "must-not-leak",
      "Raw Content": "private inbox body",
      publicationStatus: "Published",
    } as ContentItem;

    const dataset = await buildPublicDataset([item], {
      assets: { [item.coverImage]: "https://cdn.example.com/cover.png" },
      clock: () => new Date("2026-07-14T00:00:00.000Z"),
      downloadAsset: async () => "/images/content/stable.png",
    });
    const serialized = JSON.stringify(dataset);

    expect(serialized).not.toContain("app_secret");
    expect(serialized).not.toContain("Raw Content");
    expect(serialized).not.toContain("publicationStatus");
    expect(PublicDatasetSchema.parse(dataset)).toEqual(dataset);
  });

  it.each([
    ["Case", "/images/fallback-case.webp"],
    ["Inspiration", "/images/fallback-inspiration.webp"],
    ["Collaboration", "/images/fallback-collaboration.webp"],
    ["Tool", "/images/fallback-tool.webp"],
    ["Skill", "/images/fallback-skill.webp"],
    ["AI Signal", "/images/fallback-ai-signal.webp"],
    ["Getting Started", "/images/fallback-getting-started.webp"],
  ] as const)("uses the %s fallback when cover download fails", async (type, fallback) => {
    const item = contentItem({ type });
    const dataset = await buildPublicDataset([item], {
      assets: { [item.coverImage]: "https://cdn.example.com/cover.png" },
      downloadAsset: async () => { throw new Error("network"); },
    });

    expect(dataset.items[0].coverImage).toBe(fallback);
  });

  it("keeps an existing controlled cover when the remote refresh fails", async () => {
    const item = contentItem({
      coverImage: "/images/content/rec-public/cover.png",
    });
    const dataset = await buildPublicDataset([item], {
      assets: { [item.coverImage]: "https://cdn.example.com/cover.png" },
      downloadAsset: async () => { throw new Error("network"); },
      hasExistingAsset: async (path) => path === item.coverImage,
    });

    expect(dataset.items[0].coverImage).toBe(item.coverImage);
  });

  it("rejects a downloaded path outside the controlled content directory", async () => {
    const item = contentItem();

    await expect(buildPublicDataset([item], {
      assets: { [item.coverImage]: "https://cdn.example.com/cover.png" },
      downloadAsset: async () => "/images/fixtures/not-downloaded.png",
    })).rejects.toThrow(/content/i);
  });

  it("is deterministic for the same items and assets", async () => {
    const low = contentItem({ id: "low", slug: "low", sortWeight: 1 });
    const highOld = contentItem({
      id: "high-old",
      slug: "high-old",
      sortWeight: 20,
      updatedAt: "2026-07-12T00:00:00.000Z",
    });
    const highNew = contentItem({
      id: "high-new",
      slug: "high-new",
      sortWeight: 20,
      updatedAt: "2026-07-13T00:00:00.000Z",
    });
    const options = {
      clock: () => new Date("2026-07-14T00:00:00.000Z"),
      downloadAsset: async () => "/images/content/shared.webp",
    };

    const first = await buildPublicDataset([low, highOld, highNew], options);
    const second = await buildPublicDataset([highNew, low, highOld], options);

    expect(first).toEqual(second);
    expect(first.items.map(({ id }) => id)).toEqual(["high-new", "high-old", "low"]);
  });
});

describe("writePublicDataset", () => {
  it("writes an fsynced schema-valid dataset and renames it atomically", async () => {
    const generatedDir = await mkdtemp(join(tmpdir(), "ai-work-dataset-success-"));
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: "/images/fallback-case.webp" })],
    });

    try {
      await writePublicDataset(dataset, { generatedDir });
      const persisted = JSON.parse(await readFile(join(generatedDir, "content.json"), "utf8"));

      expect(PublicDatasetSchema.parse(persisted)).toEqual(dataset);
      await expect(stat(join(generatedDir, "content.tmp.json"))).rejects.toThrow();
    } finally {
      await rm(generatedDir, { force: true, recursive: true });
    }
  });

  it("removes the temp file and preserves the old dataset when validation fails", async () => {
    const generatedDir = await mkdtemp(join(tmpdir(), "ai-work-dataset-failure-"));
    const oldContent = "{\"old\":true}\n";
    await writeFile(join(generatedDir, "content.json"), oldContent);
    const invalidDataset = {
      generatedAt: "not-a-date",
      items: [],
    } as unknown as PublicDataset;

    try {
      await expect(writePublicDataset(invalidDataset, { generatedDir })).rejects.toThrow();
      expect(await readFile(join(generatedDir, "content.json"), "utf8")).toBe(oldContent);
      await expect(stat(join(generatedDir, "content.tmp.json"))).rejects.toThrow();
    } finally {
      await rm(generatedDir, { force: true, recursive: true });
    }
  });
});

describe("publishDatasetAtomically", () => {
  const hash = (character: string) => character.repeat(64);

  async function setupPublishFixture() {
    const root = await mkdtemp(join(tmpdir(), "ai-work-publish-"));
    const generatedDir = join(root, "generated");
    const assetDir = join(root, "public", "images", "content");
    const quarantineRoot = join(root, "quarantine");
    await mkdir(generatedDir, { recursive: true });
    await mkdir(assetDir, { recursive: true });
    return { root, generatedDir, assetDir, quarantineRoot };
  }

  it("prunes retired hash assets while preserving referenced and unknown files", async () => {
    const paths = await setupPublishFixture();
    const retired = `${hash("a")}.jpg`;
    const referenced = `${hash("b")}.webp`;
    const unknown = "editor-note.webp";
    const unrelated = "README.txt";
    await writeFile(join(paths.generatedDir, "content.json"), "{\"old\":true}\n");
    await Promise.all([
      writeFile(join(paths.assetDir, retired), "retired"),
      writeFile(join(paths.assetDir, referenced), "referenced"),
      writeFile(join(paths.assetDir, unknown), "unknown"),
      writeFile(join(paths.assetDir, unrelated), "unrelated"),
    ]);
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: `/images/content/${referenced}` })],
    });

    try {
      await publishDatasetAtomically(dataset, paths);

      expect((await readdir(paths.assetDir)).sort()).toEqual([referenced, unrelated, unknown].sort());
      expect(PublicDatasetSchema.parse(JSON.parse(
        await readFile(join(paths.generatedDir, "content.json"), "utf8"),
      ))).toEqual(dataset);
      await expect(stat(paths.quarantineRoot)).rejects.toThrow();
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("removes the old controlled cover when a record changes to a new hash", async () => {
    const paths = await setupPublishFixture();
    const oldCover = `${hash("c")}.png`;
    const newCover = `${hash("d")}.webp`;
    await writeFile(join(paths.assetDir, oldCover), "old");
    await writeFile(join(paths.assetDir, newCover), "new");
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: `/images/content/${newCover}` })],
    });

    try {
      await publishDatasetAtomically(dataset, paths);
      expect(await readdir(paths.assetDir)).toEqual([newCover]);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("keeps the committed dataset when quarantine cleanup partially fails", async () => {
    const paths = await setupPublishFixture();
    const retired = `${hash("7")}.jpg`;
    const referenced = `${hash("8")}.webp`;
    await writeFile(join(paths.generatedDir, "content.json"), "{\"old\":true}\n");
    await writeFile(join(paths.assetDir, retired), "retired");
    await writeFile(join(paths.assetDir, referenced), "referenced");
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: `/images/content/${referenced}` })],
    });
    const renameFile = vi.fn(rename);
    const removeQuarantine = vi.fn(async (path: string) => {
      await rm(join(path, "content.json"), { force: true });
      throw new Error("simulated partial cleanup failure");
    });

    try {
      await publishDatasetAtomically(dataset, { ...paths, renameFile, removeQuarantine });

      expect(PublicDatasetSchema.parse(JSON.parse(
        await readFile(join(paths.generatedDir, "content.json"), "utf8"),
      ))).toEqual(dataset);
      expect(await readdir(paths.assetDir)).toEqual([referenced]);
      expect(removeQuarantine).toHaveBeenCalledOnce();
      expect(renameFile.mock.calls.some(([source, destination]) =>
        String(source).includes("quarantine-") && destination === join(paths.generatedDir, "content.json"),
      )).toBe(false);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("restores the old dataset and every moved asset when pruning fails", async () => {
    const paths = await setupPublishFixture();
    const first = `${hash("e")}.jpg`;
    const second = `${hash("f")}.png`;
    const oldContent = "{\"lastGood\":true}\n";
    await writeFile(join(paths.generatedDir, "content.json"), oldContent);
    await writeFile(join(paths.assetDir, first), "first");
    await writeFile(join(paths.assetDir, second), "second");
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: "/images/fallback-case.webp" })],
    });
    const renameFile = vi.fn(async (source: string, destination: string) => {
      if (source === join(paths.assetDir, second)) throw new Error("simulated move failure");
      await rename(source, destination);
    });

    try {
      await expect(publishDatasetAtomically(dataset, { ...paths, renameFile }))
        .rejects.toThrow("simulated move failure");
      expect(await readFile(join(paths.generatedDir, "content.json"), "utf8")).toBe(oldContent);
      expect(await readdir(paths.assetDir)).toEqual([first, second]);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

  it("does not prune assets when replacing content.json fails", async () => {
    const paths = await setupPublishFixture();
    const retired = `${hash("1")}.webp`;
    const oldContent = "{\"lastGood\":true}\n";
    await writeFile(join(paths.generatedDir, "content.json"), oldContent);
    await writeFile(join(paths.assetDir, retired), "retired");
    const dataset = PublicDatasetSchema.parse({
      generatedAt: "2026-07-14T00:00:00.000Z",
      items: [contentItem({ coverImage: "/images/fallback-case.webp" })],
    });
    const renameFile = vi.fn(async (source: string, destination: string) => {
      if (source.endsWith("content.tmp.json") && destination.endsWith("content.json")) {
        throw new Error("simulated replace failure");
      }
      await rename(source, destination);
    });

    try {
      await expect(publishDatasetAtomically(dataset, { ...paths, renameFile }))
        .rejects.toThrow("simulated replace failure");
      expect(await readFile(join(paths.generatedDir, "content.json"), "utf8")).toBe(oldContent);
      expect(await readdir(paths.assetDir)).toEqual([retired]);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });
});
