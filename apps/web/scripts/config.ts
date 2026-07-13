import { z } from "zod";

const HttpsUrlSchema = z.url({ protocol: /^https$/ }).refine((value) => {
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
});

export const SyncConfigSchema = z.object({
  FEISHU_APP_ID: z.string().min(1),
  FEISHU_APP_SECRET: z.string().min(1),
  FEISHU_BASE_APP_TOKEN: z.string().min(1),
  FEISHU_CONTENT_TABLE_ID: z.string().min(1),
  FEISHU_COPY_BLOCKS_TABLE_ID: z.string().min(1),
  FEISHU_INBOX_TABLE_ID: z.string().min(1),
  AI_BASE_URL: HttpsUrlSchema,
  AI_API_KEY: z.string().min(1),
  AI_MODEL: z.string().min(1),
}).strict();

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

const CONFIG_KEYS = Object.keys(SyncConfigSchema.shape) as Array<keyof SyncConfig>;

export class SyncConfigError extends Error {
  constructor(fields: string[]) {
    super(`同步配置无效: ${fields.join(", ")}`);
    this.name = "SyncConfigError";
  }
}

export function loadSyncConfig(env: Record<string, string | undefined>): SyncConfig {
  const candidate = Object.fromEntries(CONFIG_KEYS.map((key) => [key, env[key]]));
  const result = SyncConfigSchema.safeParse(candidate);

  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? "unknown")))];
    throw new SyncConfigError(fields);
  }

  return result.data;
}
