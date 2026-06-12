# Ripple — Build Progress Notes

Running log of implementation progress. Newest entries at the top of each section.
See `../ripple-design-and-implementation-plan.md` for the full design.

## Status summary

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold: workspaces, TS, esbuild, Vitest | ✅ done |
| 1 | Parser & core model (remark + Ripple grammar) | ✅ done — 24 unit tests |
| 2 | SQLite index & query layer (sql.js) | ✅ done |
| 3 | Stream + Tasks UI, capture commands, search | ✅ done (untested in live VS Code — see below) |
| 4 | Projects / Tags / People views | ✅ tree views done; decorations/completions/hovers **not started** |
| 5 | Code-comment integration | ⬜ not started |
| 6 | Hardening & release | 🔶 vsix packages cleanly; integration tests written but can't run in this env |

## How to try it

```bash
cd RippleVSCode && npm install
npm test                          # 24 core unit tests
npm run build -w ripple-vscode    # bundle to packages/extension/dist/
```

Then open `packages/extension` in VS Code and press F5, or install the vsix
(`npm run package -w ripple-vscode`). Open any folder, hit `Ctrl+Alt+R` to capture.

## Important context

- **Repo location:** The user asked for a standalone `RippleVSCode` GitHub repo, but the
  session's GitHub integration cannot create repositories (403:
  `POST /user/repos — Resource not accessible by integration`) and is scoped to
  `jviddy/PickerGame2026` only. Work lives in `RippleVSCode/` on branch
  `claude/vscode-note-todo-plugin-n8iqyg` until a dedicated repo exists. The directory is
  fully self-contained — migrate by copying it into a fresh repo (history can be carried
  over later with `git filter-repo --subdirectory-filter RippleVSCode` if wanted).
- **Architecture rule:** `packages/core` must never import `vscode`. All VS Code API
  usage lives in `packages/extension` (`rippleService.ts` owns the index + watchers;
  `views.ts` has the five tree providers; `extension.ts` wires commands).
- **Index engine:** sql.js (WASM), wasm shipped in `dist/` and loaded via `wasmBinary`.
  Index persists to `globalStorage/index.db`; markdown is always the source of truth.

## Log

### 2026-06-12 — Session 1
- Created design plan (`../ripple-design-and-implementation-plan.md`).
- GitHub repo creation blocked by integration permissions (see above).
- Phase 0–2: workspace scaffold; core parser (remark block segmentation + line-level
  Ripple grammar); sql.js index with idempotent per-file reindex, tag/people aggregates,
  search, export/import. **24 Vitest tests green.** Strict TS clean.
- Phase 3 + 4 (views): full extension — five tree views (Stream grouped
  Upcoming/Today/Earlier; Tasks bucketed Overdue/Today/This week/Later/No date with
  checkbox toggling; Projects with open-task children; Tags & People with block
  drill-down), Quick Capture, Open Today, Toggle Task (cycles open↔done, makes
  non-task lines into tasks), live QuickPick search, New Project, Add Future Note,
  Rebuild Index, status bar due-count. File watcher + open-buffer live reindex
  (300 ms debounce), index persisted to global storage (2 s debounce).
- esbuild bundle 531 KB; `vsce package` produces a valid vsix.
- Wrote `@vscode/test-electron` smoke suite (`test/runTest.mjs` + `test/suite.cjs`):
  activation, command registration, Open Today, toggle round-trip, rebuild. **Cannot run
  in this sandbox** — `update.code.visualstudio.com` is blocked by the network policy
  (403 host_not_allowed), so VS Code can't be downloaded. Run locally or in CI.
- Bundle smoke-verified to load under a stubbed `vscode` module.

## Decisions made along the way

- **FTS5 is not in stock sql.js** (`no such module: fts5` — probed 2026-06-12). Search
  currently uses the built-in LIKE fallback in `RippleIndex.search()`, which is fine at
  MVP scale. Future: swap to an FTS5-enabled build (e.g. `sql.js-fts5` or
  `@sqlite.org/sqlite-wasm`) behind the same interface; `ftsEnabled` already gates this.
- Core is consumed as TS source (`"main": "./src/index.ts"`) — esbuild and Vitest both
  resolve it; no per-package build step. Typecheck via `tsc --noEmit`.
- `^date` resolution anchors to the stream file's date (chrono-node `forwardDate`), so
  `^friday` in Monday's note stays that week's Friday on reindex.
- Tree checkboxes (VS Code 1.80+ `TreeItemCheckboxState`) used for task completion in
  all views, plus an inline `$(check)` button as fallback.
- Quick Capture appends `- HH:MM <text>` to today's file; if the text starts with `[]`
  it still parses as a task (list marker + checkbox is valid grammar).

## Known issues / TODO next session

- Create the standalone `RippleVSCode` repo and migrate this directory into it.
  Re-confirmed 2026-06-12 21:40 UTC: still impossible from the cloud session
  (repo creation 403; VS Code download host blocked). Do it locally:

  ```bash
  # one-time, on a machine with git + a GitHub account
  git clone --branch claude/vscode-note-todo-plugin-n8iqyg \
      https://github.com/jviddy/PickerGame2026.git ripple-src
  gh repo create jviddy/RippleVSCode --private   # or create at github.com/new
  git clone https://github.com/jviddy/RippleVSCode.git
  cp -R ripple-src/RippleVSCode/. RippleVSCode/
  cd RippleVSCode && git add -A && git commit -m "Import Ripple from PickerGame2026" && git push
  ```

- Run the integration suite locally (blocked in the sandbox by network policy):

  ```bash
  cd RippleVSCode && npm install
  npm test                                  # 24 core unit tests
  npm run test:integration -w ripple-vscode # downloads VS Code, runs smoke suite
  ```

- Phase 4 remainder: editor decorations (#tag/@person/^date highlights, dim done
  tasks), `#`/`@` completions from the index, hovers, go-to-definition.
- Phase 5: code-comment scanner (design §4.2 — line-oriented comment scan, `source:
  'comment'`, "From code" task group).
- Tasks view: add a "From code" group once Phase 5 lands; consider showing deferred
  (`[>]`) tasks in a collapsed group.
- `ripple.refresh` re-scans but tree collapse state resets on full refresh — acceptable
  for now.
- No `repository` field in extension package.json yet (vsce warns) — set once the
  standalone repo exists.
