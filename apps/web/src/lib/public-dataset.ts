import generatedDataset from "../generated/content.json";
import { buildMiaodaSafeDataset } from "../../scripts/publish/miaoda-safe-content";
import { PublicDatasetSchema } from "./schema";

const parsedDataset = PublicDatasetSchema.parse(generatedDataset);
export const publicDataset = import.meta.env.PUBLIC_MIAODA_SAFE === "true"
  ? buildMiaodaSafeDataset(parsedDataset)
  : parsedDataset;
