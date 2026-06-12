import * as chrono from 'chrono-node';

/**
 * Resolve a `^date` expression to an ISO date (YYYY-MM-DD).
 *
 * `reference` anchors relative expressions: for stream files this is the file's
 * date, so `^friday` written in Monday's note means that week's Friday even when
 * re-indexed later. Falls back to today for non-dated files.
 */
export function resolveDueDate(expression: string, reference?: string): string | undefined {
  const cleaned = expression.replace(/[-_]/g, ' ');
  const refDate = reference ? new Date(`${reference}T12:00:00`) : new Date();
  const parsed = chrono.parseDate(cleaned, refDate, { forwardDate: true });
  if (!parsed) return undefined;
  return toIsoDate(parsed);
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

/** Date of the stream file a path refers to, e.g. `.../stream/2026-06-12.md`. */
export function streamDateFromPath(path: string): string | undefined {
  const m = /(\d{4}-\d{2}-\d{2})\.md$/.exec(path);
  return m ? m[1] : undefined;
}
