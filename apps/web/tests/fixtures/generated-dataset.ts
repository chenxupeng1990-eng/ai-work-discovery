import { readFileSync } from "node:fs";
import { PublicDatasetSchema } from "../../src/lib/schema";

export const generatedDataset = PublicDatasetSchema.parse(JSON.parse(
  readFileSync(new URL("../../src/generated/content.json", import.meta.url), "utf8"),
));
