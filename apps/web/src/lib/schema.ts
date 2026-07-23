import { z } from "zod";

const CONTROLLED_COVER_IMAGE_PATH = /^\/images\/(?:(?:fixtures|content)\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:avif|gif|jpe?g|png|webp)|fallback-[A-Za-z0-9][A-Za-z0-9-]*\.webp)$/;
const HttpsUrlSchema = z.url({ protocol: /^https$/ });

export const RECOMMENDATION_TRACKS = [
  "灵感实验",
  "工作提效",
  "团队实践",
  "前沿信号",
] as const;

export const TIME_TO_VALUE_OPTIONS = [
  "10 分钟",
  "1 小时",
  "半天",
  "长期",
] as const;

export const ADOPTION_LEVELS = [
  "直接使用",
  "需要配置",
  "需要开发",
] as const;

export const NETWORK_REQUIREMENTS = [
  "无需 VPN",
  "部分资源需要 VPN",
  "需要 VPN",
  "无需额外配置",
  "网络条件待确认",
] as const;

export const CopyBlockSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["Prompt", "Command", "Path", "Configuration", "Code"]),
  language: z.string().min(1),
  content: z.string().min(1),
  order: z.number().int().nonnegative(),
  note: z.string().optional(),
}).strict();

export const ContentItemSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  type: z.enum([
    "Case",
    "Inspiration",
    "Collaboration",
    "Tool",
    "Skill",
    "AI Signal",
    "Getting Started",
  ]),
  category: z.string().min(1),
  summary: z.string().min(1),
  recommendationReason: z.string().min(1),
  recommendationTrack: z.enum(RECOMMENDATION_TRACKS),
  timeToValue: z.enum(TIME_TO_VALUE_OPTIONS),
  adoptionLevel: z.enum(ADOPTION_LEVELS),
  networkRequirement: z.enum(NETWORK_REQUIREMENTS),
  takeaway: z.string().min(1),
  coverImage: z.string().regex(CONTROLLED_COVER_IMAGE_PATH),
  tags: z.array(z.string()),
  audience: z.array(z.string()),
  scenario: z.string().min(1),
  originalUrl: HttpsUrlSchema.optional(),
  feishuDocumentUrl: HttpsUrlSchema.optional(),
  sourceName: z.string().min(1),
  featured: z.boolean(),
  sortWeight: z.number(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  copyBlocks: z.array(CopyBlockSchema),
}).strict();

export const PublicDatasetSchema = z.object({
  generatedAt: z.iso.datetime(),
  items: z.array(ContentItemSchema),
}).strict();

export type CopyBlock = z.infer<typeof CopyBlockSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type PublicDataset = z.infer<typeof PublicDatasetSchema>;
