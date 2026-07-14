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
      if (existingDraftIds.length > 1) {
        throw new Error(`Multiple draft checkpoints found for Inbox record ${record.record_id}`);
      }

      const contentRecords = await client.listRecords(config.FEISHU_CONTENT_TABLE_ID);
      const matchingDrafts = contentRecords
        .filter(({ fields }) => fields[CONTENT.sourceInboxRecordId] === record.record_id);
      if (matchingDrafts.length > 1) {
        throw new Error(
          `Multiple drafts found for Inbox record ${record.record_id}; manual handling required`,
        );
      }
      const matchedDraft = matchingDrafts[0];
      const checkpointDraftId = existingDraftIds[0];
      if (matchedDraft && matchedDraft.fields[CONTENT.publicationStatus] !== BASE_VALUES.content.draft) {
        throw new Error(
          `Non-draft Content found for Inbox record ${record.record_id}; manual handling required`,
        );
      }
      if (checkpointDraftId && matchedDraft?.record_id !== checkpointDraftId) {
        throw new Error(
          `Draft checkpoint conflicts with source record for Inbox record ${record.record_id}; manual handling required`,
        );
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

      const draft = matchedDraft
        ?? await client.createRecord(
          config.FEISHU_CONTENT_TABLE_ID,
          contentFields(record.record_id, detected, proposal),
        );

      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, {
        [INBOX.relatedDraftContent]: [draft.record_id],
      });

      for (const [order, copyBlock] of proposal.copyBlocks.entries()) {
        const copyKey = `${record.record_id}:${order}`;
        const copyFields = compact({
          [COPY.relatedContent]: [draft.record_id],
          [COPY.title]: copyBlock.title,
          [COPY.type]: copyBlock.type,
          [COPY.language]: copyBlock.language,
          [COPY.content]: copyBlock.content,
          [COPY.order]: order,
          [COPY.note]: copyBlock.note,
          [COPY.sourceInboxCopyBlockKey]: copyKey,
        });
        const matchingCopies = (await client.listRecords(config.FEISHU_COPY_BLOCKS_TABLE_ID))
          .filter(({ fields }) => fields[COPY.sourceInboxCopyBlockKey] === copyKey);
        if (matchingCopies.length > 1) {
          throw new Error(`Multiple Copy Blocks found for key ${copyKey}; manual handling required`);
        }
        if (matchingCopies[0]) {
          if (!copyBlockMatches(matchingCopies[0], draft.record_id, copyFields)) {
            throw new Error(`Copy Block conflict found for key ${copyKey}; manual handling required`);
          }
          continue;
        }
        await client.createRecord(config.FEISHU_COPY_BLOCKS_TABLE_ID, copyFields);
      }

      await client.updateRecord(config.FEISHU_INBOX_TABLE_ID, record.record_id, compact({
        [INBOX.processingStatus]: BASE_VALUES.inbox.reviewRequired,
        [INBOX.detectedSourceType]: detected.kind,
        [INBOX.suggestedContentType]: proposal.contentType,
        [INBOX.suggestedCategory]: proposal.category,
        [INBOX.generatedTitle]: proposal.title,
        [INBOX.generatedSummary]: proposal.summary,
        [INBOX.generatedRecommendationReason]: proposal.recommendationReason,
        [INBOX.generatedRecommendationTrack]: proposal.recommendationTrack,
        [INBOX.generatedTimeToValue]: proposal.timeToValue,
        [INBOX.generatedAdoptionLevel]: proposal.adoptionLevel,
        [INBOX.generatedTakeaway]: proposal.takeaway,
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
    [CONTENT.recommendationTrack]: proposal.recommendationTrack,
    [CONTENT.timeToValue]: proposal.timeToValue,
    [CONTENT.adoptionLevel]: proposal.adoptionLevel,
    [CONTENT.networkRequirement]: proposal.networkRequirement,
    [CONTENT.takeaway]: proposal.takeaway,
    [CONTENT.tags]: proposal.tags,
    ...sourceFields,
    [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
    [CONTENT.generatedFromInbox]: [inboxRecordId],
    [CONTENT.sourceInboxRecordId]: inboxRecordId,
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
      const source = entry as Record<string, unknown>;
      if (Array.isArray(source.record_ids)) {
        return source.record_ids.filter((recordId): recordId is string => (
          typeof recordId === "string" && Boolean(recordId)
        ));
      }
      const recordId = source.record_id ?? source.id;
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

function copyBlockMatches(
  record: RawFeishuRecord,
  draftRecordId: string,
  expectedFields: Record<string, unknown>,
): boolean {
  const linkedIds = linkedRecordIds(record.fields[COPY.relatedContent]);
  if (linkedIds.length !== 1 || linkedIds[0] !== draftRecordId) return false;

  return [COPY.title, COPY.type, COPY.language, COPY.content, COPY.order, COPY.note]
    .every((field) => record.fields[field] === expectedFields[field]);
}
