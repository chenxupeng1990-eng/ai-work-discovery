import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AIEnrichmentError,
  DraftProposalSchema,
  enrichDraft,
  MAX_AI_RESPONSE_BYTES,
  MAX_EDITOR_NOTE_LENGTH,
  parseDraftProposal,
} from "../../scripts/inbox/ai-enricher";

const validProposal = {
  title: "A bounded review draft",
  summary: "A concise summary for human review.",
  recommendationReason: "Useful because the workflow is reusable.",
  recommendationTrack: "工作提效",
  timeToValue: "1 小时",
  adoptionLevel: "直接使用",
  takeaway: "Install the workflow and finish one reviewed draft end to end.",
  contentType: "Tool",
  category: "Engineering",
  tags: ["Codex", "Automation"],
  publicationStatus: "草稿",
  copyBlocks: [{
    title: "Run checks",
    type: "Command",
    language: "shell",
    content: "npm test",
    note: "Run before review.",
  }],
} as const;

const completion = (content: unknown) => ({
  choices: [{ message: { content } }],
});

const response = (body: BodyInit | null, status = 200) => new Response(body, {
  status,
  headers: { "content-type": "application/json" },
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DraftProposalSchema", () => {
  it("accepts a strict bounded draft proposal", () => {
    expect(DraftProposalSchema.parse(validProposal)).toEqual(validProposal);
  });

  it.each([
    ["unknown field", { ...validProposal, admin: true }],
    ["published status", { ...validProposal, publicationStatus: "\u5df2\u53d1\u5e03" }],
    ["approved status", { ...validProposal, publicationStatus: "\u5ba1\u6838\u901a\u8fc7" }],
    ["unknown content type", { ...validProposal, contentType: "Article" }],
    ["title too long", { ...validProposal, title: "x".repeat(81) }],
    ["summary too long", { ...validProposal, summary: "x".repeat(181) }],
    ["reason too long", { ...validProposal, recommendationReason: "x".repeat(161) }],
    ["unknown recommendation track", { ...validProposal, recommendationTrack: "未知轨道" }],
    ["unknown time to value", { ...validProposal, timeToValue: "2 小时" }],
    ["unknown adoption level", { ...validProposal, adoptionLevel: "专家代劳" }],
    ["empty takeaway", { ...validProposal, takeaway: "" }],
    ["takeaway too long", { ...validProposal, takeaway: "x".repeat(181) }],
    ["category too long", { ...validProposal, category: "x".repeat(21) }],
    ["too many tags", { ...validProposal, tags: Array.from({ length: 9 }, (_, index) => `tag-${index}`) }],
    ["tag too long", { ...validProposal, tags: ["x".repeat(21)] }],
    ["too many copy blocks", {
      ...validProposal,
      copyBlocks: Array.from({ length: 7 }, () => validProposal.copyBlocks[0]),
    }],
    ["copy title too long", {
      ...validProposal,
      copyBlocks: [{ ...validProposal.copyBlocks[0], title: "x".repeat(81) }],
    }],
    ["copy language too long", {
      ...validProposal,
      copyBlocks: [{ ...validProposal.copyBlocks[0], language: "x".repeat(31) }],
    }],
    ["copy content too long", {
      ...validProposal,
      copyBlocks: [{ ...validProposal.copyBlocks[0], content: "x".repeat(12_001) }],
    }],
    ["copy note too long", {
      ...validProposal,
      copyBlocks: [{ ...validProposal.copyBlocks[0], note: "x".repeat(201) }],
    }],
    ["copy unknown field", {
      ...validProposal,
      copyBlocks: [{ ...validProposal.copyBlocks[0], secret: "no" }],
    }],
  ])("rejects %s", (_label, candidate) => {
    expect(() => DraftProposalSchema.parse(candidate)).toThrow();
  });
});

describe("parseDraftProposal", () => {
  it.each([
    JSON.stringify(validProposal),
    `\`\`\`json\n${JSON.stringify(validProposal)}\n\`\`\``,
  ])("accepts pure JSON or one controlled json fence", (content) => {
    expect(parseDraftProposal(completion(content))).toEqual(validProposal);
  });

  it.each([
    "",
    `Here is JSON:\n${JSON.stringify(validProposal)}`,
    `${JSON.stringify(validProposal)}\nDone.`,
    `\`\`\`JSON\n${JSON.stringify(validProposal)}\n\`\`\``,
    `\`\`\`json\n${JSON.stringify(validProposal)}\n\`\`\`\nextra`,
  ])("rejects empty or free text content: %#", (content) => {
    expect(() => parseDraftProposal(completion(content))).toThrow(AIEnrichmentError);
  });

  it.each([
    {},
    { choices: [] },
    { choices: [{}] },
    completion(null),
    completion({}),
    { choices: [{ message: { content: JSON.stringify({ ...validProposal, publicationStatus: "\u5df2\u53d1\u5e03" }) } }] },
  ])("rejects malformed or unsafe completion: %#", (payload) => {
    expect(() => parseDraftProposal(payload)).toThrow(AIEnrichmentError);
  });
});

