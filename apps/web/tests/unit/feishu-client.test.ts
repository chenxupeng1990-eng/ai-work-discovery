import { describe, expect, it, vi } from "vitest";
import { FeishuApiError, FeishuClient } from "../../scripts/feishu/client";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

describe("FeishuClient", () => {
  it("缓存 tenant token 并分页读取 URL encoded records", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ record_id: "rec-1", fields: {} }], has_more: true, page_token: "next token" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ record_id: "rec-2", fields: {} }], has_more: false },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [], has_more: false },
      }));
    const client = new FeishuClient({
      appId: "app/id",
      appSecret: "app-secret",
      appToken: "base/token",
      fetch: fetchMock,
      apiBaseUrl: "https://open.feishu.test",
      tokenCache: new Map(),
    });

    await expect(client.listRecords("table/id")).resolves.toEqual([
      { record_id: "rec-1", fields: {} },
      { record_id: "rec-2", fields: {} },
    ]);
    await client.listRecords("empty table");

    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe(
      "https://open.feishu.test/open-apis/bitable/v1/apps/base%2Ftoken/tables/table%2Fid/records?page_size=500",
    );
    expect(fetchMock.mock.calls[2]?.[0].toString()).toContain("page_token=next+token");
    expect(fetchMock.mock.calls.filter(([url]) => url.toString().includes("tenant_access_token"))).toHaveLength(1);
  });

  it("使用 tenant token 创建记录", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { record: { record_id: "rec-created", fields: { 标题: "草稿" } } },
      }));
    const client = new FeishuClient({
      appId: "app-id",
      appSecret: "app-secret",
      appToken: "base-token",
      fetch: fetchMock,
      apiBaseUrl: "https://open.feishu.test",
      tokenCache: new Map(),
    });

    await expect(client.createRecord("table/id", { 标题: "草稿" })).resolves.toEqual({
      record_id: "rec-created",
      fields: { 标题: "草稿" },
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ fields: { 标题: "草稿" } }),
    });
  });

  it.each([
    ["HTTP status", jsonResponse({ code: 0 }, 503)],
    ["Feishu code", jsonResponse({ code: 999, msg: "denied" })],
    ["malformed JSON", new Response("not-json", { status: 200 })],
  ])("对 %s 抛 typed error 且不泄露凭据", async (_label, response) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
    const client = new FeishuClient({
      appId: "app-id",
      appSecret: "secret-never-print",
      appToken: "base-token",
      fetch: fetchMock,
      apiBaseUrl: "https://open.feishu.test",
      tokenCache: new Map(),
    });

    const request = client.listRecords("table-id");
    await expect(request).rejects.toBeInstanceOf(FeishuApiError);
    try {
      await request;
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain("secret-never-print");
      expect(message).not.toContain("Authorization");
      expect(message).not.toContain("Bearer");
    }
  });

  it.each([
    ["missing has_more", { items: [] }],
    ["string has_more", { items: [], has_more: "false" }],
    ["has_more without page_token", { items: [], has_more: true }],
    ["non-array items", { items: {}, has_more: false }],
  ])("rejects invalid list records page: %s", async (_label, data) => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: "tenant-token", expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data }));
    const client = new FeishuClient({
      appId: "app-id",
      appSecret: "app-secret",
      appToken: "base-token",
      fetch: fetchMock,
      apiBaseUrl: "https://open.feishu.test",
      tokenCache: new Map(),
    });

    await expect(client.listRecords("table-id")).rejects.toBeInstanceOf(FeishuApiError);
  });

  it("rejects API base URL credentials without exposing the password", () => {
    const secret = "secret-never-print";

    expect(() => new FeishuClient({
      appId: "app-id",
      appSecret: "app-secret",
      appToken: "base-token",
      apiBaseUrl: `https://user:${secret}@open.feishu.test`,
    })).toThrow();

    try {
      new FeishuClient({
        appId: "app-id",
        appSecret: "app-secret",
        appToken: "base-token",
        apiBaseUrl: `https://user:${secret}@open.feishu.test`,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
