import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  ContentItemSchema,
  PublicDatasetSchema,
  type ContentItem,
  type CopyBlock,
  type PublicDataset,
} from "../../src/lib/schema";
import { downloadAsset as retrieveAsset } from "./assets";

const DEFAULT_GENERATED_DIRECTORY = resolve("src/generated");
const CONTROLLED_DOWNLOADED_PATH = /^\/images\/content\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/;

const FALLBACK_BY_TYPE: Record<ContentItem["type"], string> = {
  "AI Signal": "/images/fallback-ai-signal.webp",
  Case: "/images/fallback-case.webp",
  Collaboration: "/images/fallback-collaboration.webp",
  "Getting Started": "/images/fallback-getting-started.webp",
  Inspiration: "/images/fallback-inspiration.webp",
  Skill: "/images/fallback-skill.webp",
  Tool: "/images/fallback-tool.webp",
};

type AssetSources = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

export interface BuildPublicDatasetOptions {
  assets?: AssetSources;
  clock?: () => Date;
  downloadAsset?: (sourceUrl: string) => Promise<string>;
}

export interface WritePublicDatasetOptions {
  generatedDir?: string;
}

export async function buildPublicDataset(
  items: readonly ContentItem[],
  options: BuildPublicDatasetOptions = {},
): Promise<PublicDataset> {
  const downloader = options.downloadAsset ?? retrieveAsset;
  const publicItems = await Promise.all(items.map(async (item) => {
    const publicItem = copyPublicItem(item);
    const sourceUrl = getAssetSource(options.assets, item.coverImage);
    if (!sourceUrl) {
      publicItem.coverImage = FALLBACK_BY_TYPE[publicItem.type];
      return ContentItemSchema.parse(publicItem);
    }

    let downloadedPath: string;
    try {
      downloadedPath = await downloader(sourceUrl);
    } catch {
      publicItem.coverImage = FALLBACK_BY_TYPE[publicItem.type];
      return ContentItemSchema.parse(publicItem);
    }
    if (!CONTROLLED_DOWNLOADED_PATH.test(downloadedPath)) {
      throw new Error("Downloaded asset path must stay inside /images/content");
    }
    publicItem.coverImage = downloadedPath;
    return ContentItemSchema.parse(publicItem);
  }));

  publicItems.sort((left, right) => (
    right.sortWeight - left.sortWeight
    || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    || compareText(left.id, right.id)
  ));

  return PublicDatasetSchema.parse({
    generatedAt: (options.clock ?? (() => new Date()))().toISOString(),
    items: publicItems,
  });
}

export async function writePublicDataset(
  dataset: PublicDataset,
  options: WritePublicDatasetOptions = {},
): Promise<void> {
  const generatedDir = options.generatedDir ?? DEFAULT_GENERATED_DIRECTORY;
  const temporaryPath = join(generatedDir, "content.tmp.json");
  const finalPath = join(generatedDir, "content.json");
  let file: Awaited<ReturnType<typeof open>> | undefined;

  await mkdir(generatedDir, { recursive: true });
  try {
    file = await open(temporaryPath, "wx");
    await file.writeFile(`${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    await file.sync();
    await file.close();
    file = undefined;

    const persisted = JSON.parse(await readFile(temporaryPath, "utf8"));
    PublicDatasetSchema.parse(persisted);
    await rename(temporaryPath, finalPath);
  } catch (error) {
    await file?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function copyPublicItem(item: ContentItem): ContentItem {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    type: item.type,
    category: item.category,
    summary: item.summary,
    recommendationReason: item.recommendationReason,
    coverImage: item.coverImage,
    tags: [...item.tags],
    audience: [...item.audience],
    scenario: item.scenario,
    originalUrl: item.originalUrl,
    feishuDocumentUrl: item.feishuDocumentUrl,
    sourceName: item.sourceName,
    featured: item.featured,
    sortWeight: item.sortWeight,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    copyBlocks: item.copyBlocks.map(copyPublicCopyBlock),
  };
}

function copyPublicCopyBlock(block: CopyBlock): CopyBlock {
  return {
    id: block.id,
    title: block.title,
    type: block.type,
    language: block.language,
    content: block.content,
    order: block.order,
    note: block.note,
  };
}

function getAssetSource(assets: AssetSources | undefined, targetPath: string): string | undefined {
  if (!assets) return undefined;
  return isAssetMap(assets) ? assets.get(targetPath) : assets[targetPath];
}

function isAssetMap(assets: AssetSources): assets is ReadonlyMap<string, string> {
  return typeof (assets as ReadonlyMap<string, string>).get === "function";
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
