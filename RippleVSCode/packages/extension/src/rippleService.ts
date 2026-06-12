import * as vscode from 'vscode';
import {
  contentHash,
  createRippleIndex,
  parseRippleFile,
  todayIso,
  toIsoDate,
  type RippleIndex,
} from '@ripple/core';

const INDEX_FILE = 'index.db';
const REINDEX_DEBOUNCE_MS = 300;
const PERSIST_DEBOUNCE_MS = 2000;

/**
 * Owns the Ripple root folder, the search index and the file watchers.
 * Views and commands talk to this; nothing else touches the index directly.
 */
export class RippleService implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  /** Fires after any index update; tree views refresh on it. */
  readonly onDidChangeData = this.changeEmitter.event;

  private index!: RippleIndex;
  private disposables: vscode.Disposable[] = [];
  private reindexTimers = new Map<string, NodeJS.Timeout>();
  private persistTimer: NodeJS.Timeout | undefined;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    readonly rootUri: vscode.Uri,
  ) {}

  static async create(context: vscode.ExtensionContext): Promise<RippleService | undefined> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return undefined;
    const configured = vscode.workspace.getConfiguration('ripple').get<string>('rootPath', '.ripple');
    const rootUri = /^(\/|[A-Za-z]:[\\/])/.test(configured)
      ? vscode.Uri.file(configured)
      : vscode.Uri.joinPath(folder.uri, configured);

    const service = new RippleService(context, rootUri);
    await service.initialize();
    return service;
  }

  private async initialize(): Promise<void> {
    const wasmUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'sql-wasm.wasm');
    const wasm = await vscode.workspace.fs.readFile(wasmUri);
    const stored = await this.loadStoredIndex();
    try {
      this.index = await createRippleIndex({ wasmBinary: toArrayBuffer(wasm), data: stored });
    } catch {
      // Corrupt index file — start fresh; markdown is the source of truth.
      this.index = await createRippleIndex({ wasmBinary: toArrayBuffer(wasm) });
    }

    await this.scanAll();
    this.watch();
  }

  // ---- indexing --------------------------------------------------------

  /** Stat-sweep all ripple markdown files; reindex changed, drop deleted. */
  async scanAll(): Promise<void> {
    const onDisk = await this.listMarkdownFiles(this.rootUri);
    const known = new Map(this.index.listFiles().map((f) => [f.path, f]));

    for (const uri of onDisk) {
      const key = uri.fsPath;
      const stat = await vscode.workspace.fs.stat(uri);
      const existing = known.get(key);
      known.delete(key);
      if (existing && existing.mtime === stat.mtime) continue;
      await this.reindexUri(uri, stat.mtime);
    }
    for (const stale of known.keys()) this.index.removeFile(stale);

    this.notifyChanged();
  }

  async rebuild(): Promise<void> {
    this.index.clear();
    await this.scanAll();
  }

  private async reindexUri(uri: vscode.Uri, mtime?: number): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder().decode(bytes);
      this.indexText(uri, text, mtime);
    } catch {
      this.index.removeFile(uri.fsPath);
    }
  }

  private indexText(uri: vscode.Uri, text: string, mtime = Date.now()): void {
    const parsed = parseRippleFile(uri.fsPath, text);
    this.index.indexFile(parsed, mtime, contentHash(text));
  }

  private watch(): void {
    const pattern = new vscode.RelativePattern(this.rootUri, '**/*.md');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const queue = (uri: vscode.Uri) => this.queueReindex(uri);
    watcher.onDidCreate(queue, null, this.disposables);
    watcher.onDidChange(queue, null, this.disposables);
    watcher.onDidDelete(
      (uri) => {
        this.index.removeFile(uri.fsPath);
        this.notifyChanged();
      },
      null,
      this.disposables,
    );
    this.disposables.push(watcher);

    // Live updates while typing, from the buffer rather than disk.
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (!this.isRippleDoc(e.document)) return;
        this.queueReindex(e.document.uri, () => e.document.getText());
      },
      null,
      this.disposables,
    );
  }

  private queueReindex(uri: vscode.Uri, textProvider?: () => string): void {
    const key = uri.fsPath;
    clearTimeout(this.reindexTimers.get(key));
    this.reindexTimers.set(
      key,
      setTimeout(async () => {
        this.reindexTimers.delete(key);
        if (textProvider) this.indexText(uri, textProvider());
        else await this.reindexUri(uri);
        this.notifyChanged();
      }, REINDEX_DEBOUNCE_MS),
    );
  }

  private isRippleDoc(doc: vscode.TextDocument): boolean {
    return doc.uri.fsPath.startsWith(this.rootUri.fsPath) && doc.uri.fsPath.endsWith('.md');
  }

  // ---- queries (thin passthrough for views) ------------------------------

  get data(): RippleIndex {
    return this.index;
  }

  // ---- note files --------------------------------------------------------

  streamUri(dateIso: string): vscode.Uri {
    return vscode.Uri.joinPath(this.rootUri, 'stream', `${dateIso}.md`);
  }

  projectUri(slug: string): vscode.Uri {
    return vscode.Uri.joinPath(this.rootUri, 'projects', `${slug}.md`);
  }

  /** Open (creating if needed) the stream file for a date; returns the editor. */
  async openStreamFile(dateIso = todayIso()): Promise<vscode.TextEditor> {
    const uri = this.streamUri(dateIso);
    if (!(await exists(uri))) {
      const template = vscode.workspace
        .getConfiguration('ripple')
        .get<string>('stream.template', '# {date}\n\n')
        .replaceAll('{date}', dateIso);
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.rootUri, 'stream'));
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const end = doc.lineAt(doc.lineCount - 1).range.end;
    editor.selection = new vscode.Selection(end, end);
    return editor;
  }

  /** Append a timestamped line to today's stream file without opening it. */
  async capture(text: string): Promise<void> {
    const uri = this.streamUri(todayIso());
    let existing = '';
    if (await exists(uri)) {
      existing = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } else {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.rootUri, 'stream'));
      existing = vscode.workspace
        .getConfiguration('ripple')
        .get<string>('stream.template', '# {date}\n\n')
        .replaceAll('{date}', todayIso());
    }
    const time = new Date().toTimeString().slice(0, 5);
    const line = `- ${time} ${text.trim()}\n`;
    const next = existing.endsWith('\n') || existing === '' ? existing + line : `${existing}\n${line}`;
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(next));
    this.queueReindex(uri);
  }

  async createProject(name: string): Promise<vscode.Uri> {
    const slug = name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    const uri = this.projectUri(slug || 'untitled');
    if (!(await exists(uri))) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(this.rootUri, 'projects'));
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(`# ${name}\n\n`));
    }
    return uri;
  }

  /** Flip a task line between open and done; returns false if the line isn't a task. */
  async setTaskStatus(path: string, line: number, done: boolean): Promise<boolean> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path));
    if (line >= doc.lineCount) return false;
    const lineText = doc.lineAt(line).text;
    const m = /^(\s*(?:[-*+]\s+)?)\[([ xX>-]?)\]/.exec(lineText);
    if (!m) return false;
    const start = m[1]!.length;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      doc.uri,
      new vscode.Range(line, start, line, start + m[2]!.length + 2),
      done ? '[x]' : '[]',
    );
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) await doc.save();
    return ok;
  }

  private notifyChanged(): void {
    this.changeEmitter.fire();
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), PERSIST_DEBOUNCE_MS);
  }

  // ---- persistence -------------------------------------------------------

  private indexStorageUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, INDEX_FILE);
  }

  private async loadStoredIndex(): Promise<Uint8Array | undefined> {
    try {
      return await vscode.workspace.fs.readFile(this.indexStorageUri());
    } catch {
      return undefined;
    }
  }

  private async persist(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      await vscode.workspace.fs.writeFile(this.indexStorageUri(), this.index.export());
    } catch (err) {
      console.error('Ripple: failed to persist index', err);
    }
  }

  private async listMarkdownFiles(dir: vscode.Uri): Promise<vscode.Uri[]> {
    const out: vscode.Uri[] = [];
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return out; // root doesn't exist yet — nothing to index
    }
    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(dir, name);
      if (type === vscode.FileType.Directory) out.push(...(await this.listMarkdownFiles(child)));
      else if (type === vscode.FileType.File && name.endsWith('.md')) out.push(child);
    }
    return out;
  }

  dispose(): void {
    for (const t of this.reindexTimers.values()) clearTimeout(t);
    clearTimeout(this.persistTimer);
    void this.persist();
    for (const d of this.disposables) d.dispose();
    this.changeEmitter.dispose();
    this.index.close();
  }
}

export function isoForOffset(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return toIsoDate(d);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
