export function sitePath(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.replace(/\/$/, "");

  if (!base || path === base || path.startsWith(`${base}/`)) {
    return path;
  }

  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
