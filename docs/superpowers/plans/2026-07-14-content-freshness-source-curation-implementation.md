# Content Freshness and Source Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fail-closed pre-release content audit, audit the current Feishu records, curate new actionable drafts from configured source sites, and notify the user for review.

**Architecture:** Store audit evidence in private Feishu Content fields and validate it before `mapPublishedContent` can produce a public dataset. Keep source research and AI assessment outside the browser bundle; new findings enter the existing Inbox-to-draft workflow and remain human-reviewed.

**Tech Stack:** TypeScript, Zod, Vitest, existing OpenAI-compatible enrichment client, Feishu Base via `lark-cli`, Feishu IM, Astro static publishing.

## Global Constraints

- AI recommendations and source sweeps create drafts only; no automatic publication.
- Audit fields are private and must never appear in `src/generated/content.json`.
- Release validation fails closed before atomic output replacement.
- Source summaries must provide a concrete action and verifiable takeaway, not a navigation-only link.
- Network requirements must reflect the company's no-VPN environment.

---

### Task 1: Audit Contract and Fail-Closed Release Gate

**Files:**
- Modify: `apps/web/scripts/feishu/fields.ts`
- Create: `apps/web/scripts/audit/content-audit.ts`
- Modify: `apps/web/scripts/sync-content.ts`
- Create: `apps/web/tests/unit/content-audit.test.ts`
- Modify: `apps/web/tests/unit/sync-content.test.ts`

**Interfaces:**
- Produces: `assertReleaseAudits(records: readonly RawFeishuRecord[], now: Date): void`.
- Produces: `ContentAuditProposalSchema` for structured LLM audit output.
- Consumes: published Content records before public mapping.

- [ ] **Step 1: Write failing audit-contract tests**

