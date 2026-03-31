# World Cup Fantasy Scoring Engine - Verification Guide

## What Was Built

A **Node-based build-time scoring engine** that:
- Reads canonical tournament data from `/Data/*.json` 
- Calculates team points based on match results and settings
- Aggregates points into entrant leaderboards
- Generates static JSON outputs for the static site to consume
- Runs at build time (pre-deployment) for reproducible, deterministic scoring
- Handles partial tournaments (matches with `null` scores are skipped)

## Architecture Quick Reference

```
/Data                           → Canonical tournament data (git-tracked)
  ├─ settings.json              → Point config & rules
  ├─ teams.json                 → Team roster (48 teams)
  ├─ matches.json               → All 64 scheduled matches
  ├─ results.json               → Partial match results (null = unplayed)
  ├─ entries.json               → Entrant picks & tie-breakers
  ├─ teamPoints.json            → GENERATED: points per team
  └─ entrantTotals.json         → GENERATED: leaderboard

/PickerGame/scripts/buildScores.js         → Orchestration script
/PickerGame/src/scoring/                   → Pure Node modules
  ├─ roundMapping.js            → Round normalization & helpers
  ├─ io.js                       → File loading/writing
  ├─ calculateTeamPoints.js      → Core scoring logic
  └─ calculateEntrantTotals.js   → Leaderboard aggregation
```

## How to Verify Locally

### 1. Run the scoring engine directly
```bash
cd PickerGame
node scripts/buildScores.js
```

**Expected output:**
```
🎯 World Cup Fantasy Scoring Engine
==================================================
✓ Loaded XX teams
✓ Loaded XX matches
✓ Loaded XX match results
✓ Loaded XX entries
✓ Calculated points for 48 teams
✓ Calculated totals for N entrants
✓ Written: ../Data/teamPoints.json
✓ Written: ../Data/entrantTotals.json
✓ Build complete!
```

### 2. Run via npm script
```bash
cd PickerGame
npm run build:score
```

**Why:** Verifies that `package.json` npm scripts are wired correctly.

### 3. Inspect generated outputs
```bash
# Check team points structure
cat ../Data/teamPoints.json | jq '.[0]'

# Check entrant leaderboard
cat ../Data/entrantTotals.json | jq '.[] | {entrantName, totalPoints, teamsRemaining}'
```

**Expected structure:**
```json
{
  "countryName": "Brazil",
  "totalPoints": 0,
  "byRound": { "GS1": 0, "GS2": 0, ... },
  "byCategory": { "win": 0, "draw": 0, "scoring": 0, ... }
}
```

### 4. Test with sample results
Edit `../Data/results.json` and add actual scores to one or two matches:

```json
{
  "matchId": "M001",
  "homeScore": 2,
  "awayScore": 1,
  "homeYellow": 1,
  "awayYellow": 0,
  "homeRed": 0,
  "awayRed": 0,
  "homeQualified": true,
  "awayQualified": false
}
```

Then run:
```bash
npm run build:score
```

**Verify:**
- Mexico (home) should have points for: win + 2 goals scored + 1 yellow card + qualify
- South Africa (away) should have points for: 1 goal conceded (negative)
- Check `teamPoints.json` for these teams' updated totals
- Check `entrantTotals.json` for updated leaderboard

### 5. Full build pipeline (with Vite)
```bash
npm run build
```

**What it does:**
- Runs `npm run build:score` (generate JSON outputs)
- Runs `npm run build` (Vite bundles UI)
- Output goes to `dist/` directory
- Generated JSON files should be copied to `dist/data/` (configure via Vite if needed)

## Verifying Key Functionality

### ✅ Point Calculation Logic
Points are calculated per team per match for:
- `win` (e.g., +5 pts)
- `draw` (e.g., +2 pts)
- Goals scored (e.g., +3 per goal)
- Goals conceded (e.g., -2 per goal)
- Yellow cards (e.g., -1)
- Red cards (e.g., -2)
- Qualify to next round (e.g., +5 pts)
- Qualify to knockout (bonus from group stage, e.g., +10 pts)
- Win Final (e.g., +15 pts)

**Test:** Add a result, run, and verify `byCategory` totals in `teamPoints.json`.

