import type { TaskStatus } from '../types.js';

/**
 * The Ripple inline grammar. All regexes operate on a single line of text.
 *
 * Tags must start with a letter/digit/underscore (so `# Heading` is never a tag)
 * and may nest with slashes: #project/picker-game.
 */
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;
const PERSON_RE = /(^|[\s(])@([\p{L}\p{N}_][\p{L}\p{N}_\-]*)/gu;
/** `^friday` for single tokens, `^(next friday)` for phrases. */
const DUE_RE = /(^|\s)\^(?:\(([^)]+)\)|(\S+))/gu;
const PRIORITY_RE = /(^|\s)!(high|low)\b/iu;

/**
 * Task lines: optional list marker, then a checkbox.
 * Accepts Ripple bare brackets (`[]`, `[x]`, `[>]`, `[-]`) and GFM (`- [ ]`, `- [x]`).
 * The marker must be followed by whitespace and non-empty text, so markdown links
 * (`[text](url)`) and array literals never match.
 */
const TASK_RE = /^(\s*(?:[-*+]\s+)?)\[([ xX>-]?)\]\s+(\S.*)$/u;

const STATUS_BY_MARK: Record<string, TaskStatus> = {
  '': 'open',
  ' ': 'open',
  x: 'done',
  X: 'done',
  '>': 'deferred',
  '-': 'cancelled',
};

export interface TaskLineMatch {
  status: TaskStatus;
  /** Text after the checkbox (inline syntax intact). */
  text: string;
  /** Offsets of `[?]` within the line, for toggle edits. */
  marker: { start: number; end: number };
}

export function matchTaskLine(line: string): TaskLineMatch | undefined {
  const m = TASK_RE.exec(line);
  if (!m) return undefined;
  const [, prefix, mark, text] = m;
  const markerStart = prefix!.length;
  return {
    status: STATUS_BY_MARK[mark ?? '']!,
    text: text!,
    marker: { start: markerStart, end: markerStart + (mark ?? '').length + 2 },
  };
}

export function extractTags(text: string): string[] {
  return unique([...text.matchAll(TAG_RE)].map((m) => m[2]!.toLowerCase()));
}

export function extractPeople(text: string): string[] {
  return unique([...text.matchAll(PERSON_RE)].map((m) => m[2]!.toLowerCase()));
}

/** Raw `^date` expression (not yet resolved to a calendar date). */
export function extractDueExpression(text: string): string | undefined {
  const m = [...text.matchAll(DUE_RE)][0];
  return m ? (m[2] ?? m[3]) : undefined;
}

export function extractPriority(text: string): 'high' | 'low' | undefined {
  const m = PRIORITY_RE.exec(text);
  return m ? (m[2]!.toLowerCase() as 'high' | 'low') : undefined;
}

/** Strip Ripple metadata syntax from task text for clean display labels. */
export function stripMetadata(text: string): string {
  return text
    .replace(DUE_RE, '$1')
    .replace(PRIORITY_RE, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
