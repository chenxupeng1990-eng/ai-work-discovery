import { access, mkdir, mkdtemp, open, readFile, readdir, rename, rm } from "node:fs/promises";
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
const DEFAULT_ASSET_DIRECTORY = resolve("public/images/content");
const DEFAULT_QUARANTINE_ROOT = resolve(".asset-quarantine");
const CONTROLLED_DOWNLOADED_PATH = /^\/images\/content\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/;
const CONTROLLED_HASH_ASSET = /^[a-f0-9]{64}\.(?:jpe?g|png|webp)$/;

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

export interface PublishDatasetOptions extends WritePublicDatasetOptions {
  assetDir?: string;
  quarantineRoot?: string;
  renameFile?: (source: string, destination: string) => Promise<void>;
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

export async function publishDatasetAtomically(
  dataset: PublicDataset,
  options: PublishDatasetOptions = {},
): Promise<void> {
  const generatedDir = options.generatedDir ?? DEFAULT_GENERATED_DIRECTORY;
  const assetDir = options.assetDir ?? DEFAULT_ASSET_DIRECTORY;
  const quarantineRoot = options.quarantineRoot ?? DEFAULT_QUARANTINE_ROOT;
  const renameFile = options.renameFile ?? rename;
  const temporaryPath = join(generatedDir, "content.tmp.json");
  const finalPath = join(generatedDir, "content.json");
  const referencedAssets = collectReferencedAssets(dataset);
  let quarantineDir: string | undefined;
  let oldDatasetMoved = false;
  let newDatasetPublished = false;
  const movedAssets: Array<{ source: string; quarantine: string }> = [];

  await mkdir(generatedDir, { recursive: true });
  await mkdir(assetDir, { recursive: true });
  await writeValidatedTemporaryDataset(dataset, temporaryPath);

  try {
    const orphanNames = (await readdir(assetDir))
      .filter((name) => CONTROLLED_HASH_ASSET.test(name) && !referencedAssets.has(name));
    quarantineDir = await mkdtemp(`${quarantineRoot}-`);
    const oldDatasetPath = join(quarantineDir, "content.json");
    const assetQuarantineDir = join(quarantineDir, "assets");

    if (await pathExists(finalPath)) {
      await renameFile(finalPath, oldDatasetPath);
      oldDatasetMoved = true;
    }
    await renameFile(temporaryPath, finalPath);
    newDatasetPublished = true;

    if (orphanNames.length > 0) {
      await mkdir(assetQuarantineDir, { recursive: true });
      for (const name of orphanNames) {
        const source = join(assetDir, name);
        const quarantine = join(assetQuarantineDir, name);
        await renameFile(source, quarantine);
        movedAssets.push({ source, quarantine });
      }
    }

    await rm(quarantineDir, { recursive: true, force: true });
    quarantineDir = undefined;
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const moved of movedAssets.reverse()) {
      try {
        await renameFile(moved.quarantine, moved.source);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (newDatasetPublished) {
      try {
        await rm(finalPath, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (oldDatasetMoved && quarantineDir) {
      try {
        await renameFile(join(quarantineDir, "content.json"), finalPath);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await rm(temporaryPath, { force: true }).catch((rollbackError) => rollbackErrors.push(rollbackError));
    if (quarantineDir) {
      await rm(quarantineDir, { recursive: true, force: true })
        .catch((rollbackError) => rollbackErrors.push(rollbackError));
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Dataset publication failed and rollback was incomplete");
    }
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

async function writeValidatedTemporaryDataset(dataset: PublicDataset, temporaryPath: string): Promise<void> {
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(temporaryPath, "wx");
    await file.writeFile(`${JSON.stringify(dataset, null, 2)}\n`, "utf8");
    await file.sync();
    await file.close();
    file = undefined;
    PublicDatasetSchema.parse(JSON.parse(await readFile(temporaryPath, "utf8")));
  } catch (error) {
    await file?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function collectReferencedAssets(dataset: PublicDataset): Set<string> {
  const referenced = new Set<string>();
  for (const item of dataset.items) {
    const match = /^\/images\/content\/([^/]+)$/.exec(item.coverImage);
    if (match?.[1] && CONTROLLED_HASH_ASSET.test(match[1])) referenced.add(match[1]);
  }
  return referenced;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
