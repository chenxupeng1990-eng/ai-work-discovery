import { z } from "zod";

const CONTROLLED_COVER_IMAGE_PATH = /^\/images\/(?:(?:fixtures|content)\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:avif|gif|jpe?g|png|webp)|fallback-[A-Za-z0-9][A-Za-z0-9-]*\.webp)$/;
const HttpsUrlSchema = z.url({ protocol: /^https$/ });

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
