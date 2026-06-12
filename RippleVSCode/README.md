# RippleVSCode

Ripple — a local-first thinking and organisation system inside VS Code.
Users write naturally in markdown; structure (tasks, tags, people, due dates)
emerges automatically through lightweight syntax and a background index.

## Repository layout

- `packages/core` — pure TypeScript library: Ripple grammar parser (remark),
  SQLite index (sql.js/WASM), query layer. No VS Code dependency; tested with Vitest.
- `packages/extension` — the VS Code extension: activity bar views (Stream, Tasks,
  Projects, Tags, People), capture commands, file watcher, search.
- `PROGRESS.md` — running build log and decisions.

## Development

```bash
npm install
npm test                  # core unit tests (Vitest)
npm run typecheck         # strict TS across both packages
npm run build --workspace ripple-vscode   # bundle the extension (esbuild)
```

To run the extension: open `packages/extension` in VS Code and press F5
(Run Extension), or package a vsix with `npm run package -w ripple-vscode`.

See `PROGRESS.md` for current status and the design plan for architecture details.
