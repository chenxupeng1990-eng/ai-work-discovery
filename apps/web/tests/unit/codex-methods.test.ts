import { describe, expect, it } from "vitest";
import {
  CODEX_METHOD_CATEGORIES,
  CodexMethodSchema,
  codexMethods,
  queryCodexMethods,
} from "../../src/data/codex-methods";

const validMethod = {
  ...codexMethods[0]!,
  id: "valid-method",
  number: 99,
};

describe("Codex methods", () => {
  it("publishes twelve validated methods with unique ids and numbers", () => {
    expect(codexMethods).toHaveLength(12);
    expect(new Set(codexMethods.map(({ id }) => id))).toHaveLength(12);
    expect(new Set(codexMethods.map(({ number }) => number))).toHaveLength(12);
    for (const method of codexMethods) expect(CodexMethodSchema.parse(method)).toEqual(method);
  });

  it.each([
    ["unknown category", { category: "未知分类" }],
    ["invalid date", { verifiedAt: "2026/07/15" }],
    ["non-HTTPS source", { capabilitySource: { label: "Source", url: "http://example.com" } }],
    ["missing capability source", { capabilitySource: undefined }],
    ["unknown status", { status: "draft" }],
  ])("rejects %s", (_label, patch) => {
    expect(CodexMethodSchema.safeParse({ ...validMethod, ...patch }).success).toBe(false);
  });

  it("covers every fixed category", () => {
    expect(new Set(codexMethods.map(({ category }) => category))).toEqual(new Set(CODEX_METHOD_CATEGORIES));
  });

  it("requires explicit confirmation language for every high-risk method", () => {
    const highRiskMethods = codexMethods.filter(({ riskLevel }) => riskLevel === "高风险");
    expect(highRiskMethods.length).toBeGreaterThan(0);
    for (const method of highRiskMethods) {
      expect(method.prompt).toMatch(/暂停|等待我确认|必须先.*确认/u);
    }
  });

  it("searches titles, outcomes, prompts, categories, and source labels", () => {
    expect(queryCodexMethods(codexMethods, "磁盘", "全部").map(({ number }) => number)).toContain(2);
    expect(queryCodexMethods(codexMethods, "结构化草稿", "全部").map(({ number }) => number)).toContain(4);
    expect(queryCodexMethods(codexMethods, "关键动作", "全部").map(({ number }) => number)).toContain(6);
    expect(queryCodexMethods(codexMethods, "飞书协作", "全部").map(({ number }) => number)).toEqual([5]);
    expect(queryCodexMethods(codexMethods, "Kostas", "全部").map(({ number }) => number)).toEqual([12]);
  });

  it("combines category and text filters without mutating source order", () => {
    const before = codexMethods.map(({ id }) => id);
    expect(queryCodexMethods(codexMethods, "Codex", "电脑维护").every(({ category }) => (
      category === "电脑维护"
    ))).toBe(true);
    expect(codexMethods.map(({ id }) => id)).toEqual(before);
  });
});
