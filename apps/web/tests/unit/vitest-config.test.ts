import { describe, expect, it } from "vitest";
import vitestConfig from "../../vitest.config";

describe("Vitest configuration", () => {
  it("collects only unit test files", () => {
    expect(vitestConfig.test?.include).toEqual(["tests/unit/**/*.test.ts"]);
  });
});
