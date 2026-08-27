/** Timestamp helpers. ISO-8601 UTC at second precision, matching the CLI's `%Y-%m-%dT%H:%M:%SZ`. */

export function isoSecondsUtc(date: Date = new Date()): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/** Parse a timestamp defensively. Returns `null` rather than an Invalid Date. */
export function parseIsoUtc(value: string): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
