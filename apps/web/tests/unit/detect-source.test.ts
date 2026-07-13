import { describe, expect, it } from "vitest";
import { detectSource, MAX_SOURCE_LENGTH } from "../../scripts/inbox/detect-source";

describe("detectSource", () => {
  it.each([
    ["https://my.feishu.cn/docx/abc", "feishu"],
    ["https://open.feishu.cn/document/home/index", "feishu"],
    ["https://acme.larksuite.com/wiki/abc", "feishu"],
    ["https://github.com/owner/repo", "github"],
    ["https://api.github.com/repos/owner/repo", "github"],
    ["https://aihot.virxact.com/article/123", "aihot"],
    ["https://www.example.com/article", "web"],
    ["npm install astro", "code"],
    ["git clone https://github.com/owner/repo.git", "code"],
    ["```ts\nconst answer = 42;\n```", "code"],
    ["请帮我分析这个工作流", "prompt"],
    ["How should I improve this workflow?", "prompt"],
    ["A concise note about developer tooling.", "text"],
  ])("detects %s as %s", (raw, kind) => {
    expect(detectSource(raw).kind).toBe(kind);
  });

  it("trims input and returns normalized URL fields", () => {
    expect(detectSource("  HTTPS://GitHub.com/owner/repo  ")).toEqual({
      kind: "github",
      raw: "HTTPS://GitHub.com/owner/repo",
      url: "https://github.com/owner/repo",
    });
  });

  it("uses structured URL parsing before code and prompt heuristics", () => {
    expect(detectSource("https://example.com/search?q=npm+install+astro").kind).toBe("web");
    expect(detectSource("https://example.com/why-does-git-fail?").kind).toBe("web");
  });

  it.each([
    "https://feishu.cn.evil.example/docx/abc",
    "https://notfeishu.cn/docx/abc",
    "https://github.com.evil.example/owner/repo",
    "https://notgithub.com/owner/repo",
    "https://aihot.virxact.com.evil.example/article/123",
    "https://virxact.com/article/123",
  ])("does not trust hostname spoof %s", (raw) => {
    expect(detectSource(raw).kind).toBe("web");
  });

  it.each([
    "We should npm package the release notes tomorrow.",
    "The git history contains useful context.",
    "This article compares npm and pnpm adoption.",
  ])("does not classify natural language containing command words as code: %s", (raw) => {
    expect(detectSource(raw).kind).toBe("text");
  });

  it.each([
    "git status is failing, can you explain why?",
    "npm install failed, please help me",
    "curl this page and summarize it",
    "git status tell me what it means",
    "npm test interpret the output",
    "git diff describe the result",
    "git show explain",
    "npm test help",
    "git status why",
    "git diff what",
    "npm test analyze",
    `git status ${"\u5931\u8d25\u4e86\uff0c\u8bf7\u5e2e\u6211\u89e3\u91ca"}`,
    `curl ${"\u8fd9\u4e2a\u9875\u9762\u5e76\u603b\u7ed3"}`,
    "git status 说明内容",
    "git diff 解释",
    "npm test 总结",
    "git show 分析",
    "curl https://example.com 帮我看",
    "git status 为什么",
    "npm test 含义",
  ])("classifies command-shaped requests as prompts: %s", (raw) => {
    expect(detectSource(raw).kind).toBe("prompt");
  });

  it("requires an unfenced command to occupy exactly one line", () => {
    expect(detectSource("git status\nnpm test").kind).toBe("text");
  });

  it("keeps fenced code ahead of prompt semantics", () => {
    expect(detectSource("```sh\nnpm install failed, please help me\n```").kind).toBe("code");
  });

  it.each([
    "npm install astro",
    "git status",
    "curl https://example.com",
    "npm install",
    "pnpm add cheerio",
    "yarn test",
    "git status --short",
    "npx tsc --noEmit",
    "$ curl https://example.com",
  ])("recognizes a bounded command pattern: %s", (raw) => {
    expect(detectSource(raw).kind).toBe("code");
  });

  it.each([
    "Summarize the key decisions in this note",
    "Build a dashboard from these notes",
    "帮我提取三个行动项",
    "What are the security risks?",
    "这个方案有哪些风险？",
  ])("recognizes instruction or question text as a prompt: %s", (raw) => {
    expect(detectSource(raw).kind).toBe("prompt");
  });

  it("accepts the maximum normalized length", () => {
    const raw = "x".repeat(MAX_SOURCE_LENGTH);
    expect(detectSource(`  ${raw}  `)).toEqual({ kind: "text", raw });
  });

  it("rejects empty or whitespace-only input", () => {
    expect(() => detectSource("")).toThrow(/empty|required/i);
    expect(() => detectSource(" \n\t ")).toThrow(/empty|required/i);
  });

  it("rejects normalized input over the length limit", () => {
    expect(() => detectSource("x".repeat(MAX_SOURCE_LENGTH + 1))).toThrow(/length|long/i);
  });
});
