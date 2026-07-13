import { describe, expect, it, vi } from "vitest";
import type { DraftProposal } from "../../scripts/inbox/ai-enricher";
import { BASE_FIELDS, BASE_VALUES } from "../../scripts/feishu/fields";
import type { RawFeishuRecord } from "../../scripts/feishu/client";
import { processPendingInbox } from "../../scripts/inbox/process-inbox";

const CONTENT = BASE_FIELDS.content;
const COPY = BASE_FIELDS.copyBlock;
const INBOX = BASE_FIELDS.inbox;

const proposal: DraftProposal = {
  title: "Review me",
  summary: "Bounded summary",
  recommendationReason: "Reusable workflow",
  contentType: "Tool",
  category: "Engineering",
  tags: ["Codex"],
  publicationStatus: "草稿",
  copyBlocks: [
    {
      title: "Second source item",
      type: "Command",
      language: "shell",
      content: "npm test",
    },
    {
      title: "First source item",
      type: "Prompt",
      language: "text",
      content: "Review this",
      note: "Human check",
    },
  ],
};

const config = {
  FEISHU_APP_ID: "app-id",
  FEISHU_APP_SECRET: "feishu-secret-value",
  FEISHU_BASE_APP_TOKEN: "base-token",
  FEISHU_CONTENT_TABLE_ID: "content-table",
  FEISHU_COPY_BLOCKS_TABLE_ID: "copy-table",
  FEISHU_INBOX_TABLE_ID: "inbox-table",
  AI_BASE_URL: "https://api.example.com/v1",
  AI_API_KEY: "ai-secret-value",
  AI_MODEL: "review-model",
};

const record = (record_id: string, fields: Record<string, unknown>): RawFeishuRecord => ({
  record_id,
  fields,
});

