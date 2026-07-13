import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureDataset } from "../fixtures/content";
import { PublicDatasetSchema, type ContentItem, type PublicDataset } from "../../src/lib/schema";
import { downloadAsset } from "../../scripts/publish/assets";
import {
  buildPublicDataset,
  writePublicDataset,
} from "../../scripts/publish/build-dataset";

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP_BYTES = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const CONTENT_DIR = resolve("public/images/content");
const createdAssets = new Set<string>();

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
  const assetPath = await downloadAsset(sourceUrl, {
    fetchImpl: async () => response(bytes, {
      headers: { "content-type": contentType },
      status: 200,
      url: sourceUrl,
    }),
  });
  createdAssets.add(resolve(`public${assetPath}`));
  return assetPath;
}

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

    await expect(downloadAsset("https://cdn.example.com/cover.png", { fetchImpl }))
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

    const assetPath = await downloadAsset("https://cdn.example.com/assets/cover.png", { fetchImpl });
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

    await expect(downloadAsset("https://cdn.example.com/cover.png", { fetchImpl }))
      .rejects.toThrow(/redirect|5/i);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects a redirect without Location", async () => {
    await expect(downloadAsset("https://cdn.example.com/cover.png", {
      fetchImpl: async () => response(null, { status: 308 }),
    })).rejects.toThrow(/Location/i);
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

    await expect(downloadAsset("https://cdn.example.com/first.png", { fetchImpl }))
      .rejects.toThrow(/loop/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not expose redirect URL credentials in errors", async () => {
    const request = downloadAsset("https://cdn.example.com/cover.png", {
      fetchImpl: async () => response(null, {
        headers: { location: "https://user:secret@cdn.example.com/private.png" },
        status: 302,
      }),
    });

    await expect(request).rejects.toThrow(/credentials/i);
    await expect(request).rejects.not.toThrow(/user|secret/i);
  });

  it("rejects non-2xx responses", async () => {
    await expect(downloadAsset("https://cdn.example.com/missing.png", {
      fetchImpl: async () => response(null, { status: 404 }),
    })).rejects.toThrow(/404/);
  });

  it.each(["text/html", "image/gif", "application/octet-stream", null])(
    "rejects unknown content type %s",
    async (contentType) => {
      await expect(downloadAsset("https://cdn.example.com/cover", {
        fetchImpl: async () => response(PNG_BYTES, {
          headers: contentType ? { "content-type": contentType } : {},
          status: 200,
        }),
      })).rejects.toThrow(/content-type/i);
    },
  );

  it.each([
    ["image/jpeg", PNG_BYTES],
    ["image/png", WEBP_BYTES],
    ["image/webp", JPEG_BYTES],
  ])("rejects bytes that do not match declared type %s", async (contentType, bytes) => {
    await expect(downloadAsset("https://cdn.example.com/cover", {
      fetchImpl: async () => response(bytes, {
        headers: { "content-type": contentType },
        status: 200,
      }),
    })).rejects.toThrow(/magic|signature|content-type/i);
  });

  it("rejects an oversized Content-Length before reading the body", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(PNG_BYTES);
        controller.close();
      },
    });

    await expect(downloadAsset("https://cdn.example.com/large.png", {
      fetchImpl: async () => response(body, {
        headers: {
          "content-length": String(8 * 1024 * 1024 + 1),
          "content-type": "image/png",
        },
        status: 200,
      }),
    })).rejects.toThrow(/8 MB|size/i);
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
      await expect(downloadAsset("https://cdn.example.com/stream.png", {
        fetchImpl: async (_input, init) => {
          init?.signal?.addEventListener("abort", () => { aborted = true; });
          return response(body, {
            headers: { "content-type": "image/png" },
            status: 200,
          });
        },
      })).rejects.toThrow(/8 MB|size/i);
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

    const request = downloadAsset("https://cdn.example.com/reader-error.png", {
      fetchImpl: async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    });

    await expect(request).rejects.toBe(originalError);
    expect(cancel).toHaveBeenCalledOnce();
    expect(aborted).toBe(true);
  });

  it("aborts retrieval after 10 seconds", async () => {
    vi.useFakeTimers();
    const request = downloadAsset("https://cdn.example.com/slow.png", {
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    });

    const assertion = expect(request).rejects.toThrow(/10 seconds|timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
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
    const request = downloadAsset("https://cdn.example.com/slow-stream.png", {
      fetchImpl: async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    });

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
    const assetPath = await downloadAsset("https://cdn.example.com/cover.png", {
      fetchImpl: async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: { "content-type": "image/png" },
          status: 200,
        });
      },
    });
    createdAssets.add(resolve(`public${assetPath}`));

    expect(cancelled).toBe(false);
    expect(aborted).toBe(false);
  });

  it.each([
    ["image/jpeg", JPEG_BYTES, "jpg"],
    ["image/png", PNG_BYTES, "png"],
    ["image/webp", WEBP_BYTES, "webp"],
  ])("uses a stable SHA-256 filename for %s", async (contentType, bytes, extension) => {
    const first = await downloadForTest(bytes, contentType);
    const second = await downloadForTest(bytes, contentType, "https://other.example.com/../../escape.exe");
    const hash = createHash("sha256").update(bytes).digest("hex");

    expect(first).toBe(`/images/content/${hash}.${extension}`);
    expect(second).toBe(first);
    const relativeAssetPath = relative(CONTENT_DIR, resolve(`public${first}`));
    expect(relativeAssetPath.startsWith("..") || isAbsolute(relativeAssetPath)).toBe(false);
    expect((await stat(resolve(`public${first}`))).size).toBe(bytes.byteLength);
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
