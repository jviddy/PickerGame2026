# Ripple — Build Progress Notes

Running log of implementation progress. Newest entries at the top of each section.
See `../ripple-design-and-implementation-plan.md` for the full design.

## Status summary

| Phase | Scope | Status |
|---|---|---|
| 0 | Scaffold: workspaces, TS, esbuild, Vitest, walking skeleton | 🔨 in progress |
| 1 | Parser & core model (remark + Ripple grammar) | ⬜ not started |
| 2 | SQLite index & query layer | ⬜ not started |
| 3 | Stream + Tasks UI, capture commands, search | ⬜ not started |
| 4 | Projects / Tags / People views, editor polish | ⬜ not started |
| 5 | Code-comment integration | ⬜ not started |
| 6 | Hardening & release | ⬜ not started |

## Important context

- **Repo location:** The user asked for a standalone `RippleVSCode` GitHub repo, but the
  session's GitHub integration cannot create repositories (403) and is scoped to
  `jviddy/PickerGame2026` only. Work lives in `RippleVSCode/` on branch
  `claude/vscode-note-todo-plugin-n8iqyg` until a dedicated repo exists; the directory is
  fully self-contained, so migrating is `cp -r RippleVSCode/* <new-repo>/ && git init…`.
- **Architecture rule:** `packages/core` must never import `vscode`. All VS Code API
  usage lives in `packages/extension`.
- **Index engine:** sql.js (WASM) — chosen over better-sqlite3 to avoid native-module
  packaging problems. Engine is behind `RippleIndex` so it can be swapped.

## Log

### 2026-06-12 — Session 1
- Created design plan (`../ripple-design-and-implementation-plan.md`).
- Attempted GitHub repo creation — blocked by integration permissions (see above).
- Started Phase 0 scaffold.

## Decisions made along the way

- (record deviations from the plan here as they happen)

## Known issues / TODO next session

- Create the standalone `RippleVSCode` repo and migrate this directory into it.
