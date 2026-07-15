import { describe, expect, it } from "vitest";

import { sitePath } from "../../src/lib/site-path";

describe("sitePath", () => {
  it("keeps root-relative paths in the default build", async () => {
    expect(sitePath("/content/example", "/")).toBe("/content/example");
  });

  it("prefixes paths and does not duplicate an existing base path", async () => {
    const base = "/app/app_example/";

    expect(sitePath("/content/example", base)).toBe("/app/app_example/content/example");
    expect(sitePath("/app/app_example/content/example", base)).toBe(
      "/app/app_example/content/example",
    );
  });
});
