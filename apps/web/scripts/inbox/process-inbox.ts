import type { SyncConfig } from "../config";
import type { FeishuClient, RawFeishuRecord } from "../feishu/client";
import { BASE_FIELDS, BASE_VALUES } from "../feishu/fields";
import {
  enrichDraft,
  type AIEnrichmentInput,
  type DraftProposal,
} from "./ai-enricher";
import { detectSource, type DetectedSource } from "./detect-source";
import { fetchPublicMetadata, type SourceMetadata } from "./fetch-metadata";

const CONTENT = BASE_FIELDS.content;
const COPY = BASE_FIELDS.copyBlock;
const INBOX = BASE_FIELDS.inbox;
const MAX_ERROR_LENGTH = 240;

type InboxClient = Pick<FeishuClient, "listRecords" | "createRecord" | "updateRecord">;

export interface InboxProcessingSummary {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface ProcessInboxDependencies {
  detect?: typeof detectSource;
  fetchMetadata?: (url: string) => Promise<SourceMetadata>;
  enrich?: (input: AIEnrichmentInput) => Promise<DraftProposal>;
  now?: () => Date;
}

export async function processPendingInbox(
  client: InboxClient,
  config: SyncConfig,
  dependencies: ProcessInboxDependencies = {},
): Promise<InboxProcessingSummary> {
  const records = await client.listRecords(config.FEISHU_INBOX_TABLE_ID);
  const summary: InboxProcessingSummary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const record of records) {
    if (record.fields[INBOX.processingStatus] !== BASE_VALUES.inbox.pending) {
      summary.skipped += 1;
      continue;
    }

    summary.processed += 1;
    try {
      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, {
        [INBOX.processingStatus]: BASE_VALUES.inbox.processing,
        [INBOX.errorMessage]: "",
      });

      const existingDraftIds = linkedRecordIds(record.fields[INBOX.relatedDraftContent]);
      if (existingDraftIds.length > 0) {
        throw new Error(`Draft checkpoint ${existingDraftIds[0]} already exists; manual recovery required`);
      }

      const rawContent = requireString(record, INBOX.rawContent);
      const editorNote = optionalString(record.fields[INBOX.editorNote]);
      const detected = (dependencies.detect ?? detectSource)(rawContent);
      const metadata = await metadataForDetectedSource(
        detected,
        dependencies.fetchMetadata ?? ((url) => fetchPublicMetadata(url)),
      );
      const proposal = await (dependencies.enrich ?? ((input) => enrichDraft(input, {
        baseUrl: config.AI_BASE_URL,
        apiKey: config.AI_API_KEY,
        model: config.AI_MODEL,
      })))({ metadata, editorNote });

      const draft = await client.createRecord(
        config.FEISHU_CONTENT_TABLE_ID,
        contentFields(record.record_id, detected, proposal),
      );

      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, {
        [INBOX.relatedDraftContent]: [draft.record_id],
      });

      for (const [order, copyBlock] of proposal.copyBlocks.entries()) {
        await client.createRecord(config.FEISHU_COPY_BLOCKS_TABLE_ID, compact({
          [COPY.relatedContent]: [draft.record_id],
          [COPY.title]: copyBlock.title,
          [COPY.type]: copyBlock.type,
          [COPY.language]: copyBlock.language,
          [COPY.content]: copyBlock.content,
          [COPY.order]: order,
          [COPY.note]: copyBlock.note,
        }));
      }

      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, compact({
        [INBOX.processingStatus]: BASE_VALUES.inbox.reviewRequired,
        [INBOX.detectedSourceType]: detected.kind,
        [INBOX.suggestedContentType]: proposal.contentType,
        [INBOX.suggestedCategory]: proposal.category,
        [INBOX.generatedTitle]: proposal.title,
        [INBOX.generatedSummary]: proposal.summary,
        [INBOX.generatedRecommendationReason]: proposal.recommendationReason,
        [INBOX.sourceUrl]: "url" in detected ? detected.url : undefined,
        [INBOX.relatedDraftContent]: [draft.record_id],
        [INBOX.errorMessage]: "",
        [INBOX.processedAt]: (dependencies.now ?? (() => new Date()))().toISOString(),
      }));
      summary.succeeded += 1;
    } catch (error) {
      summary.failed += 1;
      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, {
        [INBOX.processingStatus]: BASE_VALUES.inbox.failed,
        [INBOX.errorMessage]: safeErrorMessage(error, [
          config.FEISHU_APP_SECRET,
          config.AI_API_KEY,
        ]),
      }).catch(() => undefined);
    }
  }

  return summary;
}

function contentFields(
  inboxRecordId: string,
  detected: DetectedSource,
  proposal: DraftProposal,
): Record<string, unknown> {
  const sourceFields = "url" in detected
    ? detected.kind === "feishu"
      ? { [CONTENT.feishuDocumentUrl]: detected.url }
      : { [CONTENT.originalUrl]: detected.url }
    : {};
  return {
    [CONTENT.title]: proposal.title,
    [CONTENT.type]: proposal.contentType,
    [CONTENT.category]: proposal.category,
    [CONTENT.summary]: proposal.summary,
    [CONTENT.recommendationReason]: proposal.recommendationReason,
    [CONTENT.tags]: proposal.tags,
    ...sourceFields,
    [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
    [CONTENT.generatedFromInbox]: [inboxRecordId],
  };
}

async function metadataForDetectedSource(
  detected: DetectedSource,
  fetchMetadata: (url: string) => Promise<SourceMetadata>,
): Promise<SourceMetadata> {
  if ("url" in detected) return fetchMetadata(detected.url);
  return {
    sourceUrl: `inbox:${detected.kind}`,
    finalUrl: `inbox:${detected.kind}`,
    contentType: "text/plain",
    description: detected.raw.replace(/\s+/g, " ").trim().slice(0, 500),
  };
}

function requireString(record: RawFeishuRecord, field: string): string {
  const value = record.fields[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Inbox record ${record.record_id} is missing required field ${field}`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function linkedRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string" && entry) return [entry];
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const recordId = (entry as Record<string, unknown>).record_id;
      return typeof recordId === "string" && recordId ? [recordId] : [];
    }
    return [];
  });
}

function safeErrorMessage(error: unknown, secrets: readonly string[]): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "[redacted]");
  }
  message = message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\bBearer\s+\S+/gi, "[credential]")
    .replace(/\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "[credential]")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (message || "Inbox processing failed").slice(0, MAX_ERROR_LENGTH);
}

function compact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