Test exact passing values and reject missing fields, `已过时`, `无法确认`, non-`通过` decisions, invalid dates, and `nextReviewAt <= now`. Assert draft and removed records do not block a release.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- --run tests/unit/content-audit.test.ts tests/unit/sync-content.test.ts`

Expected: FAIL because the audit contract and gate do not exist.

- [ ] **Step 3: Implement the private field names and release assertion**

Add `valueVerdict`, `freshnessVerdict`, `factualVerdict`, `auditDecision`, `auditNote`, `auditedAt`, and `nextReviewAt` to `BASE_FIELDS.content` and `PRIVATE_BASE_FIELD_NAMES.content`. Implement a strict validator that only permits published records when:

```ts
valueVerdict === "高价值" || valueVerdict === "可保留"
freshnessVerdict === "当前有效"
factualVerdict === "符合当前实际"
auditDecision === "通过"
new Date(nextReviewAt).getTime() > now.getTime()
```

Throw a typed, record-ID-only error without field values or URLs.

- [ ] **Step 4: Insert the gate before public mapping**

Call `assertReleaseAudits(contentRecords, dependencies.clock?.() ?? new Date())` immediately after Feishu reads and before `mapPublishedContent`. Wrap failure as `SyncRunError("CONTENT_AUDIT_FAILED", "audit-content", error)` and verify output replacement is never called.

- [ ] **Step 5: Run tests, check, build, and commit**

Run:

```powershell
npm test -- --run tests/unit/content-audit.test.ts tests/unit/sync-content.test.ts
npm run check
npm run build
```

Commit: `feat: gate releases on content freshness audit`

---

### Task 2: Feishu Schema and Current-Record Audit

**Files:**
- Modify: `docs/content-operations.md`
- Create: `.superpowers/sdd/content-audit-2026-07-14.md`

**Interfaces:**
- Consumes Base `OFPibny2VavSo0sNqdac9al4nWh`, Content table `tblhXJNG1nOAEog3`.
- Produces the seven stored audit fields and one review result for every current Content record.

- [ ] **Step 1: Create the seven Content fields using `lark-cli base +field-create`**

Read the current field list first. Create four single-select fields with the exact options from the spec, one text field, and two datetime fields. Re-read the field list and record returned IDs in the audit report.

- [ ] **Step 2: Read all Content records with projected review fields**

Use `+record-list --limit 200 --format json --as user`; require `has_more=false`. Project title, type, summary, recommendation reason, original/Feishu URL, network requirement, publication status, update time, and the seven audit fields.

- [ ] **Step 3: Verify every published source against current primary evidence**

For each source, confirm availability and current behavior. Mark unverifiable records `待审核` rather than guessing. Apply review windows of 7, 30, or 90 days based on volatility and write one distinct patch per record with `+record-upsert` or a per-record update command.

- [ ] **Step 4: Re-read and validate completeness**

Require every `已发布` record to have all seven audit fields and a future `下次复核时间`. Record retained, update-required, and down-ranked counts without exposing Base tokens.

- [ ] **Step 5: Document the SOP and commit**

Update `docs/content-operations.md` with the gate, option meanings, review windows, and recovery steps. Commit: `docs: add pre-release content audit sop`.

---

### Task 3: Curate Source Findings into Human-Review Drafts

**Files:**
- Modify only if required by a verified extraction defect: `apps/web/scripts/inbox/ai-enricher.ts`
- Modify matching tests only if the prompt or schema changes.
- Create: `.superpowers/sdd/source-sweep-2026-07-14.md`

**Interfaces:**
- Consumes Inbox table `tblpw3B9EQr43UjV` and the source URLs stored there.
- Produces new draft records in Content table `tblhXJNG1nOAEog3`, linked to source Inbox records.

- [ ] **Step 1: Read and classify all Inbox source records**

Require `has_more=false`. Scan Feishu CLI, Codex, Vibe Coding Radar, AI HOT, and the design-context source. Scan VibeCodeIdea only for directly relevant deltas.

- [ ] **Step 2: Research current source contents**

Use primary pages or official repositories. Exclude stale, duplicated, navigation-only, unmaintained, or unverifiable items. Keep only Codex techniques, Feishu CLI/Skills, AI-assisted e-commerce/content production, and high-value team workflows.

- [ ] **Step 3: Write bounded Inbox items and generate drafts**

Each selected item must include its specific source URL and a short editor note naming the target team, expected outcome, network requirement, and evidence date. Set Inbox status to `待处理`, run the existing processor, then verify the resulting Content record is `草稿` and linked back to the source Inbox item.

- [ ] **Step 4: Quality-check every generated draft**

Reject drafts that merely recommend a source site. Require one specific method, a non-duplicative recommendation reason, a verifiable takeaway, 2-5 tags, and at least one useful copy block. Record accepted/rejected counts and reasons.

- [ ] **Step 5: Commit only code or documentation changes**

Commit: `content: document curated source sweep`.

---

### Task 4: Review Notification and Final Verification

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Create: `.superpowers/sdd/content-release-report.md`

**Interfaces:**
- Sends one Feishu Bot message to `ou_cc01b641298450f91b0cfaecd6fe8b62`.
- Produces final test evidence and GitHub synchronization.

- [ ] **Step 1: Send the review summary**

Message includes draft count, source distribution, VPN count, records requiring special review, and `https://my.feishu.cn/base/OFPibny2VavSo0sNqdac9al4nWh`. Do not include credentials, Base tokens, or copied source articles.

- [ ] **Step 2: Run complete verification**

```powershell
npm test -- --run
npm run check
npm run build
npm run verify:public
npm run test:e2e
```

Expected: every command exits 0 and the release gate passes with audited fixtures.

- [ ] **Step 3: Run independent final review**

Review all changes from the redesign base through the audit and source-curation commits. Resolve every Critical or Important finding.

- [ ] **Step 4: Push and provide the runnable URL**

Push `feature/ai-work-discovery`, start the local dev server on an available loopback port, and report the URL plus Base review link.

---

## Self-Review

- Spec coverage: audit fields, LLM-assisted judgment, fail-closed release, historical review, source sweep, drafts-only writes, VPN labeling, and Bot notification are each mapped to a task.
- Placeholder scan: no deferred implementation markers are present.
- Type consistency: Task 1's `assertReleaseAudits` is the only release-gate interface consumed by sync; Base field names match the design spec.
