import { describe, expect, it } from "vitest";
import { loadSyncConfig } from "../../scripts/config";

const validEnv = {
  FEISHU_APP_ID: "cli_app_id",
  FEISHU_APP_SECRET: "super-secret-value",
  FEISHU_BASE_APP_TOKEN: "base-token",
  FEISHU_CONTENT_TABLE_ID: "content-table",
  FEISHU_COPY_BLOCKS_TABLE_ID: "copy-table",
  FEISHU_INBOX_TABLE_ID: "inbox-table",
  AI_BASE_URL: "https://api.example.com/v1",
  AI_API_KEY: "ai-secret-value",
  AI_MODEL: "model-name",
};

describe("loadSyncConfig", () => {
  it("精确读取并返回全部同步变量", () => {
    expect(loadSyncConfig({ ...validEnv, UNRELATED: "ignored" })).toEqual(validEnv);
  });

  it("定位缺失变量但不回显任何 secret", () => {
    const env = { ...validEnv, FEISHU_APP_ID: "" };

    expect(() => loadSyncConfig(env)).toThrow(/FEISHU_APP_ID/);
    try {
      loadSyncConfig(env);
    } catch (error) {
      const message = String(error);
      expect(message).not.toContain("super-secret-value");
      expect(message).not.toContain("ai-secret-value");
    }
  });

  it.each([
    "http://api.example.com/v1",
    "http://localhost:8787/v1",
    "ftp://api.example.com/v1",
    "https://user:password@api.example.com/v1",
    "not-a-url",
  ])("拒绝不安全的 AI_BASE_URL: %s", (AI_BASE_URL) => {
    expect(() => loadSyncConfig({ ...validEnv, AI_BASE_URL })).toThrow(/AI_BASE_URL/);
  });
});
