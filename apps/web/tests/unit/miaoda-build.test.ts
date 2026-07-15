import { describe, expect, it } from "vitest";

import { rewriteForMiaoda } from "../../scripts/miaoda-paths";

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
