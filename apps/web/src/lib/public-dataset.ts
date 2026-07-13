import generatedDataset from "../generated/content.json";
import { PublicDatasetSchema } from "./schema";

export const publicDataset = PublicDatasetSchema.parse(generatedDataset);
