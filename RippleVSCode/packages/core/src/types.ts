/** Task lifecycle states, mapped from `[]`, `[x]`, `[>]`, `[-]`. */
export type TaskStatus = 'open' | 'done' | 'deferred' | 'cancelled';

export type TaskPriority = 'high' | 'low';

/** Where an indexed file came from. */
export type FileKind = 'stream' | 'project' | 'person' | 'source';

export type TaskSource = 'note' | 'comment';

/** A single extracted task. Lines are 0-based to match VS Code. */
export interface ParsedTask {
  line: number;
  /** Task text with checkbox marker stripped but inline syntax (#tag, @p, ^date) kept. */
  text: string;
  status: TaskStatus;
  /** Resolved ISO date (YYYY-MM-DD) from ^syntax, if present. */
  due?: string;
  priority?: TaskPriority;
  tags: string[];
  people: string[];
  /** Character offsets of the checkbox marker within the line, for toggling. */
  marker: { start: number; end: number };
}

/** A note block: paragraph, heading, list item or blockquote. Lines are 0-based, end inclusive. */
export interface ParsedBlock {
  startLine: number;
  endLine: number;
  text: string;
  tags: string[];
  people: string[];
  tasks: ParsedTask[];
}

export interface ParsedFile {
  path: string;
  kind: FileKind;
  /** Stream date (YYYY-MM-DD) when kind === 'stream'. */
  date?: string;
  blocks: ParsedBlock[];
}

/** A task row as returned by the query layer. */
export interface TaskRecord {
  id: number;
  path: string;
  fileKind: FileKind;
  line: number;
  text: string;
  status: TaskStatus;
  due: string | null;
  priority: TaskPriority | null;
  source: TaskSource;
  tags: string[];
  people: string[];
}

export interface TagSummary {
  name: string;
  blockCount: number;
  openTaskCount: number;
}

export interface PersonSummary {
  name: string;
  mentionCount: number;
  openTaskCount: number;
}

export interface SearchResult {
  path: string;
  startLine: number;
  endLine: number;
  /** Block text with the match, suitable for a result label. */
  snippet: string;
}
