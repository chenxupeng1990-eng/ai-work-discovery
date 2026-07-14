import { describe, expect, it, vi } from "vitest";
import type { DraftProposal } from "../../scripts/inbox/ai-enricher";
import { BASE_FIELDS, BASE_VALUES } from "../../scripts/feishu/fields";
import type { RawFeishuRecord } from "../../scripts/feishu/client";
import { processPendingInbox } from "../../scripts/inbox/process-inbox";

const CONTENT = BASE_FIELDS.content;
const COPY = BASE_FIELDS.copyBlock;
const INBOX = BASE_FIELDS.inbox;
const COPY_SOURCE_KEY = BASE_FIELDS.copyBlock.sourceInboxCopyBlockKey;

const proposal: DraftProposal = {
  title: "Review me",
  summary: "Bounded summary",
  recommendationReason: "Reusable workflow",
  recommendationTrack: "工作提效",
  timeToValue: "10 分钟",
  adoptionLevel: "直接使用",
  takeaway: "复制提示词并完成一次可审核的草稿生成。",
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
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_CONTENT_TABLE_ID) {
          events.push("list:content");
        }
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
      "list:content",
      "detect:success",
      "fetch:success",
      "enrich:success",
      "create:content",
      "update:inbox-success:checkpoint",
      "create:copy:0",
    ]);

    const contentWrite = creates.find(({ tableId }) => tableId === config.FEISHU_CONTENT_TABLE_ID);
    expect(contentWrite?.fields).toEqual({
      [CONTENT.title]: proposal.title,
      [CONTENT.type]: proposal.contentType,
      [CONTENT.category]: proposal.category,
      [CONTENT.summary]: proposal.summary,
      [CONTENT.recommendationReason]: proposal.recommendationReason,
      [CONTENT.recommendationTrack]: proposal.recommendationTrack,
      [CONTENT.timeToValue]: proposal.timeToValue,
      [CONTENT.adoptionLevel]: proposal.adoptionLevel,
      [CONTENT.takeaway]: proposal.takeaway,
      [CONTENT.tags]: proposal.tags,
      [CONTENT.originalUrl]: "https://example.com/success",
      [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
      [CONTENT.generatedFromInbox]: ["inbox-success"],
      [CONTENT.sourceInboxRecordId]: "inbox-success",
    });
    expect(contentWrite?.fields).not.toHaveProperty(CONTENT.publicLevel);
    expect(Object.keys(contentWrite?.fields ?? {}).sort()).toEqual([
      CONTENT.title,
      CONTENT.type,
      CONTENT.category,
      CONTENT.summary,
      CONTENT.recommendationReason,
      CONTENT.recommendationTrack,
      CONTENT.timeToValue,
      CONTENT.adoptionLevel,
      CONTENT.takeaway,
      CONTENT.tags,
      CONTENT.originalUrl,
      CONTENT.publicationStatus,
      CONTENT.generatedFromInbox,
      CONTENT.sourceInboxRecordId,
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
        [COPY_SOURCE_KEY]: "inbox-success:0",
      },
      {
        [COPY.relatedContent]: ["draft-1"],
        [COPY.title]: proposal.copyBlocks[1]?.title,
        [COPY.type]: proposal.copyBlocks[1]?.type,
        [COPY.language]: proposal.copyBlocks[1]?.language,
        [COPY.content]: proposal.copyBlocks[1]?.content,
        [COPY.order]: 1,
        [COPY.note]: proposal.copyBlocks[1]?.note,
        [COPY_SOURCE_KEY]: "inbox-success:1",
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
      [INBOX.generatedRecommendationTrack]: proposal.recommendationTrack,
      [INBOX.generatedTimeToValue]: proposal.timeToValue,
      [INBOX.generatedAdoptionLevel]: proposal.adoptionLevel,
      [INBOX.generatedTakeaway]: proposal.takeaway,
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

  it("reuses the original draft when checkpoint update failed before a retry", async () => {
    const inbox = record("inbox-retry", {
      [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
      [INBOX.rawContent]: "plain idea",
    });
    const contentRecords: RawFeishuRecord[] = [];
    const contentCreates = vi.fn(async (_tableId: string, fields: Record<string, unknown>) => {
      const draft = record("draft-original", fields);
      contentRecords.push(draft);
      return draft;
    });
    let failCheckpoint = true;
    const client = {
      async listRecords(tableId: string) {
        return tableId === config.FEISHU_INBOX_TABLE_ID ? [inbox] : contentRecords;
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        if (fields[INBOX.relatedDraftContent] && failCheckpoint) {
          failCheckpoint = false;
          throw new Error("checkpoint update failed");
        }
        Object.assign(inbox.fields, fields);
        return record(recordId, fields);
      },
      async createRecord(tableId: string, fields: Record<string, unknown>) {
        if (tableId !== config.FEISHU_CONTENT_TABLE_ID) {
          throw new Error("no copy blocks expected");
        }
        return contentCreates(tableId, fields);
      },
    };
    const noCopyProposal = { ...proposal, copyBlocks: [] };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => noCopyProposal,
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });

    inbox.fields[INBOX.processingStatus] = BASE_VALUES.inbox.pending;
    delete inbox.fields[INBOX.relatedDraftContent];

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => noCopyProposal,
    })).resolves.toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(contentCreates).toHaveBeenCalledTimes(1);
    expect(inbox.fields[INBOX.relatedDraftContent]).toEqual(["draft-original"]);
  });

  it("recovers an existing draft by source inbox record id", async () => {
    const updates: Record<string, unknown>[] = [];
    const createRecord = vi.fn();
    const client = {
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_INBOX_TABLE_ID) {
          return [record("inbox-existing", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
            [INBOX.rawContent]: "plain idea",
          })];
        }
        return [record("draft-existing", {
          [CONTENT.sourceInboxRecordId]: "inbox-existing",
          [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
        })];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        updates.push(fields);
        return record(recordId, fields);
      },
      createRecord,
    };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => ({ ...proposal, copyBlocks: [] }),
    })).resolves.toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(createRecord).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ [INBOX.relatedDraftContent]: ["draft-existing"] });
    expect(updates.at(-1)).toMatchObject({
      [INBOX.processingStatus]: BASE_VALUES.inbox.reviewRequired,
      [INBOX.relatedDraftContent]: ["draft-existing"],
    });
  });

  it("fails safely when multiple drafts have the same source inbox record id", async () => {
    const updates: Record<string, unknown>[] = [];
    const createRecord = vi.fn();
    const client = {
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_INBOX_TABLE_ID) {
          return [record("inbox-duplicate", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
            [INBOX.rawContent]: "plain idea",
          })];
        }
        return [
          record("draft-a", {
            [CONTENT.sourceInboxRecordId]: "inbox-duplicate",
            [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
          }),
          record("draft-b", {
            [CONTENT.sourceInboxRecordId]: "inbox-duplicate",
            [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
          }),
        ];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        updates.push(fields);
        return record(recordId, fields);
      },
      createRecord,
    };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => ({ ...proposal, copyBlocks: [] }),
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
    expect(createRecord).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({
      [INBOX.processingStatus]: BASE_VALUES.inbox.failed,
    });
    expect(String(updates.at(-1)?.[INBOX.errorMessage])).toMatch(/multiple drafts/i);
  });

  it("fails safely when the unique source match is already published", async () => {
    const updates: Record<string, unknown>[] = [];
    const createRecord = vi.fn();
    const client = {
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_INBOX_TABLE_ID) {
          return [record("inbox-published", {
            [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
            [INBOX.rawContent]: "plain idea",
          })];
        }
        return [record("content-published", {
          [CONTENT.sourceInboxRecordId]: "inbox-published",
          [CONTENT.publicationStatus]: "已发布",
        })];
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        updates.push(fields);
        return record(recordId, fields);
      },
      createRecord,
    };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => ({ ...proposal, copyBlocks: [] }),
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
    expect(createRecord).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({
      [INBOX.processingStatus]: BASE_VALUES.inbox.failed,
    });
    expect(String(updates.at(-1)?.[INBOX.errorMessage])).toMatch(/manual|浜哄伐|published|non-draft/i);
  });

  it("retries copy block writes without duplicating completed orders", async () => {
    const inbox = record("inbox-copy-retry", {
      [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
      [INBOX.rawContent]: "plain idea",
    });
    const contentRecords = [record("draft-copy-retry", {
      [CONTENT.sourceInboxRecordId]: inbox.record_id,
      [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
    })];
    const copyRecords: RawFeishuRecord[] = [];
    let failSecondCopy = true;
    const copyCreates = vi.fn(async (_tableId: string, fields: Record<string, unknown>) => {
      if (fields[COPY.order] === 1 && failSecondCopy) {
        failSecondCopy = false;
        throw new Error("second copy write failed");
      }
      const created = record(`copy-${copyRecords.length}`, fields);
      copyRecords.push(created);
      return created;
    });
    const client = {
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_INBOX_TABLE_ID) return [inbox];
        if (tableId === config.FEISHU_CONTENT_TABLE_ID) return contentRecords;
        return copyRecords;
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        Object.assign(inbox.fields, fields);
        return record(recordId, fields);
      },
      async createRecord(tableId: string, fields: Record<string, unknown>) {
        if (tableId === config.FEISHU_COPY_BLOCKS_TABLE_ID) {
          return copyCreates(tableId, fields);
        }
        throw new Error("no content create expected");
      },
    };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => proposal,
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });

    inbox.fields[INBOX.processingStatus] = BASE_VALUES.inbox.pending;
    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => proposal,
    })).resolves.toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: 0 });

    expect(copyCreates).toHaveBeenCalledTimes(3);
    expect(copyRecords.map(({ fields }) => fields[COPY.order])).toEqual([0, 1]);
    expect(copyRecords.map(({ fields }) => fields[COPY_SOURCE_KEY])).toEqual([
      "inbox-copy-retry:0",
      "inbox-copy-retry:1",
    ]);
  });

  it.each([
    {
      name: "multiple records",
      records: [
        record("copy-a", { [COPY_SOURCE_KEY]: "inbox-copy-conflict:0" }),
        record("copy-b", { [COPY_SOURCE_KEY]: "inbox-copy-conflict:0" }),
      ],
    },
    {
      name: "a different draft link",
      records: [record("copy-a", {
        [COPY_SOURCE_KEY]: "inbox-copy-conflict:0",
        [COPY.relatedContent]: ["other-draft"],
      })],
    },
    {
      name: "conflicting public fields",
      records: [record("copy-a", {
        [COPY_SOURCE_KEY]: "inbox-copy-conflict:0",
        [COPY.relatedContent]: ["draft-copy-conflict"],
        [COPY.title]: "Different title",
        [COPY.type]: proposal.copyBlocks[0]?.type,
        [COPY.language]: proposal.copyBlocks[0]?.language,
        [COPY.content]: proposal.copyBlocks[0]?.content,
        [COPY.order]: 0,
      })],
    },
  ])("fails safely when a copy block key has $name", async ({ records: existingCopies }) => {
    const inbox = record("inbox-copy-conflict", {
      [INBOX.processingStatus]: BASE_VALUES.inbox.pending,
      [INBOX.rawContent]: "plain idea",
    });
    const createRecord = vi.fn();
    const updates: Record<string, unknown>[] = [];
    const client = {
      async listRecords(tableId: string) {
        if (tableId === config.FEISHU_INBOX_TABLE_ID) return [inbox];
        if (tableId === config.FEISHU_CONTENT_TABLE_ID) {
          return [record("draft-copy-conflict", {
            [CONTENT.sourceInboxRecordId]: inbox.record_id,
            [CONTENT.publicationStatus]: BASE_VALUES.content.draft,
          })];
        }
        return existingCopies;
      },
      async updateRecord(_tableId: string, recordId: string, fields: Record<string, unknown>) {
        updates.push(fields);
        return record(recordId, fields);
      },
      createRecord,
    };

    await expect(processPendingInbox(client as never, config, {
      detect: () => ({ kind: "text", raw: "plain idea" }),
      enrich: async () => ({ ...proposal, copyBlocks: [proposal.copyBlocks[0]!] }),
    })).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: 0 });
    expect(createRecord).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ [INBOX.processingStatus]: BASE_VALUES.inbox.failed });
  });
});
