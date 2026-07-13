export type RawFeishuRecord = {
  record_id: string;
  fields: Record<string, unknown>;
};

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

type TokenCache = Map<string, TokenCacheEntry>;

const processTokenCache: TokenCache = new Map();

export class FeishuApiError extends Error {
  readonly operation: string;
  readonly status?: number;
  readonly code?: number;

  constructor(operation: string, details: { status?: number; code?: number } = {}) {
    const suffix = details.status !== undefined
      ? ` (HTTP ${details.status})`
      : details.code !== undefined
        ? ` (code ${details.code})`
        : "";
    super(`Feishu ${operation} failed${suffix}`);
    this.name = "FeishuApiError";
    this.operation = operation;
    this.status = details.status;
    this.code = details.code;
  }
}

export type FeishuClientOptions = {
  appId: string;
  appSecret: string;
  appToken: string;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
  now?: () => number;
  tokenCache?: TokenCache;
};

export class FeishuClient {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly appToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;
  private readonly now: () => number;
  private readonly tokenCache: TokenCache;

  constructor(options: FeishuClientOptions) {
    const apiBaseUrl = new URL(options.apiBaseUrl ?? "https://open.feishu.cn");
    if (apiBaseUrl.protocol !== "https:") {
      throw new TypeError("Feishu API base URL must use HTTPS");
    }
    if (apiBaseUrl.username || apiBaseUrl.password) {
      throw new TypeError("Feishu API base URL must not include credentials");
    }

    this.appId = options.appId;
    this.appSecret = options.appSecret;
    this.appToken = options.appToken;
    this.fetchImpl = options.fetch ?? fetch;
    this.apiBaseUrl = apiBaseUrl.toString().replace(/\/$/, "");
    this.now = options.now ?? Date.now;
    this.tokenCache = options.tokenCache ?? processTokenCache;
  }

  async listRecords(tableId: string): Promise<RawFeishuRecord[]> {
    const records: RawFeishuRecord[] = [];
    let pageToken: string | undefined;

    do {
      const url = this.recordsUrl(tableId);
      url.searchParams.set("page_size", "500");
      if (pageToken) url.searchParams.set("page_token", pageToken);

      const payload = await this.requestJson("list records", url, { method: "GET" });
      const data = asObject(payload.data, "list records");
      const items = data.items;
      if (!Array.isArray(items)) throw new FeishuApiError("list records");
      records.push(...items.map((item) => parseRecord(item, "list records")));

      if (typeof data.has_more !== "boolean") throw new FeishuApiError("list records");
      const hasMore = data.has_more;
      pageToken = typeof data.page_token === "string" && data.page_token ? data.page_token : undefined;
      if (hasMore && !pageToken) throw new FeishuApiError("list records");
      if (!hasMore) pageToken = undefined;
    } while (pageToken);

    return records;
  }

  async createRecord(tableId: string, fields: Record<string, unknown>): Promise<RawFeishuRecord> {
    const payload = await this.requestJson("create record", this.recordsUrl(tableId), {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
    const data = asObject(payload.data, "create record");
    return parseRecord(data.record, "create record");
  }

  private recordsUrl(tableId: string): URL {
    return new URL(
      `/open-apis/bitable/v1/apps/${encodeURIComponent(this.appToken)}/tables/${encodeURIComponent(tableId)}/records`,
      this.apiBaseUrl,
    );
  }

  private async requestJson(
    operation: string,
    url: URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const token = await this.getTenantToken();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json; charset=utf-8",
      },
    });
    return parseFeishuResponse(response, operation);
  }

  private async getTenantToken(): Promise<string> {
    const cacheKey = `${this.apiBaseUrl}\n${this.appId}`;
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > this.now()) return cached.token;

    const response = await this.fetchImpl(
      new URL("/open-apis/auth/v3/tenant_access_token/internal", this.apiBaseUrl),
      {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret }),
      },
    );
    const payload = await parseFeishuResponse(response, "tenant token");
    const token = payload.tenant_access_token;
    const expire = payload.expire;
    if (typeof token !== "string" || !token || typeof expire !== "number" || !Number.isFinite(expire)) {
      throw new FeishuApiError("tenant token");
    }

    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: this.now() + Math.max(0, expire - 60) * 1000,
    });
    return token;
  }
}

async function parseFeishuResponse(
  response: Response,
  operation: string,
): Promise<Record<string, unknown>> {
  if (!response.ok) throw new FeishuApiError(operation, { status: response.status });

  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new FeishuApiError(operation);
  }

  const payload = asObject(value, operation);
  if (payload.code !== 0) {
    throw new FeishuApiError(operation, {
      code: typeof payload.code === "number" ? payload.code : undefined,
    });
  }
  return payload;
}

function asObject(value: unknown, operation: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FeishuApiError(operation);
  }
  return value as Record<string, unknown>;
}

function parseRecord(value: unknown, operation: string): RawFeishuRecord {
  const record = asObject(value, operation);
  if (typeof record.record_id !== "string") throw new FeishuApiError(operation);
  const fields = asObject(record.fields, operation);
  return { record_id: record.record_id, fields };
}