describe("processPendingInbox", () => {
  it("creates review-only drafts with checkpointed copy blocks and isolates record failures", async () => {
    const events: string[] = [];
    const updates: Array<{ recordId: string; fields: Record<string, unknown> }> = [];
    const creates: Array<{ tableId: string; fields: Record<string, unknown> }> = [];
    let copyId = 0;
    const client = {
      async listRecords() {
        return [
          record("inbox-success", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
            [INBOX.rawContent]: "https://example.com/success",
            [INBOX.editorNote]: "editor note",
            Cookie: "session=never-send",
          }),
          record("inbox-skipped", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.reviewRequired,
            [INBOX.rawContent]: "https://example.com/skipped",
          }),
          record("inbox-failure", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
            [INBOX.rawContent]: "https://example.com/failure",
          }),
        ];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        events.push(`update:${recordId}:${String(fields[INBOX.processingStatus] ?? "checkpoint")}`);
        updates.push({ recordId, fields });
        return record(recordId, fields);
      },
      async createRecord(tableId: string, fields: Record<string, unknown>) {
        creates.push({ tableId, fields });
        if (tableId === config.FEISHU_CONTENT_TABLE_ID) {
          events.push("create:content");
          return record("draft-1", fields);
        }
        events.push(`create:copy:${String(fields[COPY.order])}`);
        copyId += 1;
        return record(`copy-${copyId}`, fields);
      },
    };
    const detect = vi.fn((raw: string) => {
      events.push(`detect:${raw.endsWith("failure") ? "failure" : "success"}`);
      return { kind: "web" as const, raw, url: raw };
    });
    const fetchMetadata = vi.fn(async (url: string) => {
      events.push(`fetch:${url.endsWith("failure") ? "failure" : "success"}`);
      return {
        sourceUrl: url,
        finalUrl: url,
        contentType: "text/html" as const,
        title: url,
      };
    });
    const enrich = vi.fn(async ({ metadata }: { metadata: { finalUrl: string } }) => {
      events.push(`enrich:${metadata.finalUrl.endsWith("failure") ? "failure" : "success"}`);
      if (metadata.finalUrl.endsWith("failure")) {
        const error = new Error(
          "Bearer ai-secret-value failed at https://user:password@example.com/private?token=hidden",
        );
        error.stack = `${error.message}\n at internal secret stack`;
        throw error;
      }
      return { ...proposal, publicationStatus: "已发布" as never };
    });

    const summary = await processPendingInbox(client as never, config, {
      detect,
      fetchMetadata,
      enrich: enrich as never,
      now: () => new Date("2026-07-14T00:00:00.000Z"),
    });

    expect(summary).toEqual({ processed: 2, succeeded: 1, failed: 1, skipped: 1 });
    expect(detect).toHaveBeenCalledTimes(2);
    expect(events.slice(0, 8)).toEqual([
      `update:inbox-success:${BASE_VALUES.inbox.processing}`,
      "detect:success",
      "fetch:success",
      "enrich:success",
      "create:content",
      "update:inbox-success:checkpoint",
      "create:copy:0",
      "create:copy:1",
    ]);

    const contentWrite = creates.find(({ tableId }) => tableId === config.FEISHU_CONTENT_TABLE_ID);
    expect(contentWrite?.fields).toEqual({
      [CONTENT.title]: proposal.title,
      [CONTENT.type]: proposal.contentType,
      [CONTENT.category]: proposal.category,
      [CONTENT.summary]: proposal.summary,
      [CONTENT.recommendationReason]: proposal.recommendationReason,
      [CONTENT.tags]: proposal.tags,
      [CONTENT.originalUrl]: "https://example.com/success",
      [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
      [CONTENT.generatedFromInbox]: ["inbox-success"],
    });
    expect(contentWrite?.fields).not.toHaveProperty(CONTENT.publicLevel);
    expect(Object.keys(contentWrite?.fields ?? {}).sort()).toEqual([
      CONTENT.title,
      CONTENT.type,
      CONTENT.category,
      CONTENT.summary,
      CONTENT.recommendationReason,
      CONTENT.tags,
      CONTENT.originalUrl,
      CONTENT.publicationStatus,
      CONTENT.generatedFromInbox,
    ].sort());

    const copyWrites = creates.filter(({ tableId }) => tableId === config.FEISHU_COPY_BLOCKS_TABLE_ID);
    expect(copyWrites.map(({ fields }) => fields)).toEqual([
      {
        [COPY.relatedContent]: ["draft-1"],
        [COPY.title]: proposal.copyBlocks[0]?.title,
        [COPY.type]: proposal.copyBlocks[0]?.type,
        [COPY.language]: proposal.copyBlocks[0]?.language,
        [COPY.content]: proposal.copyBlocks[0]?.content,
        [COPY.order]: 0,
      },
      {
        [COPY.relatedContent]: ["draft-1"],
        [COPY.title]: proposal.copyBlocks[1]?.title,
        [COPY.type]: proposal.copyBlocks[1]?.type,
        [COPY.language]: proposal.copyBlocks[1]?.language,
        [COPY.content]: proposal.copyBlocks[1]?.content,
        [COPY.order]: 1,
        [COPY.note]: proposal.copyBlocks[1]?.note,
      },
    ]);

    const successUpdates = updates.filter(({ recordId }) => recordId === "inbox-success");
    expect(successUpdates[1]?.fields).toEqual({
      [INBOX.relatedDraftContent]: ["draft-1"],
    });
    expect(successUpdates.at(-1)?.fields).toMatchObject({
      [INBOX.processingStatus]: BASE_VALUES.inbox.reviewRequired,
      [INBOX.relatedDraftContent]: ["draft-1"],
      [INBOX.generatedTitle]: proposal.title,
      [INBOX.generatedSummary]: proposal.summary,
      [INBOX.generatedRecommendationReason]: proposal.recommendationReason,
      [INBOX.processedAt]: "2026-07-14T00:00:00.000Z",
    });

    const failureUpdate = updates.at(-1);
    expect(failureUpdate).toMatchObject({
      recordId: "inbox-failure",
      fields: { [INBOX.processingStatus]: BASE_VALUES.inbox.failed },
    });
    const errorMessage = String(failureUpdate?.fields[INBOX.errorMessage]);
    expect(errorMessage.length).toBeLessThanOrEqual(240);
    expect(errorMessage).not.toMatch(/ai-secret-value|feishu-secret-value|Bearer|password|token=|internal secret stack/);
  });

  it("checkpoints a created draft before copy writes and refuses silent duplicate retries", async () => {
    const events: string[] = [];
    const firstClient = {
      async listRecords() {
        return [record("inbox-partial", {
          [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
          [INBOX.rawContent]: "plain idea",
        })];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        const draftLinks = fields[INBOX.relatedDraftContent];
        const marker = Array.isArray(draftLinks) ? draftLinks[0] : fields[INBOX.processingStatus];
        events.push(`update:${String(marker)}`);
        return record(recordId, fields);
      },
      async createRecord(tableId: string, fields: Record<string, unknown>) {
        if (tableId === config.FEISHU_CONTENT_TABLE_ID) {
          events.push("create:content");
          return record("draft-partial", fields);
        }
        events.push("create:copy");
        throw new Error("copy write failed");
      },
    };

    await expect(processPendingInbox(firstClient as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => proposal,
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
    expect(events.indexOf("update:draft-partial")).toBeLessThan(events.indexOf("create:copy"));

    const createRecord = vi.fn();
    const retryClient = {
      async listRecords() {
        return [record("inbox-partial", {
          [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
          [INBOX.rawContent]: "plain idea",
          [INBOX.relatedDraftContent]: ["draft-partial"],
        })];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        return record(recordId, fields);
      },
      createRecord,
    };

    await expect(processPendingInbox(retryClient as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => proposal,
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
    expect(createRecord).not.toHaveBeenCalled();
  });
});
