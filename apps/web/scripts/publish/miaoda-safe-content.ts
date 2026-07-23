import type { ContentItem, PublicDataset } from "../../src/lib/schema";

export const MIAODA_SAFE_EXCLUDED_SLUGS = [
  "ai-recruiting-copilot-agent-workflow",
  "doudian-review-exporter-customer-voice",
  "douyin-creator-data-collector-jsonl",
] as const;

const excludedSlugs = new Set<string>(MIAODA_SAFE_EXCLUDED_SLUGS);

function sanitizeText(value: string): string {
  return value.replace(/\bVPN\b/giu, "额外网络条件");
}

export function toMiaodaSafeItem(item: ContentItem): ContentItem {
  return {
    ...item,
    title: sanitizeText(item.title),
    summary: sanitizeText(item.summary),
    recommendationReason: sanitizeText(item.recommendationReason),
    networkRequirement: item.networkRequirement === "无需 VPN"
      ? "无需额外配置"
      : "网络条件待确认",
    takeaway: sanitizeText(item.takeaway),
    tags: item.tags.map(sanitizeText),
    audience: item.audience.map(sanitizeText),
    scenario: sanitizeText(item.scenario),
    sourceName: sanitizeText(item.sourceName),
    copyBlocks: item.copyBlocks.map((block) => ({
      ...block,
      title: sanitizeText(block.title),
      content: sanitizeText(block.content),
      note: block.note ? sanitizeText(block.note) : undefined,
    })),
  };
}

export function buildMiaodaSafeDataset(dataset: PublicDataset): PublicDataset {
  return {
    ...dataset,
    items: dataset.items
      .filter((item) => !excludedSlugs.has(item.slug))
      .map(toMiaodaSafeItem),
  };
}
