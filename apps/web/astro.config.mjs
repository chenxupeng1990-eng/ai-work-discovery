import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  base: process.env.PUBLIC_BASE_PATH ?? "/",
  integrations: [react()],
});
