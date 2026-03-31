Pickergame – World Cup Fantasy Football Website
Project Context
Build a complete, production-ready static website called Pickergame for a World Cup fantasy football competition. This is a real long-term project, not a demo. Code must be clean, modular, well-documented, and maintainable.
Brand name: Pickergame
Design: No existing brand assets. Create a clean, modern, sports-themed design. Use a bold primary colour (e.g. deep green or navy), strong typography, and a dark/light mode toggle. Mobile-first, fully responsive.

Tech Stack

Vanilla JS (no framework) — justification: zero build tooling, easiest long-term maintenance for a non-dev, works natively on any static host
JSON files for all data storage
No backend, no database, no auth
Must deploy and work on Netlify, Vercel, or GitHub Pages
Use ES modules (type="module") — no bundler required
CSS: custom properties (variables) for theming, no external CSS framework required but lightweight ones (e.g. PicoCSS) are acceptable if justified


Folder Structure
Use this exact structure:
/pickergame
├── /data
│   ├── settings.json
│   ├── teams.json
│   ├── matches.json
│   ├── results.json
│   ├── entries.json          # populated via Netlify Forms / serverless function
│   ├── blog.json
│   └── teamPoints.json       # derived, rebuilt by scoring engine
├── /src
│   ├── scoring.js            # pure scoring logic, no DOM
│   ├── leaderboard.js        # leaderboard data processing
│   ├── entry.js              # entry form logic
│   ├── schedule.js           # schedule/results display
│   ├── blog.js               # blog rendering
│   └── utils.js              # shared helpers (fetch JSON, format dates, etc.)
├── /pages
│   ├── index.html            # Entry form
│   ├── leaderboard.html
│   ├── schedule.html
│   └── blog.html
├── /assets
│   ├── /flags                # flag images (e.g. gb.svg, fr.svg)
│   ├── /css
│   │   └── main.css
│   └── /js
│       └── nav.js            # shared navigation component
├── netlify.toml              # Netlify config
└── README.md

Data Models
settings.json
json{
  "eventName": "Pickergame World Cup 2026",
  "signupStart": "2026-05-01T00:00:00Z",
  "signupEnd": "2026-06-10T23:59:59Z",
  "teamsToPick": 8,
  "budget": 130,
  "numberOfTieBreakers": 2,
  "tieBreakerQuestions": [
    "How many total goals will be scored in the tournament?",
    "Time of the last goals scored in the tournament (minutes)?"
  ],
  "tieBreakerValidationFormat": ["integer", "integer"],
  "points": {
    "win": 5,
    "draw": 2,
    "lose": 0,
    "goalScored": 3,
    "goalConceded": -2,
    "yellowCard": -1,
    "redCard": -2,
    "qualifyKnockout": 10,
    "qualifyNextRound": 5,
    "winFinal": 15
  }
}
teams.json
json[
  {
    "countryName": "Brazil",
    "group": "A",
    "groupId": "A1",
    "fifaRank": 1,
    "cost": 12,
    "flagUrl": "/assets/flags/br.svg"
  }
]
matches.json
json[
  {
    "matchId": "M001",
    "date": "2026-06-12T18:00:00Z",
    "round": "Group Stage 1",
    "roundCode": "GS1",
    "location": "New York",
    "homeTeam": "Brazil",
    "awayTeam": "Argentina"
  }
]
results.json
json[
  {
    "matchId": "M001",
    "homeScore": 2,
    "awayScore": 1,
    "homePenalties": 0,
    "awayPenalties": 0,
    "homeYellow": 1,
    "awayYellow": 2,
    "homeRed": 0,
    "awayRed": 0,
    "homeQualified": true,
    "awayQualified": false
  }
]
entries.json
json[
  {
    "entrantName": "Jane Smith",
    "email": "jane@example.com",
    "teamName": "Jane's XI",
    "tieBreakerAnswers": ["145", "Mbappe"],
    "selectedTeams": ["Brazil", "France", "England", "Spain", "Germany"],
    "submittedAt": "2026-05-15T10:30:00Z"
  }
]
teamPoints.json (derived — do not edit manually)
json{
  "Brazil": {
    "total": 24,
    "byRound": {
      "GS1": 4, "GS2": 3, "GS3": 4, "R32": 5, "R16": 3, "QF": 0, "SF": 0, "F": 0
    },
    "byCategory": {
      "win": 9, "draw": 0, "goalScored": 6, "goalConceded": -2,
      "yellowCard": -1, "redCard": 0, "progression": 12
    }
  }
}
blog.json
json[
  {
    "slug": "welcome-to-pickergame",
    "title": "Welcome to Pickergame",
    "date": "2026-05-01",
    "author": "Admin",
    "content": "Markdown or HTML string here..."
  }
]

Page Specifications
1. Entry Form (index.html)

Show/hide the form based on signupStart / signupEnd from settings.json. Outside this window show an appropriate message (e.g. "Entries closed" or "Opens soon").
Form fields:

Entrant Name (required, text)
Email (required, valid email format)
Team Name (required, text)
Tie breaker answers — dynamically render from settings.json. Validate against tieBreakerValidationFormat (supported types: integer, text, decimal).