### ✅ Entrant Aggregation
- Entrant score = sum of their 8 selected teams' points
- Team breakdown = list showing each pick + their points
- Teams remaining = count of teams not yet eliminated in knockout
- Tie-breakers preserved from entries.json

**Test:** Add results, run, and verify `entrantTotals.json` shows aggregated scores and `teamBreakdown` array.

### ✅ Round Mapping
Matches use various round formats; engine normalizes to:
- `GS1`, `GS2`, `GS3` (group stage)
- `R32`, `R16`, `QF`, `SF`, `F` (knockout)

If a match has `roundCode` field, it's used directly. Otherwise `round` is parsed.

**Test:** Inspect matches.json and verify all rounds parse without errors.

### ✅ Elimination Logic
A team is "eliminated" if:
- It appears in a knockout match result 
- AND that result has `qualified: false`

Teams with no knockout result yet = "remaining".

**Test:** Add knockout match results and verify `teamsRemaining` drops correctly.

### ✅ Error Handling
The engine will throw descriptive errors for:
- Missing/invalid input files
- Team ID not found in teams.json (for matches with results)
- Entrant picked a team not in teams.json
- Duplicate matchIds in results.json

**Test:** Modify entries.json to pick a non-existent team, run, and see error message.

## Deploying to Netlify

1. **Connect repo** to Netlify (linked to GitHub)

2. **Build command** (set in Netlify UI or netlify.toml):
   ```
   npm run build
   ```

3. **Publish directory**: `dist`

4. **Environment** (optional):
   - `NODE_VERSION`: `20.10.0` (set in netlify.toml)

5. **Updating results**:
   - Edit `../Data/results.json` in your repo
   - Commit and push to main branch
   - Netlify automatically triggers a deploy
   - Build runs: `npm run build:score` (generates new JSON) + Vite build
   - New leaderboard goes live within minutes

### Cache headers (netlify.toml)
- **Generated JSON**: 60-second TTL + stale-while-revalidate (fast updates)
- **HTML**: 5-minute TTL (discovers fresh leaderboard quickly)
- **Assets**: 1-year immutable (Vite content-hash)

## Files to Commit to Git

```
✅ Commit to git:
  PickerGame/src/scoring/                  → Core logic
  PickerGame/scripts/buildScores.js        → Build orchestration
  PickerGame/package.json                  → Scripts
  PickerGame/netlify.toml                  → Deployment config
  PickerGame/vite.config.js                → (if present)
  Data/settings.json                       → Tournament rules
  Data/teams.json                          → Team list
  Data/matches.json                        → Schedule
  Data/entries.json                        → Entrant picks

❌ Do NOT commit to git:
  Data/results.json                        → Auto-generated (or version-controlled separately)
  Data/teamPoints.json                     → Generated at build-time
  Data/entrantTotals.json                  → Generated at build-time
  PickerGame/dist/                         → Build output
  PickerGame/node_modules/                 → Dependencies
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ENOENT: no such file or directory` | Check file paths are absolute. Verify `../Data/` exists. |
| `Invalid JSON in ...` | Run `cat Data/settings.json | jq .` to validate JSON. |
| `Unknown team: ...` | Verify team exists in teams.json (check groupId or countryName). |
| `Duplicate matchId` | Check results.json for repeated matchId values. |
| Build works locally but fails on Netlify | Verify Node version (20.10.0) and `npm run build` in CI. |
| Leaderboard doesn't update after pushing results | Check netlify.toml cache headers; may need manual cache purge. |

## ES Modules & No DOM

- All code uses `import/export` (ES modules)
- No `window`, `document`, or DOM APIs
- No `require()` or CommonJS
- `package.json` specifies `"type": "module"`
- Runs only in Node (build-time), not in browser

## Next Steps

1. **Populate results.json** → Add match scores as tournament progresses
2. **Verify output** → Run `npm run build:score` and check generated JSON
3. **Review leaderboard** → Use any JSON viewer or `jq` to inspect entrant standings
4. **Deploy to Netlify** → Push to repo; Netlify deploys automatically
5. **Monitor results** → Each time you update results.json and push, the site rebuilds

---

**Questions?** The code is fully JSDoc-documented. Check any function's comments for purpose, parameters, and error cases.
