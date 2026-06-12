import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import type {
  FileKind,
  ParsedFile,
  PersonSummary,
  SearchResult,
  TagSummary,
  TaskPriority,
  TaskRecord,
  TaskSource,
  TaskStatus,
} from '../types.js';

/** Bump when the schema or parser output shape changes; mismatch forces a rebuild. */
export const INDEX_SCHEMA_VERSION = 1;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  date TEXT,
  mtime INTEGER NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_file ON blocks(file_id);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  due TEXT,
  priority TEXT,
  source TEXT NOT NULL DEFAULT 'note'
);
CREATE INDEX IF NOT EXISTS idx_tasks_file ON tasks(file_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS block_tags (
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (block_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_block_tags_tag ON block_tags(tag);

CREATE TABLE IF NOT EXISTS block_people (
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  PRIMARY KEY (block_id, person)
);
CREATE INDEX IF NOT EXISTS idx_block_people_person ON block_people(person);

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (task_id, tag)
);

CREATE TABLE IF NOT EXISTS task_people (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  PRIMARY KEY (task_id, person)
);
`;

export interface RippleIndexOptions {
  /** Existing serialized database to load (from a previous session). */
  data?: Uint8Array;
  /** Resolve the sql.js wasm file; required when bundled into the extension. */
  locateFile?: (file: string) => string;
  /** Pre-loaded wasm binary, as an alternative to locateFile. */
  wasmBinary?: ArrayBuffer;
}

export interface TaskFilter {
  status?: TaskStatus;
  source?: TaskSource;
  tag?: string;
  person?: string;
  path?: string;
  fileKind?: FileKind;
}

export interface FileMeta {
  path: string;
  kind: FileKind;
  date: string | null;
  mtime: number;
  hash: string;
}

let sqlJs: SqlJsStatic | undefined;

export async function createRippleIndex(options: RippleIndexOptions = {}): Promise<RippleIndex> {
  sqlJs ??= await initSqlJs({
    locateFile: options.locateFile,
    wasmBinary: options.wasmBinary,
  } as never);
  return new RippleIndex(sqlJs, options.data);
}

export class RippleIndex {
  private db: Database;
  /** FTS5 availability is probed at startup; search falls back to LIKE without it. */
  readonly ftsEnabled: boolean;

  constructor(sql: SqlJsStatic, data?: Uint8Array) {
    this.db = data ? new sql.Database(data) : new sql.Database();
    this.db.exec(SCHEMA);
    this.ftsEnabled = this.initFts();
    const stored = this.getMeta('schema_version');
    if (stored !== null && stored !== String(INDEX_SCHEMA_VERSION)) {
      this.clear();
    }
    this.setMeta('schema_version', String(INDEX_SCHEMA_VERSION));
  }

  private initFts(): boolean {
    try {
      this.db.exec(
        'CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(text, block_id UNINDEXED)',
      );
      return true;
    } catch {
      return false;
    }
  }

  // ---- file lifecycle -------------------------------------------------

  /** Replace everything indexed for this file. Idempotent. */
  indexFile(parsed: ParsedFile, mtime: number, hash: string): void {
    this.db.exec('BEGIN');
    try {
      this.deleteFileRows(parsed.path);
      this.db.run('INSERT INTO files (path, kind, date, mtime, hash) VALUES (?, ?, ?, ?, ?)', [
        parsed.path,
        parsed.kind,
        parsed.date ?? null,
        mtime,
        hash,
      ]);
      const fileId = this.lastId();

      for (const block of parsed.blocks) {
        this.db.run('INSERT INTO blocks (file_id, start_line, end_line, text) VALUES (?, ?, ?, ?)', [
          fileId,
          block.startLine,
          block.endLine,
          block.text,
        ]);
        const blockId = this.lastId();
        if (this.ftsEnabled) {
          this.db.run('INSERT INTO blocks_fts (text, block_id) VALUES (?, ?)', [block.text, blockId]);
        }
        for (const tag of block.tags) {
          this.db.run('INSERT OR IGNORE INTO block_tags (block_id, tag) VALUES (?, ?)', [blockId, tag]);
        }
        for (const person of block.people) {
          this.db.run('INSERT OR IGNORE INTO block_people (block_id, person) VALUES (?, ?)', [blockId, person]);
        }
        for (const task of block.tasks) {
          this.db.run(
            'INSERT INTO tasks (block_id, file_id, line, text, status, due, priority, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              blockId,
              fileId,
              task.line,
              task.text,
              task.status,
              task.due ?? null,
              task.priority ?? null,
              parsed.kind === 'source' ? 'comment' : 'note',
            ],
          );
          const taskId = this.lastId();
          for (const tag of task.tags) {
            this.db.run('INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)', [taskId, tag]);
          }
          for (const person of task.people) {
            this.db.run('INSERT OR IGNORE INTO task_people (task_id, person) VALUES (?, ?)', [taskId, person]);
          }
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  removeFile(path: string): void {
    this.db.exec('BEGIN');
    try {
      this.deleteFileRows(path);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private deleteFileRows(path: string): void {
    if (this.ftsEnabled) {
      this.db.run(
        'DELETE FROM blocks_fts WHERE block_id IN (SELECT b.id FROM blocks b JOIN files f ON f.id = b.file_id WHERE f.path = ?)',
        [path],
      );
    }
    this.db.run('DELETE FROM files WHERE path = ?', [path]);
  }

  getFileMeta(path: string): FileMeta | undefined {
    return this.rows<FileMeta>('SELECT path, kind, date, mtime, hash FROM files WHERE path = ?', [path])[0];
  }

  listFiles(): FileMeta[] {
    return this.rows<FileMeta>('SELECT path, kind, date, mtime, hash FROM files ORDER BY path');
  }

  // ---- queries ---------------------------------------------------------

  tasks(filter: TaskFilter = {}): TaskRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) { where.push('t.status = ?'); params.push(filter.status); }
    if (filter.source) { where.push('t.source = ?'); params.push(filter.source); }
    if (filter.path) { where.push('f.path = ?'); params.push(filter.path); }
    if (filter.fileKind) { where.push('f.kind = ?'); params.push(filter.fileKind); }
    if (filter.tag) {
      where.push('EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND (tt.tag = ? OR tt.tag LIKE ?))');
      params.push(filter.tag, `${filter.tag}/%`);
    }
    if (filter.person) {
      where.push('EXISTS (SELECT 1 FROM task_people tp WHERE tp.task_id = t.id AND tp.person = ?)');
      params.push(filter.person);
    }
    const sql = `
      SELECT t.id, f.path, f.kind AS fileKind, t.line, t.text, t.status, t.due, t.priority, t.source,
        (SELECT group_concat(tag) FROM task_tags WHERE task_id = t.id) AS tagList,
        (SELECT group_concat(person) FROM task_people WHERE task_id = t.id) AS personList
      FROM tasks t JOIN files f ON f.id = t.file_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY (t.due IS NULL), t.due, (t.priority = 'high') DESC, f.path, t.line`;
    return this.rows<Record<string, unknown>>(sql, params).map((r) => ({
      id: r.id as number,
      path: r.path as string,
      fileKind: r.fileKind as FileKind,
      line: r.line as number,
      text: r.text as string,
      status: r.status as TaskStatus,
      due: (r.due as string | null) ?? null,
      priority: (r.priority as TaskPriority | null) ?? null,
      source: r.source as TaskSource,
      tags: r.tagList ? (r.tagList as string).split(',') : [],
      people: r.personList ? (r.personList as string).split(',') : [],
    }));
  }

  tagSummaries(): TagSummary[] {
    return this.rows<TagSummary>(`
      SELECT bt.tag AS name,
        COUNT(DISTINCT bt.block_id) AS blockCount,
        (SELECT COUNT(*) FROM task_tags tt JOIN tasks t ON t.id = tt.task_id
          WHERE tt.tag = bt.tag AND t.status = 'open') AS openTaskCount
      FROM block_tags bt GROUP BY bt.tag ORDER BY blockCount DESC, name`);
  }

  personSummaries(): PersonSummary[] {
    return this.rows<PersonSummary>(`
      SELECT bp.person AS name,
        COUNT(DISTINCT bp.block_id) AS mentionCount,
        (SELECT COUNT(*) FROM task_people tp JOIN tasks t ON t.id = tp.task_id
          WHERE tp.person = bp.person AND t.status = 'open') AS openTaskCount
      FROM block_people bp GROUP BY bp.person ORDER BY mentionCount DESC, name`);
  }

  /** Blocks (with positions) that carry a tag — powers the Tags view drill-down. */
  blocksForTag(tag: string): SearchResult[] {
    return this.rows<SearchResult>(
      `SELECT f.path, b.start_line AS startLine, b.end_line AS endLine, b.text AS snippet
       FROM block_tags bt JOIN blocks b ON b.id = bt.block_id JOIN files f ON f.id = b.file_id
       WHERE bt.tag = ? OR bt.tag LIKE ? ORDER BY f.path, b.start_line`,
      [tag, `${tag}/%`],
    );
  }

  blocksForPerson(person: string): SearchResult[] {
    return this.rows<SearchResult>(
      `SELECT f.path, b.start_line AS startLine, b.end_line AS endLine, b.text AS snippet
       FROM block_people bp JOIN blocks b ON b.id = bp.block_id JOIN files f ON f.id = b.file_id
       WHERE bp.person = ? ORDER BY f.path, b.start_line`,
      [person],
    );
  }

  search(query: string, limit = 50): SearchResult[] {
    const q = query.trim();
    if (!q) return [];
    if (this.ftsEnabled) {
      try {
        return this.rows<SearchResult>(
          `SELECT f.path, b.start_line AS startLine, b.end_line AS endLine, b.text AS snippet
           FROM blocks_fts ft JOIN blocks b ON b.id = ft.block_id JOIN files f ON f.id = b.file_id
           WHERE blocks_fts MATCH ? ORDER BY rank LIMIT ?`,
          [ftsQuery(q), limit],
        );
      } catch {
        // Malformed FTS expression — fall through to LIKE.
      }
    }
    return this.rows<SearchResult>(
      `SELECT f.path, b.start_line AS startLine, b.end_line AS endLine, b.text AS snippet
       FROM blocks b JOIN files f ON f.id = b.file_id
       WHERE b.text LIKE ? ORDER BY f.path, b.start_line LIMIT ?`,
      [`%${q}%`, limit],
    );
  }

  // ---- persistence -----------------------------------------------------

  export(): Uint8Array {
    return this.db.export();
  }

  clear(): void {
    this.db.exec('DELETE FROM files');
    if (this.ftsEnabled) this.db.exec('DELETE FROM blocks_fts');
  }

  close(): void {
    this.db.close();
  }

  getMeta(key: string): string | null {
    const row = this.rows<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])[0];
    return row ? row.value : null;
  }

  setMeta(key: string, value: string): void {
    this.db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ]);
  }

  // ---- helpers ----------------------------------------------------------

  private lastId(): number {
    const stmt = this.db.prepare('SELECT last_insert_rowid() AS id');
    stmt.step();
    const id = stmt.getAsObject().id as number;
    stmt.free();
    return id;
  }

  private rows<T>(sql: string, params: (string | number | null)[] = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const out: T[] = [];
    while (stmt.step()) out.push(stmt.getAsObject() as T);
    stmt.free();
    return out;
  }
}

/** Quote each term so user input can't be a malformed FTS5 expression. */
function ftsQuery(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ');
}
