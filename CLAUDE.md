# PickerGame2026 — Claude instructions

## Deploy rules (read before every code change)

After any code change to HTML, functions, scripts, or src files:

1. `git add <files> && git commit && git push origin main`
2. This auto-triggers `publish-entries.yml` which deploys to Cloudflare Pages (~30 sec)
3. If the user reports changes aren't live, run `npm run entries:publish` from `PickerGame/` to force a local deploy

**Never** assume the "pages build and deployment" GitHub Actions run is a Cloudflare deploy — it is GitHub Pages (Jekyll) and does not affect the live site.

After pushing, always tell the user the deploy will auto-trigger and how to watch it at:
`https://github.com/jviddy/PickerGame2026/actions`

## Project architecture

- Live site: Cloudflare Pages (static HTML + Workers in `PickerGame/functions/`)
- Database: Cloudflare D1 `pickergame2026-entries` (entry submissions + paid status)
- Source of truth for match results/scores: `Data/results.json` in GitHub
- Build pipeline: `exportEntriesFromD1.js` → `buildScores.js` → `prepareCloudflarePages.js` → `wrangler pages deploy dist`

## Key facts

- `dist/` is gitignored — always rebuilt on deploy
- `Data/` (root) is the canonical data source; `PickerGame/Data/` is a mirror written by `buildScores.js`
- Only paid entries appear on the leaderboard (filtered in `buildScores.js`)
- All entries (paid + pending) appear on the public `/entries` page via `publicEntries.json`
- D1 migrations go in `PickerGame/migrations/` and must be applied manually with `npx wrangler d1 migrations apply pickergame2026-entries --remote`

## Full deploy details

See [deploy-process.md](deploy-process.md)
