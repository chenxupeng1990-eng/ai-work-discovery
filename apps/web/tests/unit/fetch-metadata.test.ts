import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPublicMetadata,
  MAX_METADATA_BYTES,
  type HostResolver,
} from "../../scripts/inbox/fetch-metadata";

const publicResolver: HostResolver = async () => [{ address: "93.184.216.34", family: 4 }];

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
    value: init.url ?? "https://example.com/article",
  });
  return result;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchPublicMetadata URL safety", () => {
  it.each([
    "ftp://example.com/article",
    "https://user:secret@example.com/article",
    "http://localhost/article",
    "http://localhost.localdomain/article",
    "http://127.0.0.1/article",
    "http://10.0.0.1/article",
    "http://100.64.0.1/article",
    "http://169.254.169.254/latest/meta-data",
    "http://172.16.0.1/article",
    "http://192.168.1.1/article",
    "http://192.0.2.1/article",
    "http://198.18.0.1/article",
    "http://198.51.100.1/article",
    "http://203.0.113.1/article",
    "http://224.0.0.1/article",
    "http://240.0.0.1/article",
    "http://[::1]/article",
    "http://[fc00::1]/article",
    "http://[fe80::1]/article",
    "http://[ff02::1]/article",
    "http://[2001:db8::1]/article",
  ])("rejects unsafe URL %s", async (sourceUrl) => {
    const fetchImpl = vi.fn();
    const request = fetchPublicMetadata(sourceUrl, { fetchImpl, resolver: publicResolver });

    await expect(request).rejects.toThrow(/public|HTTP|credentials|host/i);
    await expect(request).rejects.not.toThrow(/user|secret/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    "127.0.0.1",
    "10.10.0.2",
    "169.254.10.20",
    "172.31.0.1",
    "192.168.50.5",
    "224.1.2.3",
    "240.1.2.3",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff00::1",
    "2001:db8::1",
  ])("rejects hostname resolving to non-public address %s", async (address) => {
    const fetchImpl = vi.fn();

    await expect(fetchPublicMetadata("https://example.com/article", {
      fetchImpl,
      resolver: async () => [{ address }],
    })).rejects.toThrow(/public/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("blocks a hostname when any resolved address is non-public", async () => {
    const fetchImpl = vi.fn();

    await expect(fetchPublicMetadata("https://example.com/article", {
      fetchImpl,
      resolver: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    })).rejects.toThrow(/public/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses a credential-free manual request after resolving every address", async () => {
    const resolver = vi.fn(publicResolver);
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(init?.redirect).toBe("manual");
      expect(init?.credentials).toBe("omit");
      expect(init?.referrer).toBe("");
      expect(headers.has("authorization")).toBe(false);
      expect(headers.has("cookie")).toBe(false);
      expect(headers.has("referer")).toBe(false);
      return response("<title>Public page</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      });
    });

    await fetchPublicMetadata("https://example.com/article", { fetchImpl, resolver });

    expect(resolver).toHaveBeenCalledWith("example.com");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("fetchPublicMetadata redirects and bounds", () => {
  it("resolves relative redirects and validates each hop", async () => {
    const resolver = vi.fn(publicResolver);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url === "https://example.com/start/article") {
        return response(null, {
          headers: { location: "../final" },
          status: 302,
          url,
        });
      }
      return response("<title>Final</title>", {
        headers: { "content-type": "text/html" },
        status: 200,
        url,
      });
    });

    const metadata = await fetchPublicMetadata("https://example.com/start/article", {
      fetchImpl,
      resolver,
    });

    expect(fetchImpl.mock.calls.map(([input]) => input.toString())).toEqual([
      "https://example.com/start/article",
      "https://example.com/final",
    ]);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(metadata.finalUrl).toBe("https://example.com/final");
  });

  it("blocks an unsafe redirect before requesting it", async () => {
    const fetchImpl = vi.fn(async () => response(null, {
      headers: { location: "http://127.0.0.1/admin" },
      status: 307,
    }));

    await expect(fetchPublicMetadata("https://example.com/article", {
      fetchImpl,
      resolver: publicResolver,
    })).rejects.toThrow(/public/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects more than five redirect hops", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      const hop = Number(url.searchParams.get("hop") ?? "0");
      return response(null, {
        headers: { location: `/article?hop=${hop + 1}` },
        status: 308,
        url: url.toString(),
      });
    });

    await expect(fetchPublicMetadata("https://example.com/article", {
      fetchImpl,
      resolver: publicResolver,
    })).rejects.toThrow(/redirect|5/i);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("rejects non-2xx responses", async () => {
    await expect(fetchPublicMetadata("https://example.com/missing", {
      fetchImpl: async () => response(null, { status: 404 }),
      resolver: publicResolver,
    })).rejects.toThrow(/404/);
  });

  it.each(["application/json", "application/octet-stream", null])(
    "rejects unsupported content type %s",
    async (contentType) => {
      await expect(fetchPublicMetadata("https://example.com/article", {
        fetchImpl: async () => response(new TextEncoder().encode("{}"), {
          headers: contentType ? { "content-type": contentType } : {},
          status: 200,
        }),
        resolver: publicResolver,
      })).rejects.toThrow(/content-type/i);
    },
  );

  it("cancels and aborts an oversized Content-Length before reading", async () => {
    let cancelled = false;
    let aborted = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([65]));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    await expect(fetchPublicMetadata("https://example.com/large", {
      fetchImpl: async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: {
            "content-length": String(MAX_METADATA_BYTES + 1),
            "content-type": "text/html",
          },
          status: 200,
        });
      },
      resolver: publicResolver,
    })).rejects.toThrow(/2 MB|size/i);
    expect(cancelled).toBe(true);
    expect(aborted).toBe(true);
  });

  it("cancels the body and aborts the request when streamed bytes exceed 2 MB", async () => {
    const chunk = new Uint8Array(1024 * 1024);
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
      await expect(fetchPublicMetadata("https://example.com/stream", {
        fetchImpl: async (_input, init) => {
          init?.signal?.addEventListener("abort", () => { aborted = true; });
          return response(body, {
            headers: { "content-type": "text/html" },
            status: 200,
          });
        },
        resolver: publicResolver,
      })).rejects.toThrow(/2 MB|size/i);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(cancelled).toBe(true);
      expect(aborted).toBe(true);
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("uses one 10-second timeout across resolution and retrieval", async () => {
    vi.useFakeTimers();
    const request = fetchPublicMetadata("https://example.com/slow", {
      fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
      resolver: publicResolver,
    });

    const assertion = expect(request).rejects.toThrow(/10 seconds|timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("rejects malformed declared encoding", async () => {
    await expect(fetchPublicMetadata("https://example.com/article", {
      fetchImpl: async () => response(Uint8Array.from([0xc3, 0x28]), {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      }),
      resolver: publicResolver,
    })).rejects.toThrow(/encoding|decode/i);
  });
});

describe("fetchPublicMetadata extraction", () => {
  it("uses bounded metadata precedence and resolves relative public URLs", async () => {
    const html = `
      <html>
        <head>
          <title> Document title </title>
          <meta name="description" content=" Document description ">
          <meta name="twitter:title" content=" Twitter title ">
          <meta name="twitter:description" content=" Twitter description ">
          <meta property="og:title" content="  Open   Graph   title  ">
          <meta property="og:description" content=" Open Graph description ">
          <link rel="canonical" href="../canonical/article">
          <meta property="og:image" content="/images/cover.jpg">
        </head>
      </html>
    `;

    const metadata = await fetchPublicMetadata("https://example.com/posts/source", {
      fetchImpl: async () => response(html, {
        headers: { "content-type": "text/html; charset=UTF-8" },
        status: 200,
        url: "https://example.com/posts/source",
      }),
      resolver: publicResolver,
    });

    expect(metadata).toEqual({
      sourceUrl: "https://example.com/posts/source",
      finalUrl: "https://example.com/posts/source",
      contentType: "text/html",
      title: "Open Graph title",
      description: "Open Graph description",
      canonicalUrl: "https://example.com/canonical/article",
      imageUrl: "https://example.com/images/cover.jpg",
    });
  });

  it("skips unsafe image candidates and returns the first suitable public image", async () => {
    const html = `
      <meta property="og:image" content="javascript:alert(1)">
      <meta property="og:image:url" content="http://127.0.0.1/private.png">
      <meta name="twitter:image" content="https://user:secret@example.com/private.png">
      <meta name="twitter:image:src" content="https://cdn.example.com/public.png">
      <link rel="canonical" href="data:text/html,unsafe">
    `;
    const resolver: HostResolver = async (hostname) => [{
      address: hostname === "cdn.example.com" ? "93.184.216.35" : "93.184.216.34",
      family: 4,
    }];

    const metadata = await fetchPublicMetadata("https://example.com/article", {
      fetchImpl: async () => response(html, {
        headers: { "content-type": "text/html" },
        status: 200,
      }),
      resolver,
    });

    expect(metadata.canonicalUrl).toBeUndefined();
    expect(metadata.imageUrl).toBe("https://cdn.example.com/public.png");
  });

  it("cleans and bounds extracted text", async () => {
    const html = `<title>${" Long   title ".repeat(40)}</title><meta name="description" content="${" Description ".repeat(100)}">`;

    const metadata = await fetchPublicMetadata("https://example.com/article", {
      fetchImpl: async () => response(html, {
        headers: { "content-type": "text/html" },
        status: 200,
      }),
      resolver: publicResolver,
    });

    expect(metadata.title?.length).toBeLessThanOrEqual(200);
    expect(metadata.description?.length).toBeLessThanOrEqual(500);
    expect(metadata.title).not.toMatch(/\s{2,}/);
    expect(metadata.description).not.toMatch(/\s{2,}/);
  });

  it("accepts explicit text/plain without parsing markup as HTML", async () => {
    const metadata = await fetchPublicMetadata("https://example.com/note.txt", {
      fetchImpl: async () => response("<title>Not HTML</title>\nPlain body", {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 200,
      }),
      resolver: publicResolver,
    });

    expect(metadata).toEqual({
      sourceUrl: "https://example.com/note.txt",
      finalUrl: "https://example.com/note.txt",
      contentType: "text/plain",
      description: "<title>Not HTML</title> Plain body",
    });
  });
});
