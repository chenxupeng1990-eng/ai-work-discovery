import { describe, expect, it } from "vitest";

import { rewriteForMiaoda, rewriteMiaodaModuleImports } from "../../scripts/miaoda-paths";

const basePath = "/app/app_example";

describe("rewriteForMiaoda", () => {
  it("prefixes site routes and image assets", () => {
    const source = 'href="/discover/" src="/images/cover.webp" href="/content/example/"';

    expect(rewriteForMiaoda(source, basePath)).toBe(
      'href="/app/app_example/discover/" src="/app/app_example/images/cover.webp" href="/app/app_example/content/example/"',
    );
  });

  it("prefixes the home link and CSS image URLs", () => {
    const source = 'href="/";background-image:url(/images/hero.webp)';

    expect(rewriteForMiaoda(source, basePath)).toBe(
      'href="/app/app_example/";background-image:url(/app/app_example/images/hero.webp)',
    );
  });

  it("leaves external and already-prefixed URLs unchanged", () => {
    const source =
      'href="https://example.com/discover" src="/app/app_example/images/cover.webp"';

    expect(rewriteForMiaoda(source, basePath)).toBe(source);
  });

  it("prefixes image paths serialized into hydrated component props", () => {
    const source =
      '&quot;coverImage&quot;:[0,&quot;/images/cover.webp&quot;],\\"image\\":\\"/images/card.webp\\"';

    expect(rewriteForMiaoda(source, basePath)).toBe(
      '&quot;coverImage&quot;:[0,&quot;/app/app_example/images/cover.webp&quot;],\\"image\\":\\"/app/app_example/images/card.webp\\"',
    );
  });

  it("prefixes dynamic routes inside client-side template literals", () => {
    const source = "const detail = `/content/${slug}`; const category = `/category/${track}`;";

    expect(rewriteForMiaoda(source, basePath)).toBe(
      "const detail = `/app/app_example/content/${slug}`; const category = `/app/app_example/category/${track}`;",
    );
  });
});

describe("rewriteMiaodaModuleImports", () => {
  it("routes relative JavaScript dependencies back through the Miaoda app host", () => {
    const source = 'import{t as e}from"./react.hash.js";import("./lazy.hash.js")';
    const moduleBaseUrl = "https://demo.aiforce.cloud/app/app_example";

    expect(rewriteMiaodaModuleImports(source, moduleBaseUrl)).toBe(
      'import{t as e}from"https://demo.aiforce.cloud/app/app_example/_astro/react.hash.js";import("https://demo.aiforce.cloud/app/app_example/_astro/lazy.hash.js")',
    );
  });

  it("leaves already absolute module paths unchanged", () => {
    const source = 'import{t as e}from"/app/app_example/_astro/react.hash.js"';

    expect(rewriteMiaodaModuleImports(source, basePath)).toBe(source);
  });
});
