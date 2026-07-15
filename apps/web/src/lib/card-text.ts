export function withoutTerminalFullStops(value: string): string {
  return value.trim().replace(/[。.]+$/u, "");
}
