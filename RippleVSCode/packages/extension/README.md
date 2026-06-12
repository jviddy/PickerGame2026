# Ripple

Local-first notes, daily stream and automatic task extraction for VS Code.
Write naturally — Ripple organises in the background.

## How it works

Ripple keeps plain markdown files in a `.ripple/` folder in your workspace:

- `stream/2026-06-12.md` — one file per day; the **Stream** view is your timeline
- `projects/<name>.md` — project notebooks

Write tasks and metadata inline, anywhere:

```
[] email the venue ^friday #wedding @alice !high
[x] book flights
```

- `[]` open · `[x]` done · `[>]` deferred · `[-]` cancelled (GFM `- [ ]` works too)
- `#tag` and nested `#project/sub` tags
- `@person` mentions
- `^friday`, `^2026-07-01`, `^(next friday)` due dates
- `!high` / `!low` priority

Everything is indexed automatically into the **Tasks**, **Projects**, **Tags** and
**People** views. Your markdown is the only source of truth — the index is
rebuildable at any time (`Ripple: Rebuild Index`).

## Commands

| Command | Keybinding |
|---|---|
| Ripple: Quick Capture | `Ctrl/Cmd+Alt+R` |
| Ripple: Open Today | `Ctrl/Cmd+Alt+T` |
| Ripple: Toggle Task | `Ctrl/Cmd+Alt+Enter` |
| Ripple: Search Notes | `Ctrl/Cmd+Alt+F` |

No telemetry. No cloud. Your notes never leave your machine.
