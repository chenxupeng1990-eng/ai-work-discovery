import type { CodexMethod } from "../data/codex-methods";

export const CODEX_METHOD_CATEGORIES = [
  "电脑维护",
  "资料处理",
  "飞书协作",
  "网页流程",
  "内容生产",
  "开发与测试",
] as const;

export type CodexMethodCategory = typeof CODEX_METHOD_CATEGORIES[number];

export function queryCodexMethods(
  methods: readonly CodexMethod[],
  query: string,
  category: "全部" | CodexMethodCategory,
): CodexMethod[] {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  return methods.filter((method) => {
    if (category !== "全部" && method.category !== category) return false;
    if (!normalized) return true;
    const searchable = [
      method.title,
      method.problem,
      method.outcome,
      method.prompt,
      method.category,
      method.caseSource?.label ?? "",
      method.capabilitySource.label,
    ].join(" ").toLocaleLowerCase("zh-CN");
    return searchable.includes(normalized);
  });
}
