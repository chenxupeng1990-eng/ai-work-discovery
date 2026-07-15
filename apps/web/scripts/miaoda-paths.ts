export function rewriteForMiaoda(source: string, prefix: string): string {
  const normalizedPrefix = prefix.replace(/\/$/, "");
  const internalRoots = ["category", "content", "discover", "images", "updates"];
  const rootsPattern = internalRoots.join("|");

  return source
    .replaceAll("&quot;/images/", `&quot;${normalizedPrefix}/images/`)
    .replace(/\\(["'])\/images\//g, `\\$1${normalizedPrefix}/images/`)
    .replace(
      new RegExp(
        `([\"'\`(=:])/(?!${escapeRegExp(normalizedPrefix.slice(1))}/)(${rootsPattern})(?=[/\"'\`)?#])`,
        "g",
      ),
      `$1${normalizedPrefix}/$2`,
    )
    .replace(/href=(['"])\/(?:\1)/g, `href=$1${normalizedPrefix}/$1`);
}

export function rewriteMiaodaModuleImports(source: string, prefix: string): string {
  const normalizedPrefix = prefix.replace(/\/$/, "");

  return source.replace(
    /(["'])\.\/([^"']+\.js)\1/g,
    (_match, quote: string, modulePath: string) => (
      `${quote}${normalizedPrefix}/_astro/${modulePath}${quote}`
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
