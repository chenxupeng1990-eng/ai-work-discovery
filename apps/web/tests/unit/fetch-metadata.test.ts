import type { LookupFunction } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMetadataTransportFactory,
  fetchPublicMetadata,
  MAX_METADATA_BYTES,
  type HostResolver,
  type MetadataTransport,
  type MetadataTransportFactory,
  type SafeTransportTarget,
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

function transportFactory(
  request: MetadataTransport["request"],
  onTarget?: (target: SafeTransportTarget) => void | Promise<void>,
): MetadataTransportFactory {
  return (target) => {
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn();
    return {
      async request(url, init) {
        await onTarget?.(target);
        return request(url, init);
      },
      close,
      destroy,
    };
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("default metadata transport wiring", () => {
  it("uses the pinned dispatcher for the original hostname URL and closes after the response", async () => {
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const dispatcher = { close, destroy };
    let pinnedLookup: LookupFunction | undefined;
    const agentFactory = vi.fn((lookup: LookupFunction) => {
      pinnedLookup = lookup;
      return dispatcher;
    });
    const fetch = vi.fn(async (url: URL, init: RequestInit & { dispatcher?: unknown }) => {
      expect(url.toString()).toBe("https://example.com/article");
      expect(url.hostname).toBe("example.com");
      expect(init.dispatcher).toBe(dispatcher);
      return response("<title>Public page</title>", {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      });
    });
    const factory = createMetadataTransportFactory({ fetch, agentFactory });

    await fetchPublicMetadata("https://example.com/article", {
      resolver: publicResolver,
      transportFactory: factory,
    });

    expect(agentFactory).toHaveBeenCalledTimes(1);
    expect(agentFactory).toHaveBeenCalledWith(expect.any(Function));
    expect(pinnedLookup).toBeDefined();
    const lookup = pinnedLookup;
    if (!lookup) throw new Error("Expected the pinned lookup to reach the agent factory");
    await expect(new Promise((resolve, reject) => {
      lookup("example.com", { all: true }, (error, addresses) => {
        if (error) reject(error);
        else resolve(addresses);
      });
    })).resolves.toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("destroys the pinned dispatcher when the request fails", async () => {
    const requestError = new Error("request failed");
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn();
    const dispatcher = { close, destroy };
    const factory = createMetadataTransportFactory({
      fetch: vi.fn(async (_url: URL, init: RequestInit & { dispatcher?: unknown }) => {
        expect(init.dispatcher).toBe(dispatcher);
        throw requestError;
      }),
      agentFactory: vi.fn(() => dispatcher),
    });

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: publicResolver,
      transportFactory: factory,
    })).rejects.toThrow("request failed");

    expect(close).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledWith(requestError);
  });
});

describe("fetchPublicMetadata URL safety", () => {
  it("binds the connection lookup to the resolver-approved address set", async () => {
    const approved = [
      { address: "93.184.216.34", family: 4 as const },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 as const },
    ];
    const usedAddresses: string[] = [];
    const factory = vi.fn(transportFactory(
      async (url) => {
        expect(url.hostname).toBe("example.com");
        return response("<title>Public page</title>", {
          headers: { "content-type": "text/html; charset=utf-8" },
          status: 200,
        });
      },
      async (target) => {
        await new Promise<void>((resolve, reject) => {
          target.lookup(target.hostname, { all: true }, (error, addresses) => {
            if (error) {
              reject(error);
              return;
            }
            if (!Array.isArray(addresses)) {
              reject(new Error("Expected all approved addresses"));
              return;
            }
            usedAddresses.push(...addresses.map(({ address }) => address));
            resolve();
          });
        });
        await new Promise<void>((resolve, reject) => {
          target.lookup("attacker.example", { all: true }, (error) => {
            if (error?.code === "ENOTFOUND") resolve();
            else reject(new Error("Pinned lookup accepted a different hostname"));
          });
        });
      },
    ));

    await fetchPublicMetadata("https://example.com/article", {
      resolver: async () => approved,
      transportFactory: factory,
    });

    expect(factory).toHaveBeenCalledWith(expect.objectContaining({
      hostname: "example.com",
      addresses: approved,
    }));
    expect(usedAddresses).toEqual(approved.map(({ address }) => address));
  });

  it.each([
    "0.0.0.0",
    "192.0.0.9",
    "192.88.99.1",
    "255.255.255.255",
    "::",
    "::ffff:10.0.0.1",
    "::ffff:93.184.216.34",
    "fec0::1",
    "2001::1",
    "2001:3::1",
    "2001:4:112::1",
    "2002:c000:0201::1",
    "3fff::1",
    "5f00::1",
  ])("rejects additional non-public address range %s", async (address) => {
    const factory = vi.fn<MetadataTransportFactory>();

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: async () => [{ address }],
      transportFactory: factory,
    })).rejects.toThrow(/public/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    "93.184.216.34",
    "2606:2800:220:1:248:1893:25c8:1946",
  ])("accepts direct public address %s", async (address) => {
    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: async () => [{ address }],
      transportFactory: transportFactory(async () => response("<title>Public</title>", {
        headers: { "content-type": "text/html" },
        status: 200,
      })),
    })).resolves.toMatchObject({ title: "Public" });
  });

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
    const factory = vi.fn<MetadataTransportFactory>();
    const request = fetchPublicMetadata(sourceUrl, {
      resolver: publicResolver,
      transportFactory: factory,
    });

    await expect(request).rejects.toThrow(/public|HTTP|credentials|host/i);
    await expect(request).rejects.not.toThrow(/user|secret/i);
    expect(factory).not.toHaveBeenCalled();
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
    const factory = vi.fn<MetadataTransportFactory>();

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: async () => [{ address }],
      transportFactory: factory,
    })).rejects.toThrow(/public/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("blocks a hostname when any resolved address is non-public", async () => {
    const factory = vi.fn<MetadataTransportFactory>();

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
      transportFactory: factory,
    })).rejects.toThrow(/public/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses a credential-free manual request after resolving every address", async () => {
    const resolver = vi.fn(publicResolver);
    const request = vi.fn(async (_input: URL, init: RequestInit) => {
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

    await fetchPublicMetadata("https://example.com/article", {
      resolver,
      transportFactory: transportFactory(request),
    });

    expect(resolver).toHaveBeenCalledWith("example.com");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("fetchPublicMetadata redirects and bounds", () => {
  it("creates and closes a separately pinned transport for every redirect hop", async () => {
    const targets: SafeTransportTarget[] = [];
    const closed: string[] = [];
    const destroyed: string[] = [];
    const factory: MetadataTransportFactory = (target) => {
      targets.push(target);
      return {
        request: async (url) => url.hostname === "first.example"
          ? response(null, { headers: { location: "https://second.example/final" }, status: 302 })
          : response("<title>Final</title>", {
              headers: { "content-type": "text/html" },
              status: 200,
            }),
        close: async () => { closed.push(target.hostname); },
        destroy: () => { destroyed.push(target.hostname); },
      };
    };

    await fetchPublicMetadata("https://first.example/start", {
      resolver: async (hostname) => [{
        address: hostname === "first.example" ? "93.184.216.34" : "93.184.216.35",
        family: 4,
      }],
      transportFactory: factory,
    });

    expect(targets.map(({ hostname, addresses }) => ({ hostname, addresses }))).toEqual([
      { hostname: "first.example", addresses: [{ address: "93.184.216.34", family: 4 }] },
      { hostname: "second.example", addresses: [{ address: "93.184.216.35", family: 4 }] },
    ]);
    expect(closed).toEqual(["first.example", "second.example"]);
    expect(destroyed).toEqual([]);
  });

  it("destroys the active transport when a response fails validation", async () => {
    const close = vi.fn(async () => undefined);
    const destroy = vi.fn();

    await expect(fetchPublicMetadata("https://example.com/missing", {
      resolver: publicResolver,
      transportFactory: () => ({
        request: async () => response(null, { status: 404 }),
        close,
        destroy,
      }),
    })).rejects.toThrow(/404/);

    expect(close).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("checks the normalized initial href length", async () => {
    const expandingPath = String.fromCharCode(0xe9).repeat(700);
    const factory = vi.fn<MetadataTransportFactory>();

    await expect(fetchPublicMetadata(`https://example.com/${expandingPath}`, {
      resolver: publicResolver,
      transportFactory: factory,
    })).rejects.toThrow(/length/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects a relative redirect whose resolved href exceeds 2048 characters", async () => {
    const factory = transportFactory(async () => response(null, {
      headers: { location: `/${"x".repeat(2_100)}` },
      status: 302,
    }));

    await expect(fetchPublicMetadata("https://example.com/start", {
      resolver: publicResolver,
      transportFactory: factory,
    })).rejects.toThrow(/length/i);
  });

  it("resolves relative redirects and validates each hop", async () => {
    const resolver = vi.fn(publicResolver);
    const request = vi.fn(async (input: URL) => {
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
      resolver,
      transportFactory: transportFactory(request),
    });

    expect(request.mock.calls.map(([input]) => input.toString())).toEqual([
      "https://example.com/start/article",
      "https://example.com/final",
    ]);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(metadata.finalUrl).toBe("https://example.com/final");
  });

  it("blocks an unsafe redirect before requesting it", async () => {
    const request = vi.fn(async () => response(null, {
      headers: { location: "http://127.0.0.1/admin" },
      status: 307,
    }));

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: publicResolver,
      transportFactory: transportFactory(request),
    })).rejects.toThrow(/public/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("rejects more than five redirect hops", async () => {
    const request = vi.fn(async (input: URL) => {
      const url = new URL(input.toString());
      const hop = Number(url.searchParams.get("hop") ?? "0");
      return response(null, {
        headers: { location: `/article?hop=${hop + 1}` },
        status: 308,
        url: url.toString(),
      });
    });

    await expect(fetchPublicMetadata("https://example.com/article", {
      resolver: publicResolver,
      transportFactory: transportFactory(request),
    })).rejects.toThrow(/redirect|5/i);
    expect(request).toHaveBeenCalledTimes(6);
  });

  it("rejects non-2xx responses", async () => {
    await expect(fetchPublicMetadata("https://example.com/missing", {
      resolver: publicResolver,
      transportFactory: transportFactory(async () => response(null, { status: 404 })),
    })).rejects.toThrow(/404/);
  });

  it.each(["application/json", "application/octet-stream", null])(
    "rejects unsupported content type %s",
    async (contentType) => {
      await expect(fetchPublicMetadata("https://example.com/article", {
        transportFactory: transportFactory(async () => response(new TextEncoder().encode("{}"), {
          headers: contentType ? { "content-type": contentType } : {},
          status: 200,
        })),
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
      transportFactory: transportFactory(async (_input, init) => {
        init?.signal?.addEventListener("abort", () => { aborted = true; });
        return response(body, {
          headers: {
            "content-length": String(MAX_METADATA_BYTES + 1),
            "content-type": "text/html",
          },
          status: 200,
        });
      }),
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
        transportFactory: transportFactory(async (_input, init) => {
          init?.signal?.addEventListener("abort", () => { aborted = true; });
          return response(body, {
            headers: { "content-type": "text/html" },
            status: 200,
          });
        }),
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
      transportFactory: transportFactory(async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })),
      resolver: publicResolver,
    });

    const assertion = expect(request).rejects.toThrow(/10 seconds|timed out/i);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("rejects malformed declared encoding", async () => {
    await expect(fetchPublicMetadata("https://example.com/article", {
      transportFactory: transportFactory(async () => response(Uint8Array.from([0xc3, 0x28]), {
        headers: { "content-type": "text/html; charset=utf-8" },
        status: 200,
      })),
      resolver: publicResolver,
    })).rejects.toThrow(/encoding|decode/i);
  });
});

describe("fetchPublicMetadata extraction", () => {
  it("skips relative canonical and image URLs whose resolved href exceeds 2048 characters", async () => {
    const longPath = `/${"x".repeat(2_100)}`;
    const html = `<link rel="canonical" href="${longPath}"><meta property="og:image" content="${longPath}">`;

    const metadata = await fetchPublicMetadata("https://example.com/article", {
      resolver: publicResolver,
      transportFactory: transportFactory(async () => response(html, {
        headers: { "content-type": "text/html" },
        status: 200,
      })),
    });

    expect(metadata.canonicalUrl).toBeUndefined();
    expect(metadata.imageUrl).toBeUndefined();
  });
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
      transportFactory: transportFactory(async () => response(html, {
        headers: { "content-type": "text/html; charset=UTF-8" },
        status: 200,
        url: "https://example.com/posts/source",
      })),
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
      transportFactory: transportFactory(async () => response(html, {
        headers: { "content-type": "text/html" },
        status: 200,
      })),
      resolver,
    });

    expect(metadata.canonicalUrl).toBeUndefined();
    expect(metadata.imageUrl).toBe("https://cdn.example.com/public.png");
  });

  it("cleans and bounds extracted text", async () => {
    const html = `<title>${" Long   title ".repeat(40)}</title><meta name="description" content="${" Description ".repeat(100)}">`;

    const metadata = await fetchPublicMetadata("https://example.com/article", {
      transportFactory: transportFactory(async () => response(html, {
        headers: { "content-type": "text/html" },
        status: 200,
      })),
      resolver: publicResolver,
    });

    expect(metadata.title?.length).toBeLessThanOrEqual(200);
    expect(metadata.description?.length).toBeLessThanOrEqual(500);
    expect(metadata.title).not.toMatch(/\s{2,}/);
    expect(metadata.description).not.toMatch(/\s{2,}/);
  });

  it("accepts explicit text/plain without parsing markup as HTML", async () => {
    const metadata = await fetchPublicMetadata("https://example.com/note.txt", {
      transportFactory: transportFactory(async () => response("<title>Not HTML</title>\nPlain body", {
        headers: { "content-type": "text/plain; charset=utf-8" },
        status: 200,
      })),
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
