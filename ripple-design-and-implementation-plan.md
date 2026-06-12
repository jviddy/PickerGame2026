# Ripple for VS Code — Design & Implementation Plan

*Based on the Ripple Product Design & Development Brief. This document covers architecture, data design, UI design, parsing/indexing strategy, and a phased implementation roadmap for the MVP.*

---

## 1. Product summary

Ripple is a local-first thinking and organisation system inside VS Code. Users write naturally
in plain markdown; structure (tasks, tags, people, due dates, project links) emerges
automatically through lightweight syntax and a background indexer.

**Core principles to honour in every design decision:**

| Principle | Consequence for design |
|---|---|
| Write first, organise later | Capture must never block on metadata; all structure is inferred from inline syntax |
| Local-first | No network calls, no accounts; everything lives in the workspace/user folder |
| Plain-text storage | Markdown files are the *only* source of truth; the index is disposable |
| Low friction | One keystroke to capture; views update automatically |
| Multiple views, single source | Tasks/tags/people views are projections of the same files, never separate stores |

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension Host                  │
│                                                              │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │  Commands   │   │  Tree Views  │   │ Editor features  │    │
│  │ (capture,   │   │ Stream/Tasks │   │ decorations,     │    │
│  │  toggle,    │   │ Projects/Tags│   │ completions,     │    │
│  │  search...) │   │ People       │   │ go-to-definition │    │
│  └─────┬──────┘   └──────┬───────┘   └────────┬─────────┘    │
│        │                 │ reads               │              │
│        ▼                 ▼                     ▼              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │                  Ripple Core (pure TS)                │    │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────────────┐  │    │
│  │  │  Parser  │→ │  Indexer  │→ │  Query layer       │  │    │
│  │  │ (remark) │  │ (SQLite)  │  │ (tasks, tags, FTS) │  │    │
│  │  └──────────┘  └───────────┘  └───────────────────┘  │    │
│  └──────────────────────────────────────────────────────┘    │
│        ▲                                                      │
│  ┌─────┴──────────┐    ┌─────────────────────┐                │
│  │ File watcher    │    │ Code-comment scanner │               │
│  │ (.ripple/**.md) │    │ (workspace src files)│               │
│  └────────────────┘    └─────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
              │ reads/writes                │ reads only
              ▼                             ▼
   .ripple/ markdown files          workspace source files
   (source of truth)                (TODO/FIXME comments)
```

**Key architectural rule:** `Ripple Core` (parser, indexer, query layer) has **zero
dependency on the VS Code API**. It is a plain TypeScript library tested with Vitest.
The extension layer is a thin adapter wiring core to VS Code's commands, tree views,
watchers, and editor decorations. This keeps the testable surface large and makes a
future CLI or other-editor port cheap.

---

## 3. Storage design

### 3.1 File layout (source of truth)

```
<workspace or configured root>/.ripple/
├── stream/
│   ├── 2026-06-12.md          # one file per day, auto-created
│   ├── 2026-06-13.md
│   └── ...
├── projects/
│   ├── picker-game.md          # one notebook per project
│   └── house-renovation.md
├── people/                     # optional person pages (Phase 4+)
│   └── alice.md
└── ripple.json                 # workspace-level settings (optional)

<global storage>/ripple/
└── index.db                    # SQLite index — rebuildable, never authoritative
```

Decisions:

- **Daily stream files** are named `YYYY-MM-DD.md`. The "continuous timeline" view is a
  projection that concatenates these in order. **Future notes** are simply files with a
  future date (created via "Add future note" command) and surface in the stream when
  their day arrives, plus in an "Upcoming" section before then.
- **Projects** are single markdown notebooks (`projects/<slug>.md`). A project is
  referenced from anywhere with `#project/<slug>` or by writing in its notebook.
- The **index DB lives in `ExtensionContext.globalStorageUri`** (not in the workspace),
  so it is never committed to git and never pollutes the user's repo. Deleting it is
  always safe: full reindex rebuilds it from markdown.
- `.ripple/` location is configurable (`ripple.rootPath`) so users can point it at a
  synced folder (Dropbox/iCloud/git) — local-first but sync-friendly.

### 3.2 Inline syntax (the Ripple grammar)

| Syntax | Meaning | Example |
|---|---|---|
| `[] text` | Open task | `[] email the venue` |
| `[x] text` | Done task | `[x] book flights` |
| `[>] text` | Deferred/scheduled task | `[>] review Q3 budget` |
| `[-] text` | Cancelled task | `[-] old approach` |
| `#tag` | Tag (nestable: `#project/picker-game`) | `#ideas` |
| `@person` | Person reference | `@alice` |
| `^date` | Due date — natural language | `^friday`, `^2026-07-01`, `^tomorrow` |
| `!high` / `!low` | Priority (status metadata) | `[] fix scoring !high` |

Rules:

- Metadata attaches to the **task line** it appears on; tags/people on non-task lines
  attach to the surrounding note block (paragraph/list item).
- Standard markdown checkboxes (`- [ ]`, `- [x]`) are **also recognised** so existing
  notes work — Ripple's bare `[]` is sugar, not a requirement.
- `^date` parsing uses a natural-date library (`chrono-node`), resolved relative to the
  file's date for stream files (so `^friday` in Monday's note means that week's Friday).

### 3.3 SQLite index schema

Use SQLite (via **`sql.js` (WASM)** — see §7 for the native-module tradeoff) with FTS5
for search.

```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,          -- 'stream' | 'project' | 'person' | 'source'
  date TEXT,                   -- stream date, if applicable
  mtime INTEGER NOT NULL,      -- for incremental indexing
  hash TEXT NOT NULL
);

CREATE TABLE blocks (          -- a note block: paragraph / list item / heading section
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  line INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,        -- 'open' | 'done' | 'deferred' | 'cancelled'
  due TEXT,                    -- ISO date, resolved from ^syntax
  priority TEXT,               -- 'high' | 'low' | NULL
  source TEXT NOT NULL         -- 'note' | 'comment'
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL    -- lowercased, slash-nested
);
CREATE TABLE block_tags (block_id INTEGER, tag_id INTEGER, PRIMARY KEY (block_id, tag_id));
CREATE TABLE block_people (block_id INTEGER, person TEXT, PRIMARY KEY (block_id, person));

CREATE VIRTUAL TABLE blocks_fts USING fts5(text, content='blocks', content_rowid='id');
```

Index invariants:

- Re-indexing a file is `DELETE FROM files WHERE path = ? (cascades)` + re-insert —
  idempotent, no partial-update bugs.
- A `meta` table stores schema version + parser version; mismatch on activation
  triggers a silent full rebuild (the "rebuildable index" guarantee).

---

## 4. Parsing & indexing pipeline

### 4.1 Parser (unified/remark)

- Parse each markdown file with `remark-parse` + `remark-gfm`.
- A custom **remark plugin** walks the mdast and extracts: tasks (bare `[]` and GFM
  checkboxes), tags, people, due dates, priorities — each with precise line/column
  positions (needed for tree-item navigation and checkbox toggling).
- Output is a plain `ParsedFile` object (blocks + tasks + metadata), fully unit-testable
  in Vitest with no VS Code or SQLite involved.

### 4.2 Code-comment scanner

- Watches workspace source files (respecting `files.exclude`, `.gitignore`, and a
  `ripple.codeComments.include/exclude` glob setting).
- **Does not parse languages.** It runs a line-oriented scan for comment markers per
  language family (`//`, `#`, `--`, `/* */`, `<!-- -->`, `"""`), then matches task
  patterns inside comments: `TODO:`, `FIXME:`, `HACK:`, and Ripple syntax
  (`[] ...`, `#tag`, `@person`, `^date`) for richer metadata.
- Comment tasks are indexed with `source = 'comment'` and `files.kind = 'source'`;
  they appear in task views under a "From code" group and deep-link to file:line.
- Completing a comment task from the tree view edits the comment (`TODO` → `DONE`,
  `[]` → `[x]`) — same source-of-truth rule as notes.

### 4.3 Incremental indexing & performance

- On activation: load index, compare `files.mtime/hash` against disk (fast stat sweep),
  reindex only changed files. Cold full rebuild target: **< 2 s for 1,000 notes**.
- `FileSystemWatcher` on `.ripple/**/*.md` + workspace source globs; per-file reindex
  debounced at ~300 ms. Live editing of the *open* document re-parses from the buffer
  (not disk) so views update as you type.
- All writes batched in a transaction; FTS updated in the same transaction.
- Queries served from SQLite are effectively instant at this scale (search target:
  **< 50 ms** perceived).

---

## 5. UI design

### 5.1 Activity bar & sidebar

A dedicated **Ripple activity-bar icon** opens a view container with stacked tree views:

```
RIPPLE
├── 🌊 Stream
│   ├── Today (2026-06-12)        ← click opens today's file
│   ├── Yesterday
│   ├── This week …
│   └── Upcoming (future notes)
├── ✅ Tasks
│   ├── Overdue (2)
│   ├── Today (3)
│   ├── This week (5)
│   ├── No date (12)
│   └── From code (4)             ← comment-extracted tasks
├── 📓 Projects
│   └── picker-game (7 open tasks)
├── #  Tags
│   └── ideas (14) / admin (3) …
└── @  People
    └── alice (5 mentions, 2 open tasks)
```

- Every tree item navigates to the exact file + line.
- Tasks have inline actions: **toggle done** (edits the markdown), open, copy.
- Tasks/Tags/People views support filter boxes (`view/title` filter command).

### 5.2 Commands & capture flow (the low-friction core)

| Command | Default keybinding | Behaviour |
|---|---|---|
| `Ripple: Quick Capture` | `Ctrl/Cmd+Alt+R` | Input box from anywhere; appends a timestamped line to today's stream file. Works without opening the file. |
| `Ripple: Open Today` | `Ctrl/Cmd+Alt+T` | Opens (creating if needed) today's stream file, cursor at end |
| `Ripple: Toggle Task` | `Ctrl/Cmd+Alt+Enter` | Cycles `[]` → `[x]` on the current line |
| `Ripple: Search` | `Ctrl/Cmd+Alt+F` | QuickPick over FTS index with live results; enter jumps to block |
| `Ripple: New Project Note` | — | Prompts for name, creates `projects/<slug>.md` from template |
| `Ripple: Add Future Note` | — | Prompts for a date (natural language), opens/creates that stream file |
| `Ripple: Rebuild Index` | — | Full reindex (the escape hatch) |
| `Ripple: Capture TODO from Selection` | context menu | Wraps selection/comment into an indexed task |

### 5.3 Editor experience

- **Decorations:** subtle highlight for `#tags`, `@people`, `^dates`; done tasks dimmed
  with strikethrough; overdue `^dates` tinted warning colour.
- **Completions:** typing `#` or `@` in a `.ripple` markdown file offers existing
  tags/people from the index (this is how the tag vocabulary stays consistent).
- **Hover** on `#project/x` or `@person` shows open-task count and recent mentions;
  **go to definition** jumps to the project notebook / person page.
- **Status bar item:** `✅ 3 today` — click opens the Tasks view.

---

## 6. Extension manifest sketch

```jsonc
{
  "name": "ripple",
  "main": "./dist/extension.js",
  "activationEvents": [],            // lazy: contributed views/commands activate it
  "contributes": {
    "viewsContainers": { "activitybar": [{ "id": "ripple", "title": "Ripple", "icon": "media/ripple.svg" }] },
    "views": { "ripple": [
      { "id": "ripple.stream",   "name": "Stream" },
      { "id": "ripple.tasks",    "name": "Tasks" },
      { "id": "ripple.projects", "name": "Projects" },
      { "id": "ripple.tags",     "name": "Tags" },
      { "id": "ripple.people",   "name": "People" }
    ]},
    "commands": [ /* §5.2 */ ],
    "configuration": {
      "properties": {
        "ripple.rootPath":               { "type": "string", "default": ".ripple" },
        "ripple.codeComments.enabled":   { "type": "boolean", "default": true },
        "ripple.codeComments.markers":   { "type": "array", "default": ["TODO", "FIXME", "HACK"] },
        "ripple.codeComments.exclude":   { "type": "array", "default": ["**/node_modules/**", "**/dist/**"] },
        "ripple.stream.template":        { "type": "string" }
      }
    }
  }
}
```

---

## 7. Technical stack & key decisions

| Area | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Brief requirement; VS Code native |
| Markdown parsing | `unified` + `remark-parse` + `remark-gfm` + custom Ripple plugin | Brief requirement; positional info for free |
| Index | SQLite via **`sql.js` (WASM)**, persisted to disk on debounce | `better-sqlite3` is faster but needs native binaries per platform/Electron ABI — a packaging tax and breaks on VS Code updates. WASM runs everywhere (incl. future web). At MVP scale (≤ tens of thousands of blocks) sql.js is comfortably within performance targets. Revisit if profiling demands it; the query layer is an interface so the engine is swappable. |
| Date parsing | `chrono-node` | Natural-language `^friday`, `^next tue` |
| Bundling | `esbuild` | Fast, standard for extensions |
| Unit tests | Vitest on Ripple Core (parser, indexer, queries — in-memory sql.js) | Brief requirement; core is VS Code-free so coverage is cheap |
| Integration tests | `@vscode/test-electron` smoke suite (activate, capture, tree population) | Catches wiring bugs Vitest can't |
| Repo layout | `packages/core` + `packages/extension` (npm workspaces) | Enforces the core/extension boundary |

---

## 8. Implementation roadmap

### Phase 0 — Scaffold (≈ ½ day)
- npm-workspaces repo: `packages/core`, `packages/extension`; esbuild, Vitest, CI
  (lint + test + `vsce package` dry run).
- Walking skeleton: activity-bar icon + empty Stream view + "Open Today" command that
  creates/opens today's file. *Capture loop works on day one.*

### Phase 1 — Parser & core model (≈ 2–3 days)
- Remark pipeline + Ripple plugin: tasks (all statuses), tags, people, `^dates`,
  priorities, block segmentation, positions.
- `ParsedFile` model + exhaustive Vitest fixtures (the grammar's spec lives in tests).
- **Exit criteria:** parse a corpus of fixture notes into expected JSON snapshots.

### Phase 2 — Index & queries (≈ 2–3 days)
- sql.js setup, schema + migrations/versioning, idempotent per-file reindex,
  full rebuild, FTS5 search.
- Query layer: tasks by status/due bucket/project/tag/person; tag & people aggregates;
  stream ordering.
- **Exit criteria:** 1,000-file synthetic corpus indexes < 2 s; queries < 50 ms (Vitest bench).

### Phase 3 — Stream + Tasks UI (≈ 3–4 days) → *first dogfoodable build*
- File watcher + incremental indexing + open-buffer live re-parse.
- Stream and Tasks tree views with navigation; toggle-done inline action (edits file);
  Quick Capture, Toggle Task, Search (FTS QuickPick); status bar item.
- **Exit criteria:** daily use is viable: capture, see tasks, complete tasks, search.

### Phase 4 — Projects, Tags, People + editor polish (≈ 2–3 days)
- Projects/Tags/People tree views; New Project command + template.
- Decorations, `#`/`@` completions, hovers, go-to-definition.
- Future notes (Add Future Note + Upcoming section in Stream).

### Phase 5 — Code-comment integration (≈ 2–3 days)
- Comment scanner with include/exclude globs; "From code" task group; complete-from-tree
  edits the comment; "Capture TODO from Selection".
- **Exit criteria:** TODOs across a polyglot repo appear and round-trip correctly.

### Phase 6 — Hardening & release (≈ 2 days)
- `@vscode/test-electron` smoke suite; large-vault perf pass; index-corruption recovery
  (auto rebuild); README + walkthrough (`contributes.walkthroughs`); marketplace
  packaging (`vsce`), icon, telemetry **explicitly none** (local-first).

**Total: roughly 3 working weeks for the MVP**, with a usable daily-driver build at the
end of Phase 3 (~1.5 weeks).

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Native SQLite packaging breakage | sql.js (WASM) chosen up front; engine behind an interface |
| Bare `[]` syntax colliding with markdown links/arrays in code blocks | Parser ignores fenced code blocks and inline code; tasks recognised only at line start (after list markers) |
| Comment scanner noise (huge repos, vendored code) | Default excludes + gitignore-respect + a per-workspace enable toggle; scanning is lazy/idempotent |
| Index drift from external edits (git pull, sync) | mtime/hash sweep on activation + watcher; Rebuild Index command as escape hatch |
| Date ambiguity (`^friday` of which week?) | Resolve relative to the stream file's date, not "now"; show resolved date in hover |
| Scope creep (backlinks, graph view, sync…) | MVP cut line is the brief's list; everything else goes to a post-MVP backlog |

---

## 10. Success criteria (from the brief, made testable)

1. Capture a thought from anywhere in < 2 keystrokes + typing (Quick Capture).
2. A `[] task ^friday #project/x @alice` line written naturally appears, correctly
   bucketed, in Tasks/Projects/Tags/People views within 1 s — with no other user action.
3. A `// TODO:` in source code appears in the Tasks view and can be completed from there.
4. Deleting `index.db` loses nothing: full rebuild restores every view from markdown.
5. Search over a 1,000-note vault feels instant (< 50 ms query).
