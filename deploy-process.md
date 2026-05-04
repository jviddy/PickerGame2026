# Deploy Process — PickerGame2026

## Architecture overview

- **Cloudflare Pages** serves the live site (static HTML + Worker functions)
- **GitHub** holds the code and data files
- **Cloudflare D1** (`pickergame2026-entries`) is the live database for entry submissions
- **`publish-entries.yml`** (GitHub Actions) is the **only** workflow that deploys to Cloudflare Pages

> The "pages build and deployment" workflow visible in GitHub Actions is GitHub Pages (Jekyll) and does **not** affect the Cloudflare site at all. Ignore it.

---

## When you update code (HTML, functions, scripts, src)

### Automatic path (preferred)

1. Make your changes
2. `git add <files> && git commit -m "..."` 
3. `git push origin main`

The `publish-entries.yml` workflow triggers automatically on push when any of these paths change:
- `PickerGame/**.html`
- `PickerGame/functions/**`
- `PickerGame/scripts/**`
- `PickerGame/src/**`
- `.github/workflows/publish-entries.yml`

The workflow takes ~30 seconds. Watch progress at:
`https://github.com/jviddy/PickerGame2026/actions`

### Manual path (if auto-deploy doesn't trigger or you need it immediately)

Run from the `PickerGame/` directory:

```sh
npm run entries:publish
```

This exports entries from D1, rebuilds all scoring data, and deploys to Cloudflare Pages in one step.

---

## When you update match results (via admin-results page)

1. Submit the result in the admin-results UI
2. The API saves the result to `Data/results.json` in GitHub via a commit
3. A `workflow_dispatch` is triggered automatically by the API — this runs `publish-entries.yml`, rebuilds scores, and redeploys

No manual steps needed.

---

## When you update payment status (via admin page)

1. Check/uncheck entries as paid in the admin UI
2. Click **Update status**
3. The API saves paid flags to D1 and triggers `publish-entries.yml` automatically

No manual steps needed.

---

## When you add a D1 database migration

1. Create a new file in `PickerGame/migrations/` (e.g. `0003_my_change.sql`)
2. Apply it to the live database:

```sh
cd PickerGame
npx wrangler d1 migrations apply pickergame2026-entries --remote
```

---

## If changes aren't showing on the live site

1. Hard refresh in the browser: **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows)
2. Check the Actions tab — confirm "Publish entries" (not "pages build and deployment") completed with a green tick
3. If the workflow didn't run, trigger it manually: `npm run entries:publish` from `PickerGame/`

---

## Key commands

| Task | Command (run from `PickerGame/`) |
|------|----------------------------------|
| Full deploy (export + build + deploy) | `npm run entries:publish` |
| Export entries from D1 only | `npm run entries:export` |
| Rebuild scores only | `npm run build:score` |
| Build static files only | `npm run build:static` |
| Apply D1 migrations | `npx wrangler d1 migrations apply pickergame2026-entries --remote` |

---

## File layout

```
PickerGame2026/
├── Data/                        # Source of truth for JSON data (scores, results, entries)
├── PickerGame/
│   ├── Data/                    # Mirror of root Data/ (written by buildScores.js)
│   ├── dist/                    # Built output — gitignored, rebuilt on every deploy
│   ├── functions/api/           # Cloudflare Worker functions
│   │   ├── admin/entries.js     # GET admin entries list
│   │   ├── admin/update-paid.js # POST save paid status + trigger publish
│   │   ├── admin/publish.js     # POST trigger publish only
│   │   ├── admin/results.js     # POST save match result + trigger publish
│   │   └── results.js           # GET live results (reads from GitHub API, 30s cache)
│   ├── scripts/
│   │   ├── buildScores.js       # Calculates all scoring data from Data/
│   │   ├── exportEntriesFromD1.js  # Pulls entries from D1 into Data/entries.json
│   │   └── prepareCloudflarePages.js  # Copies HTML + Data into dist/
│   ├── migrations/              # D1 SQL migration files
│   └── *.html                   # Page files (copied to dist/ on build)
└── .github/workflows/
    └── publish-entries.yml      # The only workflow that deploys to Cloudflare
```