describe("enrichDraft", () => {
  it("posts a bounded allowlisted request to a safely joined chat completions URL", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(JSON.stringify(
      completion(JSON.stringify(validProposal)),
    )));
    const note = `editor ${"n".repeat(MAX_EDITOR_NOTE_LENGTH + 40)}`;

    await expect(enrichDraft({
      metadata: {
        sourceUrl: "https://example.com/source?token=model-secret#fragment",
        finalUrl: "https://example.com/final?utm_source=private",
        contentType: "text/html",
        title: "Public title",
        description: "Public description",
        canonicalUrl: "https://example.com/canonical",
        imageUrl: "https://example.com/image.png",
        cookies: "session=secret",
        html: "<html>secret</html>",
        rawFields: { secret: "never-send" },
      } as never,
      editorNote: note,
    }, {
      baseUrl: "https://api.example.com/v1",
      apiKey: "ai-secret-value",
      model: "review-model",
    }, {
      fetch: fetchMock,
    })).resolves.toEqual(validProposal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      "https://api.example.com/v1/chat/completions",
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer ai-secret-value",
        "content-type": "application/json; charset=utf-8",
      },
    });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "review-model",
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("session=secret");
    expect(serialized).not.toContain("<html>secret</html>");
    expect(serialized).not.toContain("never-send");
    expect(serialized).not.toContain("rawFields");
    expect(serialized).not.toContain("model-secret");
    expect(serialized).not.toContain("utm_source");
    expect(serialized).not.toContain("#fragment");
    expect(serialized).not.toContain(note);
    const messages = body.messages as Array<{ content: string }>;
    expect(messages[0]?.content).toContain("human-review");
    expect(messages[0]?.content).toContain("strict JSON");
    expect(messages[0]?.content).toContain("publicationStatus");
    expect(messages[0]?.content).toContain("草稿");
    expect(messages[0]?.content).toContain("工作发现站");
    expect(messages[0]?.content).toContain("四个轨道按价值分类");
    expect(messages[0]?.content).toContain("复制");
    expect(messages[0]?.content).toContain("安装");
    expect(messages[0]?.content).toContain("完成");
    expect(messages[0]?.content).toContain("禁止虚构");
    const modelInput = JSON.parse(messages[1]?.content ?? "{}") as Record<string, unknown>;
    expect(modelInput).toMatchObject({
      editorNoteTruncated: true,
      originalLength: note.length,
    });
    expect(String(modelInput.editorNote)).toHaveLength(MAX_EDITOR_NOTE_LENGTH);
  });

  it("uses an injectable clock to enforce one total timeout", async () => {
    let timeoutHandler: (() => void) | undefined;
    const clearTimeout = vi.fn();
    const fetchMock = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const request = enrichDraft({
      metadata: {
        sourceUrl: "https://example.com/source",
        finalUrl: "https://example.com/source",
        contentType: "text/plain",
      },
    }, {
      baseUrl: "https://api.example.com/v1/",
      apiKey: "ai-secret-value",
      model: "review-model",
    }, {
      fetch: fetchMock,
      clock: {
        setTimeout(handler) {
          timeoutHandler = handler;
          return 1;
        },
        clearTimeout,
      },
    });

    timeoutHandler?.();

    await expect(request).rejects.toMatchObject({
      name: "AIEnrichmentError",
      kind: "timeout",
    });
    expect(clearTimeout).toHaveBeenCalledWith(1);
  });

  it("times out a response body that never finishes even when the stream ignores abort", async () => {
    let timeoutHandler: (() => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({
      start() {
        // Intentionally never enqueue or close.
      },
    })));
    const request = enrichDraft({
      metadata: {
        sourceUrl: "https://example.com/source",
        finalUrl: "https://example.com/source",
        contentType: "text/plain",
      },
    }, {
      baseUrl: "https://api.example.com/v1/",
      apiKey: "ai-secret-value",
      model: "review-model",
    }, {
      fetch: fetchMock,
      clock: {
        setTimeout(handler) {
          timeoutHandler = handler;
          return 1;
        },
        clearTimeout() {},
      },
    });

    await Promise.resolve();
    timeoutHandler?.();
    const outcome = await Promise.race([
      request.then(
        () => "resolved",
        (error: unknown) => error,
      ),
      new Promise((resolve) => setTimeout(() => resolve("hung"), 50)),
    ]);

    expect(outcome).toMatchObject({
      name: "AIEnrichmentError",
      kind: "timeout",
    });
  });

  it("rejects oversized, non-2xx, malformed JSON, and invalid base URL responses with secret-safe typed errors", async () => {
    const cases = [
      response("x".repeat(MAX_AI_RESPONSE_BYTES + 1)),
      response(JSON.stringify({ error: "ai-secret-value" }), 503),
      response("not-json"),
    ];

    for (const providerResponse of cases) {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(providerResponse);
      const request = enrichDraft({
        metadata: {
          sourceUrl: "https://example.com/source",
          finalUrl: "https://example.com/source",
          contentType: "text/plain",
        },
      }, {
        baseUrl: "https://api.example.com/v1",
        apiKey: "ai-secret-value",
        model: "review-model",
      }, { fetch: fetchMock });

      await expect(request).rejects.toBeInstanceOf(AIEnrichmentError);
      await expect(request).rejects.not.toThrow(/ai-secret-value|Bearer|Authorization/);
    }

    expect(() => enrichDraft({
      metadata: {
        sourceUrl: "https://example.com/source",
        finalUrl: "https://example.com/source",
        contentType: "text/plain",
      },
    }, {
      baseUrl: "https://user:ai-secret-value@api.example.com/v1",
      apiKey: "ai-secret-value",
      model: "review-model",
    })).toThrow(AIEnrichmentError);
  });
});
