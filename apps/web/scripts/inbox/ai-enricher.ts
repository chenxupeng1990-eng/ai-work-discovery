import { z } from "zod";
import type { SourceMetadata } from "./fetch-metadata";

export const MAX_EDITOR_NOTE_LENGTH = 1_000;
export const MAX_AI_RESPONSE_BYTES = 256 * 1024;
export const AI_REQUEST_TIMEOUT_MS = 20_000;

const CONTENT_TYPES = [
  "Case",
  "Inspiration",
  "Collaboration",
  "Tool",
  "Skill",
  "AI Signal",
  "Getting Started",
] as const;

const CopyBlockProposalSchema = z.object({
  title: z.string().min(1).max(80),
  type: z.enum(["Prompt", "Command", "Path", "Configuration", "Code"]),
  language: z.string().min(1).max(30),
  content: z.string().min(1).max(12_000),
  note: z.string().min(1).max(200).optional(),
}).strict();

export const DraftProposalSchema = z.object({
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(180),
  recommendationReason: z.string().min(1).max(160),
  contentType: z.enum(CONTENT_TYPES),
  category: z.string().min(1).max(20),
  tags: z.array(z.string().min(1).max(20)).max(8),
  publicationStatus: z.literal("草稿"),
  copyBlocks: z.array(CopyBlockProposalSchema).max(6),
}).strict();

export type DraftProposal = z.infer<typeof DraftProposalSchema>;

export type AIEnrichmentErrorKind =
  | "configuration"
  | "timeout"
  | "request"
  | "http"
  | "response_too_large"
  | "malformed_response"
  | "invalid_proposal";

export class AIEnrichmentError extends Error {
  readonly kind: AIEnrichmentErrorKind;
  readonly status?: number;

  constructor(kind: AIEnrichmentErrorKind, details: { status?: number } = {}) {
    const suffix = details.status === undefined ? "" : ` (HTTP ${details.status})`;
    super(`AI enrichment ${kind.replaceAll("_", " ")}${suffix}`);
    this.name = "AIEnrichmentError";
    this.kind = kind;
    this.status = details.status;
  }
}

export interface AIEnrichmentInput {
  metadata: SourceMetadata;
  editorNote?: string;
}

export interface AIEnrichmentConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AIClock {
  setTimeout(handler: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AIEnrichmentDependencies {
  fetch?: typeof fetch;
  clock?: AIClock;
}

const defaultClock: AIClock = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function parseDraftProposal(payload: unknown): DraftProposal {
  const content = completionContent(payload);
  const trimmed = content.trim();
  const fenced = /^\`\`\`json\r?\n([\s\S]+)\r?\n\`\`\`$/.exec(trimmed);
  const jsonText = fenced?.[1] ?? trimmed;

  if (!jsonText || (!fenced && !looksLikeJsonObject(jsonText))) {
    throw new AIEnrichmentError("malformed_response");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(jsonText);
  } catch {
    throw new AIEnrichmentError("malformed_response");
  }

  const result = DraftProposalSchema.safeParse(candidate);
  if (!result.success) throw new AIEnrichmentError("invalid_proposal");
  return result.data;
}

export function enrichDraft(
  input: AIEnrichmentInput,
  config: AIEnrichmentConfig,
  dependencies: AIEnrichmentDependencies = {},
): Promise<DraftProposal> {
  const endpoint = chatCompletionsUrl(config.baseUrl);
  if (!config.apiKey || !config.model) throw new AIEnrichmentError("configuration");
  return performEnrichment(input, config, endpoint, dependencies);
}

async function performEnrichment(
  input: AIEnrichmentInput,
  config: AIEnrichmentConfig,
  endpoint: URL,
  dependencies: AIEnrichmentDependencies,
): Promise<DraftProposal> {
  const fetchImpl = dependencies.fetch ?? fetch;
  const clock = dependencies.clock ?? defaultClock;
  const controller = new AbortController();
  let timedOut = false;
  const timeout = clock.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await withAbort(fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Create one human-review draft. Return JSON only. publicationStatus must be 草稿.",
          },
          {
            role: "user",
            content: JSON.stringify(boundedModelInput(input)),
          },
        ],
      }),
      signal: controller.signal,
    }), controller.signal);

    const body = await readBoundedBody(response, controller);
    if (!response.ok) throw new AIEnrichmentError("http", { status: response.status });

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new AIEnrichmentError("malformed_response");
    }
    return parseDraftProposal(payload);
  } catch (error) {
    if (error instanceof AIEnrichmentError) throw error;
    if (timedOut || isAbortError(error)) throw new AIEnrichmentError("timeout");
    throw new AIEnrichmentError("request");
  } finally {
    clock.clearTimeout(timeout);
  }
}

function boundedModelInput(input: AIEnrichmentInput): Record<string, unknown> {
  const note = input.editorNote ?? "";
  const editorNote = note.slice(0, MAX_EDITOR_NOTE_LENGTH);
  const metadata = input.metadata;
  return compact({
    sourceMetadata: compact({
      sourceUrl: boundedUrl(metadata.sourceUrl),
      finalUrl: boundedUrl(metadata.finalUrl),
      contentType: metadata.contentType,
      title: boundedText(metadata.title, 200),
      description: boundedText(metadata.description, 500),
      canonicalUrl: boundedUrl(metadata.canonicalUrl),
      imageUrl: boundedUrl(metadata.imageUrl),
    }),
    editorNote: editorNote || undefined,
    editorNoteTruncated: note.length > editorNote.length,
    originalLength: note.length > editorNote.length ? note.length : undefined,
  });
}

function chatCompletionsUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AIEnrichmentError("configuration");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new AIEnrichmentError("configuration");
  }
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return new URL("chat/completions", url);
}

async function readBoundedBody(response: Response, controller: AbortController): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new AIEnrichmentError("malformed_response");
    }
    if (length > MAX_AI_RESPONSE_BYTES) {
      controller.abort();
      await response.body?.cancel().catch(() => undefined);
      throw new AIEnrichmentError("response_too_large");
    }
  }
  if (!response.body) throw new AIEnrichmentError("malformed_response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await withAbort(reader.read(), controller.signal);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AI_RESPONSE_BYTES) {
        controller.abort();
        await reader.cancel().catch(() => undefined);
        throw new AIEnrichmentError("response_too_large");
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AIEnrichmentError("malformed_response");
  }
}

function completionContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new AIEnrichmentError("malformed_response");
  }
  const choices = (payload as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new AIEnrichmentError("malformed_response");
  }
  const choice = choices[0];
  if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
    throw new AIEnrichmentError("malformed_response");
  }
  const message = (choice as Record<string, unknown>).message;
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    throw new AIEnrichmentError("malformed_response");
  }
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string") throw new AIEnrichmentError("malformed_response");
  return content;
}

function looksLikeJsonObject(value: string): boolean {
  return value.startsWith("{") && value.endsWith("}");
}

function boundedText(value: string | undefined, maxLength: number): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

function boundedUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return undefined;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
