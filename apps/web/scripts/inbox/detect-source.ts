export const MAX_SOURCE_LENGTH = 50_000;

export type UrlSourceKind = "feishu" | "github" | "aihot" | "web";
export type TextSourceKind = "code" | "prompt" | "text";

export type DetectedSource =
  | { kind: UrlSourceKind; raw: string; url: string }
  | { kind: TextSourceKind; raw: string };

const FEISHU_HOSTS = ["feishu.cn", "larksuite.com", "larkoffice.com"];
const COMMAND_PATTERN = /^(?:\$\s*)?(?:npm\s+(?:install|i|add|run|test|exec)|npx\s+\S+|pnpm\s+(?:add|install|run|test|exec)|yarn\s+(?:add|install|run|test|exec)|git\s+(?:clone|status|log|diff|show|add|commit|push|pull|fetch|checkout|switch|branch|merge|rebase|reset|restore|rev-parse)|curl\s+\S+|wget\s+\S+|node\s+\S+|deno\s+\S+|bun\s+\S+)(?:\s+[^\r\n]*)?$/i;
const ENGLISH_PROMPT_PATTERN = /^(?:please\b|help\s+me\b|can\s+you\b|could\s+you\b|would\s+you\b|how\b|what\b|why\b|when\b|where\b|which\b|who\b|summarize\b|analyse\b|analyze\b|explain\b|compare\b|review\b|identify\b|extract\b|build\b|create\b|write\b|draft\b|find\b|list\b|tell\s+me\b)/i;
const CJK_PROMPT_PATTERN = /^(?:请|請|帮我|幫我|分析|总结|總結|解释|解釋|比较|比較|评估|評估|提取|生成|创建|建立|写|寫|列出|查找|找出|告诉我|告訴我|如何|为什么|為什麼|什么|什麼|哪些|哪个|哪個|是否|能否|可以)/u;

export function detectSource(input: string): DetectedSource {
  const raw = input.trim();
  if (!raw) throw new Error("Source input is required and cannot be empty");
  if (raw.length > MAX_SOURCE_LENGTH) {
    throw new Error(`Source input exceeds the ${MAX_SOURCE_LENGTH} character length limit`);
  }

  const url = parseHttpUrl(raw);
  if (url) {
    return {
      kind: classifyHostname(url.hostname),
      raw,
      url: url.toString(),
    };
  }

  if (isFencedCode(raw)) return { kind: "code", raw };
  if (isPrompt(raw) || hasConversationalRequest(raw)) return { kind: "prompt", raw };
  if (isSingleLineCommand(raw)) return { kind: "code", raw };
  return { kind: "text", raw };
}

function parseHttpUrl(raw: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
}

function classifyHostname(hostname: string): UrlSourceKind {
  const host = hostname.toLowerCase();
  if (FEISHU_HOSTS.some((domain) => isDomainOrSubdomain(host, domain))) return "feishu";
  if (isDomainOrSubdomain(host, "github.com")) return "github";
  if (isDomainOrSubdomain(host, "aihot.virxact.com")) return "aihot";
  return "web";
}

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isFencedCode(raw: string): boolean {
  return /^```[^\r\n]*\r?\n[\s\S]*\r?\n```$/.test(raw);
}

function isSingleLineCommand(raw: string): boolean {
  return !/[\r\n]/.test(raw) && COMMAND_PATTERN.test(raw);
}

function hasConversationalRequest(raw: string): boolean {
  return /\b(?:can|could|would)\s+you\b|\bplease\b|\bhelp\s+me\b|\b(?:explain|summari[sz]e|analy[sz]e|review)\b/i.test(raw)
    || /[\u8bf7\u5e2e]|\u5e2e\u6211|\u89e3\u91ca|\u603b\u7ed3|\u5206\u6790|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5982\u4f55|\u80fd\u5426|\u53ef\u4ee5|\uff1f/u.test(raw);
}

function isPrompt(raw: string): boolean {
  return raw.endsWith("?")
    || raw.endsWith("？")
    || ENGLISH_PROMPT_PATTERN.test(raw)
    || CJK_PROMPT_PATTERN.test(raw);
}