Team selection grid:

Dynamically rendered from teams.json
Sort controls: By Group | Alphabetical | By Cost (desc)
Each team card shows: flag image, country name, FIFA rank, cost
Click to select/deselect (toggle highlight)
Live UI counters: budget spent, budget remaining, teams selected, teams remaining
Enforce max teams and max budget from settings.json — prevent selecting over limits


Validation before submit: Email format, correct team count, within budget, tie breaker formats.
Submission approach: Use Supabase as the backend for form submissions. On submit, the form data is written directly to a Supabase table via the Supabase JS client (no serverless function required for basic inserts).
On success, show a confirmation panel with the entrant's selected teams and a live list of all current entrants fetched directly from Supabase, ordered by entry time descending. The entrants list should display name and team name only (not picks, to preserve competitive integrity until the deadline).
Supabase table: entries — columns: id, name, team_name, email, q1, q2, picks (JSON array of 8), created_at.
Row Level Security: Enable RLS on the entries table. Allow public INSERT (for form submissions) and public SELECT on name/team_name/created_at only. Email and picks are not exposed in the public read policy.
End of entry period: Export all data from Supabase as JSON using the Supabase dashboard export or a one-time script. This JSON becomes the static entries.json used for the rest of the game. Supabase is no longer required after export and the project can be paused on the free tier.
Environment variables: Store SUPABASE_URL and SUPABASE_ANON_KEY in Vercel project settings. These are safe to use client-side given the RLS policies above.


2. Leaderboard (leaderboard.html)

Rebuilt from entries.json + teamPoints.json on every page load (client-side)
Main leaderboard table:

Columns always visible: Rank, Entrant Team Name, Entrant Name, Teams Still In, Total Points
Toggleable column groups (toggle buttons above table):

Round breakdown: GS1, GS2, GS3, R32, R16, QF, SF, F
Team breakdown: one column per selected team showing team name + points


Sort: Total Points descending; ties broken by tie breaker answers in order


Secondary leaderboard: separate table showing each country's total points, with expandable breakdown by round and points category


3. Schedule & Results (schedule.html)

Rendered from matches.json + results.json
Group matches by round
Each match shows: date/time (user's local timezone), location, home vs away team with flags
If result exists: show score, yellow cards, red cards, qualification indicators
Visual distinction between completed, live (within 2hrs of kickoff), and upcoming matches
Filter controls: by round, by team


4. Blog (blog.html)

Rendered from blog.json
Reverse chronological order
Each post: title, author, date, full content (render as HTML)
Simple, readable layout — no pagination required initially


Scoring Engine (src/scoring.js)
Implement as pure functions, no DOM, no side effects. Must be:

Deterministic and re-runnable
Importable by both browser and a Node.js build script

js// Core exports required:
calculateTeamPoints(matches, results, settings) → teamPoints object
calculateEntrantTotals(entries, teamPoints) → sorted leaderboard array
rebuildDerivedData(matches, results, entries, settings) → { teamPoints, leaderboard }
The scoring engine must handle:

Points for win / draw / loss
Points per goal scored / conceded (per team per match)
Yellow and red card deductions
Qualification bonuses (per round reached)
Winning the final bonus
Graceful handling of missing results (team not yet played = 0 points, not an error)


Deployment Strategy
Primary: Netlify (recommended)

Push repo to GitHub
Connect to Netlify — auto-deploys on every push
Use Netlify Forms for entry submission
To update results: edit results.json locally → commit → push → Netlify rebuilds automatically
teamPoints.json is either:

Option A (simpler): Recalculated client-side on every page load from raw JSON
Option B (faster at scale): A pre-build Node script (scripts/build-scores.js) runs via Netlify build command and writes teamPoints.json before deploy



Implement Option A by default. Scaffold Option B as a commented script.
netlify.toml example:
toml[build]
  publish = "."

Code Quality Requirements

All JS in ES modules — no globals
Each .js file has a module-level JSDoc comment explaining its purpose
Functions have JSDoc param/return annotations
No console.log left in production code (use a DEBUG flag constant)
Defensive: all JSON fetches wrapped in try/catch with user-visible error states
CSS: use custom properties for all colours, spacing, and font sizes
No inline styles in HTML


Implementation Order
Build in this order to allow incremental testing:

Data files (all JSON with realistic sample data — at least 8 teams, 4 matches, 2 entries)
utils.js — shared fetch/format helpers
scoring.js — pure logic, tested with sample data
main.css — full design system (variables, typography, components)
nav.js — shared navigation
schedule.html + schedule.js — simplest page, good smoke test
blog.html + blog.js
leaderboard.html + leaderboard.js
index.html + entry.js — most complex, do last
netlify.toml + README.md


README Requirements
Include:

Project overview
How to run locally (npx serve . or similar — no build step required)
How to update teams, matches, results
How entries work (Netlify Forms)
How to add a blog post
Scoring rules explained in plain English


What Not to Build (out of scope)

Admin UI
Authentication
Real-time updates / WebSockets
Comments system
Payment handling


Build this as a long-term maintainable project. Prefer clarity over cleverness. When in doubt, add a comment.